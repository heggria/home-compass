"use client";
import { useState } from "react";

function fmt(n: number) {
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

export function AffordabilityCalc() {
  const [monthlyIncome, setMonthlyIncome] = useState(25000);
  const [downpayment, setDownpayment] = useState(150);
  const [years, setYears] = useState(30);
  const [rate, setRate] = useState(3.1);

  // 月供占税后 35% 反推贷款额
  const maxMonthly = monthlyIncome * 0.35;
  const r = rate / 100 / 12;
  const n = years * 12;
  const factor = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const loan = factor > 0 ? maxMonthly / factor : 0;
  const totalBudget = (downpayment * 10000 + loan) / 10000; // 万

  return (
    <div className="rounded-2xl bg-ink-900/60 p-5 ring-1 ring-white/10">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">能买多少钱的房</h3>
        <span className="text-xs text-zinc-500">月供占收入 35%</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="税后月收入(元)">
          <input type="number" min={0} step={1000}
            className="num-input"
            value={monthlyIncome}
            onChange={(e) => setMonthlyIncome(Number(e.target.value))} />
        </Field>
        <Field label="首付(万)">
          <input type="number" min={0} step={10}
            className="num-input"
            value={downpayment}
            onChange={(e) => setDownpayment(Number(e.target.value))} />
        </Field>
        <Field label="贷款年限">
          <input type="number" min={5} max={30} step={1}
            className="num-input"
            value={years}
            onChange={(e) => setYears(Number(e.target.value))} />
        </Field>
        <Field label="商贷利率(%)">
          <input type="number" min={0} max={10} step={0.05}
            className="num-input"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))} />
        </Field>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-white/5 p-4 text-center">
        <Stat label="可承担总价" value={`${fmt(totalBudget)} 万`} accent />
        <Stat label="可贷款额" value={`${fmt(loan / 10000)} 万`} />
        <Stat label="月供上限" value={`${fmt(maxMonthly)} 元`} />
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        参考算法,不构成投资建议。具体首付比例、利率、税费请以当地最新政策为准。
      </p>
      <style>{`
        .num-input {
          width: 100%;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 8px 10px;
          color: #e8eaf2;
          font-variant-numeric: tabular-nums;
        }
        .num-input:focus { outline: 2px solid #7657FF; outline-offset: -1px; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${accent ? "text-brand" : "text-zinc-100"}`}>
        {value}
      </p>
    </div>
  );
}
