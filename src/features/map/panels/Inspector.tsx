"use client";

import { useHover, useSelection } from "../store/mapStore";
import { tone } from "../tokens/design";

interface DistrictData {
  name: string;
  price?: number;
  count: number;
  area?: number;
  total?: number;
  distSubway?: number;
  scoreT: number;
}

interface SubwayData {
  name: string;
  lng: number;
  lat: number;
}

interface PoiData {
  name: string;
  lon: number;
  lat: number;
  category: string;
  config: { label: string };
}

export function Inspector() {
  const selection = useSelection();
  const hover = useHover();
  const target = selection ?? hover;

  if (!target) {
    return (
      <aside className="pointer-events-auto hc-inspector hc-inspector--empty">
        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">说明</p>
        <h2 className="mt-1 text-base font-semibold text-zinc-200">
          点击任意小区 / 地铁站,看它能给到普通买房人什么
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          顶部切换底图模式:综合分(默认)聚焦"普通买房人友好度",
          均价直接看 万元/㎡,地铁可达看 800 m 步行圈密度。
        </p>
        <ul className="mt-3 space-y-1.5 text-xs text-zinc-500">
          <li>• 左上角图层开关 + 透明度滑杆</li>
          <li>• 鼠标拖动旋转 / 滚轮缩放</li>
          <li>• PR2 起会上「反向高亮」与「服务半径联动」</li>
        </ul>
        <Style />
      </aside>
    );
  }

  return (
    <aside className="pointer-events-auto hc-inspector">
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            {target.kind}
          </p>
          <h2 className="text-lg font-semibold text-zinc-100 leading-tight">
            {target.title}
          </h2>
          {target.subtitle && (
            <p className="mt-0.5 text-xs text-zinc-400">{target.subtitle}</p>
          )}
        </div>
        {selection?.id === target.id && (
          <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide"
                style={{ borderColor: tone.brand, color: tone.brandSoft }}>
            selected
          </span>
        )}
      </header>

      {target.kind === "district" && <DistrictBody data={target.data as DistrictData} />}
      {target.kind === "subwayStation" && <SubwayBody data={target.data as SubwayData} />}
      {(target.kind === "school" || target.kind === "hospital" || target.kind === "mall" ||
        target.kind === "park" || target.kind === "custom") && (
        <PoiBody data={target.data as PoiData} />
      )}

      <Style />
    </aside>
  );
}

function DistrictBody({ data }: { data: DistrictData }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 rounded-xl bg-white/[0.04] p-3 text-center">
        <Stat label="近 4 月成交" value={`${data.count} 套`} />
        <Stat
          label="均价"
          value={data.price !== undefined ? `${data.price.toFixed(2)}` : "—"}
          suffix={data.price !== undefined ? "万/㎡" : undefined}
          accent
        />
        <Stat
          label="均总价"
          value={data.total !== undefined ? `${data.total.toFixed(0)}` : "—"}
          suffix={data.total !== undefined ? "万" : undefined}
        />
      </div>
      <Row label="均面积" value={data.area !== undefined ? `${data.area.toFixed(1)} ㎡` : "—"} />
      <Row label="距最近地铁" value={data.distSubway !== undefined ? `${Math.round(data.distSubway)} m` : "—"} />
      <Row label="买房友好分" value={`${Math.round(data.scoreT * 100)} / 100`} accent />
      <p className="pt-1 text-[11px] leading-relaxed text-zinc-500">
        ※ 数据基于 1-4 月公开成交,近期无成交的小区显示为暂无;
        综合分仅作筛选辅助,不构成投资建议。
      </p>
    </div>
  );
}

function SubwayBody({ data }: { data: SubwayData }) {
  return (
    <div className="space-y-2 text-sm text-zinc-300">
      <Row label="经度" value={data.lng.toFixed(5)} />
      <Row label="纬度" value={data.lat.toFixed(5)} />
      <p className="pt-1 text-[11px] leading-relaxed text-zinc-500">
        PR2 会接上 800 m / 1.5 km 服务圈,并列出圈内全部小区均价排行。
      </p>
    </div>
  );
}

function PoiBody({ data }: { data: PoiData }) {
  return (
    <div className="space-y-2 text-sm text-zinc-300">
      <Row label="类别" value={data.config.label} />
      <Row label="经度" value={data.lon.toFixed(5)} />
      <Row label="纬度" value={data.lat.toFixed(5)} />
      <p className="pt-1 text-[11px] leading-relaxed text-zinc-500">
        PR2 会按类别加上 5/15 分钟可达圈,选中后周边小区按距离排序。
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums" style={{ color: accent ? tone.brandSoft : tone.ink }}>
        {value}
        {suffix && <span className="ml-1 text-[10px] font-normal text-zinc-400">{suffix}</span>}
      </p>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="tabular-nums" style={{ color: accent ? tone.brandSoft : tone.ink }}>{value}</span>
    </div>
  );
}

function Style() {
  return (
    <style>{`
      .hc-inspector {
        position: absolute;
        right: 16px;
        top: 16px;
        bottom: 16px;
        width: 320px;
        padding: 18px 18px 16px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.07);
        background: rgba(13,16,22,0.82);
        backdrop-filter: blur(12px);
        color: #e8eaf2;
        overflow-y: auto;
        box-shadow: 0 20px 40px rgba(0,0,0,0.45);
      }
      .hc-inspector--empty { background: rgba(13,16,22,0.6); }
    `}</style>
  );
}
