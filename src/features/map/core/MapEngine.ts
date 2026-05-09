/**
 * MapEngine — orchestrates the three.js scene, the camera, picking and
 * the layer lifecycle.
 *
 * Engine has zero knowledge of any specific layer. It pulls a list of
 * layer factories from the registry, builds the scene graph, and forwards
 * input + store signals to the layers.
 */

import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
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
  /**
   * Half of the larger side of the data envelope, in meters. When set,
   * the engine sizes the initial camera distance + maxDistance so the
   * whole envelope fits on screen with a comfortable margin.
   */
  framingHalfSpanMeters?: number;
}

const DEFAULT_CENTER: LngLat = { lng: 116.397, lat: 39.9 };

export class MapEngine {
  readonly canvas: HTMLCanvasElement;
  readonly scene = new THREE.Scene();
  readonly projector: Projector;

  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: MapControls;

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
  /** Detach functions for input handlers (modifier swap, trackpad gestures…). */
  private inputCleanups: Array<() => void> = [];

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
    this.renderer.toneMappingExposure = 0.95;

    // Scene + cyberpunk gradient sky-dome (rendered as inverted icosahedron
    // shader so the horizon stays violet-magenta even as the camera tilts).
    this.scene.background = new THREE.Color(sceneColors.skyTop);
    this.scene.fog = new THREE.FogExp2(sceneColors.fog, 0.000045);
    this.addSkyDome();

    // Lights — moody. Magenta key from the south-west "horizon" + cyan rim
    // from above gives violet shadows and cyan highlights on the district
    // tops. Ambient is intentionally low so emissive halos pop.
    const ambient = new THREE.AmbientLight(0x6c7bff, 0.35);
    const key = new THREE.DirectionalLight(0xff6b9f, 0.55);
    key.position.set(-2200, 3000, -1800);
    const rim = new THREE.DirectionalLight(0x5be7f0, 0.45);
    rim.position.set(2400, 2200, 2400);
    const sky = new THREE.HemisphereLight(0xa872ff, 0x05060d, 0.4);
    this.scene.add(ambient, key, rim, sky);

    // Camera — 50° feels closer to a cinematic DSLR than 45°
    const { clientWidth: w, clientHeight: h } = this.canvas;
    // Default to a "looks good for ~12 km Beijing crop" frame; bump it
    // out when caller supplies framingHalfSpanMeters (covers the 6th
    // ring's ~30 km half-span).
    const halfSpan = opts.framingHalfSpanMeters ?? 6_000;
    // Empirical: the camera ends up roughly half-span * 1.7 away on the
    // diagonal at 50° FOV with a comfortable top-down tilt.
    const initDist = Math.max(3_500, halfSpan * 1.7);
    const farPlane = Math.max(60_000, halfSpan * 12);
    this.camera = new THREE.PerspectiveCamera(50, w / h, 5, farPlane);
    this.camera.position.set(initDist * 0.45, initDist * 0.78, initDist * 0.74);
    this.camera.lookAt(0, 0, 0);

    // Controls — City-Skylines style:
    //   left-drag      → pan (XZ plane)
    //   ⌘ + left-drag  → orbit / rotate
    //   right-drag     → orbit / rotate (also)
    //   wheel          → dolly (zoom)
    //   trackpad 2-finger drag → pan
    //   trackpad 3-finger drag → rotate
    //
    // We use MapControls (the OrbitControls subclass tuned for top-down)
    // and rebind mouseButtons. The Cmd-modifier swap is implemented by
    // toggling controls.mouseButtons on keydown/keyup (see below).
    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 600;
    this.controls.maxDistance = Math.max(22_000, halfSpan * 4);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.target.set(0, 0, 0);
    this.controls.zoomSpeed = 1.1;
    this.controls.rotateSpeed = 0.9;
    this.controls.panSpeed = 1.0;
    this.controls.screenSpacePanning = false; // pan along world XZ, not view-plane
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    // Touch: one finger pans, two fingers dolly+rotate (Skylines-friendly).
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };
    this.installModifierBindings();
    this.installTrackpadGestures();

    // Postprocessing — calibrated bloom. Strength dialed down so glowing
    // sprites read as glints not white-out; threshold raised so only
    // genuine highlights bleed.
    if (opts.enableBloom !== false) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        0.55, // strength
        0.7,  // radius
        0.78, // threshold — only the top ~22% of luminance bleeds
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

  /**
   * Cmd / Meta swap: while held, left-drag rotates instead of pans, so
   * power users can spin the camera without leaving the left mouse button.
   * Right-drag still rotates regardless (matches Skylines / Cesium).
   */
  private installModifierBindings() {
    const enterRotate = () => {
      this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      this.canvas.style.cursor = "grab";
    };
    const exitRotate = () => {
      this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      // Meta = ⌘ on macOS, Win key on Windows; Control covers Linux/Win parity.
      if (e.metaKey || e.ctrlKey) enterRotate();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) exitRotate();
    };
    const onBlur = () => exitRotate();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    this.inputCleanups.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    });
  }

  /**
   * Trackpad gestures (Mac magic trackpad / Windows precision touchpad):
   *
   *   2-finger drag        → pan         (browser fires `wheel` with deltaX/Y)
   *   2-finger pinch       → zoom        (handled natively by MapControls' wheel)
   *   2-finger drag + ⌘    → rotate      (modifier swap, see installModifierBindings)
   *   3-finger drag        → rotate      (we listen to gesture events when present;
   *                                       fallback path: shift + drag)
   *
   * Note: browsers do NOT expose 3-finger drag as a discrete event on most
   * platforms (it gets eaten by the OS for Mission Control). The realistic
   * path on Mac is "2-finger drag + ⌘", which the modifier binding covers.
   * To still honour the user's request we also accept Shift + 2-finger drag
   * as a rotation gesture so trackpad users have a no-Cmd path.
   */
  private installTrackpadGestures() {
    const ROTATE_DEG_PER_PX = 0.4;
    const onWheel = (e: WheelEvent) => {
      // We only act on horizontal-dominant wheel events (typical 2-finger
      // drag) when Shift is held — that's our "rotate without Cmd" gesture.
      // Vertical wheel is left to MapControls' default zoom behavior.
      if (!e.shiftKey) return;
      // If the user holds Shift while spinning the wheel they want to rotate,
      // not zoom. Prevent default so MapControls doesn't dolly.
      e.preventDefault();
      const az = (e.deltaX || 0) * ROTATE_DEG_PER_PX * (Math.PI / 180);
      const el = (e.deltaY || 0) * ROTATE_DEG_PER_PX * (Math.PI / 180);
      // OrbitControls exposes spherical-coords helpers via internal methods,
      // but they're not part of the public API. Easiest cross-version path
      // is to mutate the camera position around the target.
      const offset = new THREE.Vector3()
        .copy(this.camera.position)
        .sub(this.controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.theta -= az;
      sph.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, sph.phi - el));
      offset.setFromSpherical(sph);
      this.camera.position.copy(this.controls.target).add(offset);
      this.camera.lookAt(this.controls.target);
    };
    this.canvas.addEventListener("wheel", onWheel, { passive: false });
    this.inputCleanups.push(() => {
      this.canvas.removeEventListener("wheel", onWheel);
    });
  }

  private addSkyDome() {
    const geom = new THREE.SphereGeometry(50_000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        topColor: { value: new THREE.Color(sceneColors.skyTop) },
        midColor: { value: new THREE.Color(sceneColors.skyMid) },
        horizonColor: { value: new THREE.Color(sceneColors.skyHorizon) },
        offset: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        varying vec3 vWorld;
        void main() {
          // height factor 0 at horizon → 1 at zenith
          float h = clamp(normalize(vWorld).y * 0.5 + 0.5, 0.0, 1.0);
          // smooth two-stop blend (horizon → mid → top)
          vec3 lower = mix(horizonColor, midColor, smoothstep(0.05, 0.45, h));
          vec3 col = mix(lower, topColor, smoothstep(0.45, 1.0, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const dome = new THREE.Mesh(geom, mat);
    dome.renderOrder = -100;
    dome.frustumCulled = false;
    this.scene.add(dome);
  }

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
    this.inputCleanups.forEach((fn) => fn());
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
