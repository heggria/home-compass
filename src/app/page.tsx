import { districts } from "@/data/districts";
import { DistrictCard } from "@/components/DistrictCard";
import { AffordabilityCalc } from "@/components/AffordabilityCalc";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <header className="mb-12 space-y-4">
        <p className="text-xs uppercase tracking-[0.2em] text-brand/80">Home Compass · 北京</p>
        <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
          让每个普通人在<span className="text-brand">买房前</span>看清真相
        </h1>
        <p className="max-w-2xl text-zinc-400 md:text-lg">
          用公开数据把北京板块、成交、政策一次说清楚。
          先选自己能负担的预算,再看哪个板块的通勤、学区、流动性、政策最匹配。
          不替你做决定,只帮你看清差距。
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-zinc-500">
          <span className="rounded-full border border-white/10 px-2 py-0.5">数据来源:公开成交</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">仅供研究,不构成投资建议</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">v0.1 · 占位数据</span>
        </div>
      </header>

      <section className="mb-14">
        <AffordabilityCalc />
      </section>

      <section className="space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-semibold md:text-2xl">板块打分卡</h2>
            <p className="text-sm text-zinc-500">
              综合分按 普通买房人 视角加权:可负担 30% · 通勤 20% · 政策 20% · 流动性 15% · 学区 15%
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {districts.map((d) => (
            <DistrictCard key={d.id} d={d} />
          ))}
        </div>
      </section>

      <footer className="mt-20 border-t border-white/5 pt-6 text-xs text-zinc-500">
        <p>
          © {new Date().getFullYear()} Home Compass · MIT · 由 heggria 维护 ·
          <a className="ml-1 underline hover:text-zinc-300"
             href="https://github.com/heggria/home-compass" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
