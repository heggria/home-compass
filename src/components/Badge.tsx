import { cn } from "@/lib/cn";
export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  className?: string;
}) {
  const map = {
    default: "bg-white/5 text-zinc-300 border-white/10",
    good: "bg-emerald-500/10 text-emerald-300 border-emerald-400/20",
    warn: "bg-amber-500/10 text-amber-300 border-amber-400/20",
    bad: "bg-rose-500/10 text-rose-300 border-rose-400/20",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        map[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
