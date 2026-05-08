/**
 * SubwayLayer — colored subway lines + station beads. Stations are
 * pickable; clicking one selects it as a `subwayStation` entity which
 * the Inspector and (in PR2) the reverse-highlight system uses.
 */

import * as THREE from "three";
import type { LayerSetupContext, MapEntity, MapLayer } from "../core/types";
import { repo, type SubwayLine, type PoiCategoryMap } from "../data/repo";
import { sceneColors, z } from "../tokens/design";

interface StationData {
  name: string;
  lng: number;
  lat: number;
  color: number;
  worldX: number;
  worldZ: number;
}

export class SubwayLayer implements MapLayer {
  readonly id = "subway";
  readonly label = "地铁";
  readonly order = 11;
  readonly group = "infrastructure" as const;
  readonly pickable = true;
  readonly defaultVisible = true;

  private group3 = new THREE.Group();
  private lineMaterials: THREE.LineBasicMaterial[] = [];
  private stations: StationData[] = [];
  private stationPoints!: THREE.Points;
  private stationGeom!: THREE.BufferGeometry;
  private hoverIndex = -1;
  private selectIndex = -1;
  private haloMesh!: THREE.Mesh;
  private haloMat!: THREE.MeshBasicMaterial;

  async setup({ scene, projector }: LayerSetupContext) {
    const [lines, poi] = await Promise.all([repo.subway(), repo.poi()]);

    // ----- lines -----
    for (const line of lines as SubwayLine[]) {
      if (!line.segs?.length) continue;
      const positions = new Float32Array((line.segs.length / 2) * 3);
      for (let i = 0, j = 0; i < line.segs.length; i += 2, j += 3) {
        const { x, z: zz } = projector.project({ lng: line.segs[i], lat: line.segs[i + 1] });
        positions[j] = x;
        positions[j + 1] = z.subway;
        positions[j + 2] = zz;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const colorHex = parseHexColor(line.color, sceneColors.subwayDefault);
      const m = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.95,
      });
      this.lineMaterials.push(m);
      const seg = new THREE.LineSegments(g, m);
      seg.renderOrder = 10;
      this.group3.add(seg);
    }

    // ----- stations as Points (1 draw call) -----
    const swStation = (poi as PoiCategoryMap).subway_station;
    if (swStation && swStation.items.length) {
      const stationColor = parseHexColor(swStation.color, sceneColors.subwayDefault);
      this.stations = swStation.items.map((it) => {
        const w = projector.project({ lng: it.lon, lat: it.lat });
        return { name: it.name, lng: it.lon, lat: it.lat, color: stationColor, worldX: w.x, worldZ: w.z };
      });
      const positions = new Float32Array(this.stations.length * 3);
      const colors = new Float32Array(this.stations.length * 3);
      this.stations.forEach((s, i) => {
        positions[i * 3] = s.worldX;
        positions[i * 3 + 1] = z.subway + 1;
        positions[i * 3 + 2] = s.worldZ;
        const r = ((s.color >> 16) & 0xff) / 255;
        const g = ((s.color >> 8) & 0xff) / 255;
        const b = (s.color & 0xff) / 255;
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      });
      this.stationGeom = new THREE.BufferGeometry();
      this.stationGeom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      this.stationGeom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

      const pointMat = new THREE.PointsMaterial({
        size: 28,
        vertexColors: true,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.95,
      });
      this.stationPoints = new THREE.Points(this.stationGeom, pointMat);
      this.stationPoints.renderOrder = 12;
      this.group3.add(this.stationPoints);
    }

    // ----- selection halo (radius ring rendered when a station is selected) -----
    const ringGeom = new THREE.RingGeometry(780, 820, 96);
    ringGeom.rotateX(-Math.PI / 2);
    this.haloMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.haloMesh = new THREE.Mesh(ringGeom, this.haloMat);
    this.haloMesh.position.y = z.serviceArea;
    this.haloMesh.visible = false;
    this.group3.add(this.haloMesh);

    scene.add(this.group3);
  }

  setVisibility(v: boolean) {
    this.group3.visible = v;
  }
  setOpacity(v: number) {
    for (const m of this.lineMaterials) m.opacity = v * 0.95;
    if (this.stationPoints) (this.stationPoints.material as THREE.PointsMaterial).opacity = v * 0.95;
  }

  setSelection(entityId: string | null) {
    if (!entityId) {
      this.selectIndex = -1;
      this.haloMesh.visible = false;
      return;
    }
    const idx = this.stations.findIndex((s) => `subway:${s.name}` === entityId);
    this.selectIndex = idx;
    if (idx >= 0) {
      const s = this.stations[idx];
      this.haloMesh.position.set(s.worldX, z.serviceArea, s.worldZ);
      this.haloMesh.visible = true;
      this.haloMat.opacity = 0.8;
    }
  }

  setHover(entityId: string | null) {
    this.hoverIndex = entityId
      ? this.stations.findIndex((s) => `subway:${s.name}` === entityId)
      : -1;
  }

  pick(raycaster: THREE.Raycaster): MapEntity | null {
    if (!this.stationPoints) return null;
    raycaster.params.Points = { threshold: 60 } as never;
    const hits = raycaster.intersectObject(this.stationPoints, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const i = hit.index ?? -1;
    if (i < 0 || i >= this.stations.length) return null;
    const s = this.stations[i];
    return {
      id: `subway:${s.name}`,
      kind: "subwayStation",
      title: s.name,
      subtitle: "地铁站",
      lngLat: { lng: s.lng, lat: s.lat },
      radius: 800,
      source: this.id,
      data: { name: s.name, lng: s.lng, lat: s.lat },
    };
  }

  dispose() {
    this.group3.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    this.lineMaterials.forEach((m) => m.dispose());
    if (this.stationPoints) (this.stationPoints.material as THREE.Material).dispose();
    this.haloMat.dispose();
  }
}

function parseHexColor(hex: string | undefined, fallback: number): number {
  if (!hex) return fallback;
  const v = hex.replace(/^#/, "");
  if (v.length === 3) {
    const r = parseInt(v[0] + v[0], 16);
    const g = parseInt(v[1] + v[1], 16);
    const b = parseInt(v[2] + v[2], 16);
    return (r << 16) | (g << 8) | b;
  }
  if (v.length === 6) return parseInt(v, 16);
  return fallback;
}
