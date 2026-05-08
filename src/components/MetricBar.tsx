import { cn } from "@/lib/cn";
export function MetricBar({
  label,
  score,
  detail,
}: {
  label: string;
  score: number;
  detail?: string;
}) {
  const tone =
    score >= 80 ? "bg-emerald-400" : score >= 60 ? "bg-brand" : score >= 45 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-200">{score}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${score}%` }} />
      </div>
      {detail && <p className="text-[11px] leading-tight text-zinc-500">{detail}</p>}
    </div>
  );
}
