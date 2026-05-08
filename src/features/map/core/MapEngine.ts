/**
 * MapEngine — orchestrates the three.js scene, the camera, picking and
 * the layer lifecycle.
 *
 * Engine has zero knowledge of any specific layer. It pulls a list of
 * layer factories from the registry, builds the scene graph, and forwards
 * input + store signals to the layers.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

import type { FrameContext, LngLat, MapEntity, MapLayer, Projector } from "./types";
import { listLayerRegistrations } from "./registry";
import { EquirectProjector } from "../projection/EquirectProjector";
import { useMapStore } from "../store/mapStore";
import { sceneColors, motion } from "../tokens/design";

export interface MapEngineOptions {
  /** map center; defaults to a sensible Beijing point */
  center?: LngLat;
  enableBloom?: boolean;
  pixelRatio?: number;
}

const DEFAULT_CENTER: LngLat = { lng: 116.34, lat: 40.07 };

export class MapEngine {
  readonly canvas: HTMLCanvasElement;
  readonly scene = new THREE.Scene();
  readonly projector: Projector;

  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private composer?: EffectComposer;
  private layers = new Map<string, MapLayer>();
  private raycaster = new THREE.Raycaster();
  private pointerNDC = new THREE.Vector2();
  private pointerOver = false;

  private rafHandle = 0;
  private lastTime = performance.now();
  private startTime = performance.now();
  private resizeObserver?: ResizeObserver;
  private storeUnsub: Array<() => void> = [];

  /** Externally provided callback so React can plug into hover events. */
  onHover?: (entity: MapEntity | null) => void;
  onSelect?: (entity: MapEntity | null) => void;

  constructor(canvas: HTMLCanvasElement, opts: MapEngineOptions = {}) {
    this.canvas = canvas;
    this.projector = new EquirectProjector(opts.center ?? DEFAULT_CENTER);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(opts.pixelRatio ?? Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // Scene
    this.scene.background = new THREE.Color(sceneColors.skyHorizon);
    this.scene.fog = new THREE.Fog(sceneColors.fog, 8000, 22000);

    // Lights — subtle, the look is mostly screen-space color
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const sun = new THREE.DirectionalLight(0xfff0d8, 0.65);
    sun.position.set(-3000, 5000, 2000);
    const fill = new THREE.HemisphereLight(0x9fb6ff, 0x101218, 0.35);
    this.scene.add(ambient, sun, fill);

    // Camera
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 5, 60_000);
    this.camera.position.set(2400, 4800, 4200);
    this.camera.lookAt(0, 0, 0);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 600;
    this.controls.maxDistance = 22_000;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.target.set(0, 0, 0);

    // Postprocessing
    if (opts.enableBloom !== false) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        0.55, // strength
        0.55, // radius
        0.85, // threshold
      );
      this.composer.addPass(bloom);
      this.composer.addPass(new OutputPass());
    }

    // Resize
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas);
    this.handleResize();

    // Pointer events
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointerleave", this.handlePointerLeave);

    void this.bootLayers();
    this.start();
  }

  // ------------------------------- bootstrap

  private async bootLayers() {
    const regs = listLayerRegistrations().sort(
      (a, b) => a.factory().order - b.factory().order, // factory called twice for sort + create — ok at boot
    );
    // Avoid double-instantiation; build once now in registration order
    for (const reg of regs) {
      const layer = reg.factory();
      try {
        await layer.setup({ scene: this.scene, projector: this.projector, engine: this });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[map] layer setup failed: ${layer.id}`, e);
        continue;
      }
      this.layers.set(layer.id, layer);
      // Register defaults into the store
      useMapStore.getState().registerLayer(layer.id, {
        visible: layer.defaultVisible,
        opacity: 1,
      });
      layer.setVisibility?.(layer.defaultVisible);
    }
    this.subscribeStore();
  }

  private subscribeStore() {
    this.storeUnsub.push(
      useMapStore.subscribe(
        (s) => s.layers,
        (layers) => {
          for (const id of Object.keys(layers)) {
            const layer = this.layers.get(id);
            if (!layer) continue;
            layer.setVisibility?.(layers[id].visible);
            layer.setOpacity?.(layers[id].opacity);
          }
        },
        { fireImmediately: true },
      ),
    );
    this.storeUnsub.push(
      useMapStore.subscribe(
        (s) => s.hover,
        (hover) => {
          for (const layer of this.layers.values()) {
            layer.setHover?.(hover && hover.source === layer.id ? hover.id : null);
          }
        },
      ),
    );
    this.storeUnsub.push(
      useMapStore.subscribe(
        (s) => s.selection,
        (sel) => {
          for (const layer of this.layers.values()) {
            layer.setSelection?.(sel && sel.source === layer.id ? sel.id : null);
          }
        },
      ),
    );
  }

  // ------------------------------- frame loop

  private start() {
    this.startTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - this.lastTime) / 1000;
      const time = (now - this.startTime) / 1000;
      this.lastTime = now;

      this.controls.update();

      const distance = this.camera.position.length();
      const zoom = Math.log2(Math.max(1, distance));
      const frame: FrameContext = { time, dt, camera: this.camera, zoom, engine: this };

      for (const layer of this.layers.values()) {
        layer.update?.(frame);
      }

      if (this.pointerOver) this.runPick();

      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);

      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  // ------------------------------- input & picking

  private handlePointerMove = (e: PointerEvent) => {
    this.pointerOver = true;
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };

  private handlePointerLeave = () => {
    this.pointerOver = false;
    useMapStore.getState().setHover(null);
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    let hit: MapEntity | null = null;
    for (const layer of this.layers.values()) {
      if (!layer.pickable) continue;
      const visible = useMapStore.getState().layers[layer.id]?.visible;
      if (!visible) continue;
      const e = layer.pick?.(this.raycaster);
      if (e) {
        hit = e;
        break;
      }
    }
    useMapStore.getState().setSelection(hit);
    this.onSelect?.(hit);
  };

  private runPick() {
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    let hit: MapEntity | null = null;
    for (const layer of this.layers.values()) {
      if (!layer.pickable) continue;
      const visible = useMapStore.getState().layers[layer.id]?.visible;
      if (!visible) continue;
      const e = layer.pick?.(this.raycaster);
      if (e) {
        hit = e;
        break;
      }
    }
    const prev = useMapStore.getState().hover;
    if (prev?.id !== hit?.id) {
      useMapStore.getState().setHover(hit);
      this.onHover?.(hit);
      this.canvas.style.cursor = hit ? "pointer" : "grab";
    }
  }

  // ------------------------------- camera helpers

  flyTo(target: { x: number; z: number }, distance = 2400, ms = motion.cameraFlyMs) {
    const start = {
      tx: this.controls.target.x,
      tz: this.controls.target.z,
      px: this.camera.position.x,
      py: this.camera.position.y,
      pz: this.camera.position.z,
    };
    // We aim camera at target offset toward camera direction
    const dir = new THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target)
      .normalize();
    const end = {
      tx: target.x,
      tz: target.z,
      px: target.x + dir.x * distance,
      py: Math.max(distance * 0.6, 600),
      pz: target.z + dir.z * distance,
    };
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      const k = ease(t);
      this.controls.target.set(
        start.tx + (end.tx - start.tx) * k,
        0,
        start.tz + (end.tz - start.tz) * k,
      );
      this.camera.position.set(
        start.px + (end.px - start.px) * k,
        start.py + (end.py - start.py) * k,
        start.pz + (end.pz - start.pz) * k,
      );
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }

  // ------------------------------- lifecycle

  private handleResize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.rafHandle);
    this.storeUnsub.forEach((fn) => fn());
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    for (const layer of this.layers.values()) {
      try {
        layer.dispose();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[map] dispose failed for ${layer.id}`, e);
      }
    }
    this.layers.clear();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
