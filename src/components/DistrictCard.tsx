import type { District } from "@/data/districts";
import { Badge } from "./Badge";
import { MetricBar } from "./MetricBar";
import { cn } from "@/lib/cn";

function overallScore(d: District) {
  // Weights tuned for "普通买房人":可负担 30、通勤 20、流动性 15、学区 15、政策 20
  const s =
    d.affordability.score * 0.3 +
    d.commute.score * 0.2 +
    d.liquidity.score * 0.15 +
    d.school.score * 0.15 +
    d.policy.score * 0.2;
  return Math.round(s);
}

function yoyTone(v: number) {
  if (v > 0) return "good";
  if (v > -3) return "warn";
  return "bad";
}

export function DistrictCard({ d }: { d: District }) {
  const score = overallScore(d);
  const ringTone =
    score >= 75 ? "ring-emerald-400/40" : score >= 60 ? "ring-brand/40" : "ring-amber-400/30";
  return (
    <article
      className={cn(
        "group relative flex flex-col gap-4 rounded-2xl bg-ink-900/60 p-5 ring-1 ring-white/10 transition",
        "hover:bg-ink-900/80 hover:ring-2",
        ringTone
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">{d.name}</h3>
          <p className="text-xs text-zinc-500">{d.zone}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">综合分</span>
          <span className="text-2xl font-semibold tabular-nums text-zinc-50">{score}</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge>{d.unitPrice.toFixed(1)} 万/㎡</Badge>
        <Badge tone={yoyTone(d.yoy) as "good" | "warn" | "bad"}>
          同比 {d.yoy > 0 ? "+" : ""}
          {d.yoy.toFixed(1)}%
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MetricBar label="可负担度" score={d.affordability.score} detail={d.affordability.detail} />
        <MetricBar label="通勤"     score={d.commute.score}       detail={d.commute.detail} />
        <MetricBar label="流动性"   score={d.liquidity.score}     detail={d.liquidity.detail} />
        <MetricBar label="学区"     score={d.school.score}        detail={d.school.detail} />
        <MetricBar label="政策"     score={d.policy.score}        detail={d.policy.detail} />
      </div>

      <div className="space-y-2 pt-2 text-sm">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-emerald-300/80">亮点</p>
          <ul className="space-y-1">
            {d.highlights.map((h) => (
              <li key={h} className="text-zinc-300">· {h}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-rose-300/80">风险</p>
          <ul className="space-y-1">
            {d.risks.map((r) => (
              <li key={r} className="text-zinc-400">· {r}</li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}
