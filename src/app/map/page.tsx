import type { Metadata } from "next";
import { MapView } from "@/features/map/panels/MapView";

export const metadata: Metadata = {
  title: "Home Compass · 北京 3D 地图 (alpha)",
  description: "北京小区均价 3D 视图,地铁/学校/医院/商业按需叠加;选中即看普通买房人视角下的友好分。",
};

export default function MapPage() {
  return <MapView />;
}
