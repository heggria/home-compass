/**
 * BaseLayer — cyber-grid ground plane + neon envelope ring around the data
 * envelope.
 *
 * The grid is drawn with a custom shader that produces sharp antialiased
 * lines at any zoom level (no moiré, fades naturally into fog). This is
 * what makes the empty space feel like "you're standing inside something",
 * not just floating in a void.
 */

import * as THREE from "three";
import type { LayerSetupContext, MapLayer } from "../core/types";
import { repo } from "../data/repo";
import { sceneColors, z } from "../tokens/design";

const SIZE = 60_000;

export class BaseLayer implements MapLayer {
  readonly id = "base";
  readonly label = "底图";
  readonly order = 0;
  readonly group = "base" as const;
  readonly pickable = false;
  readonly defaultVisible = true;

  private group3 = new THREE.Group();
  private gridMat?: THREE.ShaderMaterial;
  private startTime = performance.now();

  async setup({ scene, projector }: LayerSetupContext) {
    // ---- Cyber grid (shader plane) ----
    this.gridMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uMinor: { value: new THREE.Color(sceneColors.gridMinor) },
        uMajor: { value: new THREE.Color(sceneColors.gridMajor) },
        uGlow: { value: new THREE.Color(sceneColors.gridGlow) },
        uBg: { value: new THREE.Color(sceneColors.ground) },
        uMinorSpacing: { value: 250.0 },   // 250 m grid → ~1 city block
        uMajorSpacing: { value: 1000.0 },  // 1 km
        uFadeStart: { value: 4000.0 },     // distance from origin where grid begins fading
        uFadeEnd: { value: 22000.0 },
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
        uniform float uTime;
        uniform vec3 uMinor;
        uniform vec3 uMajor;
        uniform vec3 uGlow;
        uniform vec3 uBg;
        uniform float uMinorSpacing;
        uniform float uMajorSpacing;
        uniform float uFadeStart;
        uniform float uFadeEnd;
        varying vec3 vWorld;

        // Antialiased grid line in 1D (fwidth-based)
        float gridLine(float coord, float spacing) {
          float c = coord / spacing;
          float g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
          return 1.0 - clamp(g, 0.0, 1.0);
        }

        void main() {
          float minor = max(gridLine(vWorld.x, uMinorSpacing), gridLine(vWorld.z, uMinorSpacing));
          float major = max(gridLine(vWorld.x, uMajorSpacing), gridLine(vWorld.z, uMajorSpacing));
          // distance from origin → fade out into fog
          float d = length(vWorld.xz);
          float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, d);

          // Slowly pulsing glow on the major lines (very subtle)
          float pulse = 0.5 + 0.5 * sin(uTime * 0.6);
          vec3 majorCol = mix(uMajor, uGlow, 0.25 + 0.25 * pulse);

          // Compose: minor underlay → major overlay
          vec3 col = uBg;
          col = mix(col, uMinor, minor * 0.55 * fade);
          col = mix(col, majorCol, major * 0.85 * fade);

          // Slight vignette / ambient floor
          float alpha = 1.0;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), this.gridMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = z.ground;
    ground.renderOrder = -10;
    this.group3.add(ground);

    // ---- Envelope: neon ring around the data bbox ----
    try {
      const stats = await repo.stats();
      const corners: Array<{ lng: number; lat: number }> = [
        { lng: stats.lon_min, lat: stats.lat_min },
        { lng: stats.lon_max, lat: stats.lat_min },
        { lng: stats.lon_max, lat: stats.lat_max },
        { lng: stats.lon_min, lat: stats.lat_max },
      ];
      const pad = 600; // m
      const projected = corners.map((c) => projector.project(c));
      // axis-aligned in world: roads are essentially N/S so this is fine.
      const xs = projected.map((p) => p.x);
      const zs = projected.map((p) => p.z);
      const minX = Math.min(...xs) - pad;
      const maxX = Math.max(...xs) + pad;
      const minZ = Math.min(...zs) - pad;
      const maxZ = Math.max(...zs) + pad;
      const verts = new Float32Array([
        minX, z.ground + 0.6, minZ,
        maxX, z.ground + 0.6, minZ,
        maxX, z.ground + 0.6, minZ,
        maxX, z.ground + 0.6, maxZ,
        maxX, z.ground + 0.6, maxZ,
        minX, z.ground + 0.6, maxZ,
        minX, z.ground + 0.6, maxZ,
        minX, z.ground + 0.6, minZ,
      ]);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      const m = new THREE.LineBasicMaterial({
        color: sceneColors.envelopeNeon,
        transparent: true,
        opacity: 0.7,
      });
      const ring = new THREE.LineSegments(g, m);
      ring.renderOrder = -8;
      this.group3.add(ring);
    } catch {
      // stats.json missing — skip envelope
    }

    scene.add(this.group3);
  }

  setVisibility(v: boolean) {
    this.group3.visible = v;
  }

  update() {
    if (this.gridMat) {
      this.gridMat.uniforms.uTime.value = (performance.now() - this.startTime) / 1000;
    }
  }

  dispose() {
    this.group3.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
  }
}
