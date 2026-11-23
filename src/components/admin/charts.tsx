"use client";
import { useState } from "react";

/** Colors: validated categorical slots 1-3 (stream identity) + brand green for single series. */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"];
const SINGLE = "#166B3C";

type Fmt = (n: number) => string;

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1);
}

function TableView({ labels, series, fmt }: { labels: string[]; series: { name: string; values: number[] }[]; fmt: Fmt }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-ink-muted hover:text-ink">View as table</summary>
      <div className="mt-2 max-h-56 overflow-auto">
        <table className="w-full text-left">
          <thead><tr className="text-ink-muted"><th className="py-1 pr-3 font-medium">Date</th>{series.map((s) => <th key={s.name} className="py-1 pr-3 text-right font-medium">{s.name}</th>)}</tr></thead>
          <tbody>{labels.map((l, i) => <tr key={l} className="border-t border-sand-100"><td className="py-1 pr-3">{l}</td>{series.map((s) => <td key={s.name} className="py-1 pr-3 text-right tabular-nums">{fmt(s.values[i] ?? 0)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

/** Stacked columns over time with per-column hover tooltip. */
export function StackedColumns({ labels, series, fmt, height = 220 }: { labels: string[]; series: { name: string; values: number[] }[]; fmt: Fmt; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  const max = niceMax(Math.max(...totals, 0));
  const W = 640, H = height, padL = 52, padB = 22, padT = 8;
  const plotW = W - padL - 6, plotH = H - padB - padT;
  const bw = plotW / Math.max(labels.length, 1);
  const barW = Math.max(2, Math.min(28, bw - 3));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const empty = totals.every((t) => t === 0);
  return (
    <div>
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-4 text-xs text-ink-soft">{series.map((s, i) => <li key={s.name} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i] }} />{s.name}</li>)}</ul>
      )}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Chart of ${series.map((s) => s.name).join(", ")}`}>
          {ticks.map((t) => {
            const y = padT + plotH - (t / max) * plotH;
            return <g key={t}><line x1={padL} x2={W - 6} y1={y} y2={y} stroke="#E8E3D8" strokeWidth={1} /><text x={padL - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#66716A">{fmt(t)}</text></g>;
          })}
          {labels.map((l, i) => {
            let y = padT + plotH;
            const x = padL + i * bw + (bw - barW) / 2;
            const showLabel = labels.length <= 12 || i % Math.ceil(labels.length / 8) === 0;
            return (
              <g key={l} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={padL + i * bw} y={padT} width={bw} height={plotH} fill={hover === i ? "#F4F1EA" : "transparent"} />
                {series.map((s, si) => {
                  const h = ((s.values[i] ?? 0) / max) * plotH;
                  if (h <= 0) return null;
                  y -= h;
                  const top = series.slice(si + 1).every((x) => (x.values[i] ?? 0) === 0);
                  return <rect key={s.name} x={x} y={y + (si > 0 ? 0 : 0)} width={barW} height={Math.max(h - (si > 0 || !top ? 1 : 0), 1)} rx={top ? 3 : 0} fill={series.length > 1 ? SERIES[si] : SINGLE} />;
                })}
                {showLabel && <text x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#66716A">{l}</text>}
              </g>
            );
          })}
          <line x1={padL} x2={W - 6} y1={padT + plotH} y2={padT + plotH} stroke="#B4AA95" strokeWidth={1} />
        </svg>
        {empty && <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">No data in this period</p>}
        {hover != null && !empty && (
          <div className="pointer-events-none absolute top-0 z-10 rounded-md border border-sand-200 bg-white px-3 py-2 text-xs shadow-pop" style={{ left: `min(${((padL + hover * bw + bw) / W) * 100}%, calc(100% - 10rem))` }}>
            <p className="font-semibold">{labels[hover]}</p>
            {series.map((s, i) => <p key={s.name} className="flex items-center gap-1.5 tabular-nums"><span className="h-2 w-2 rounded-sm" style={{ background: series.length > 1 ? SERIES[i] : SINGLE }} />{s.name}: {fmt(s.values[hover] ?? 0)}</p>)}
            {series.length > 1 && <p className="mt-0.5 border-t border-sand-100 pt-0.5 font-semibold tabular-nums">Total {fmt(totals[hover]!)}</p>}
          </div>
        )}
      </div>
      <TableView labels={labels} series={series} fmt={fmt} />
    </div>
  );
}

/** Horizontal bars, single hue, value labels at the end. */
export function HBars({ rows, fmt }: { rows: { label: string; value: number }[]; fmt: Fmt }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="py-8 text-center text-sm text-ink-muted">No data in this period</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="text-sm" title={`${r.label}: ${fmt(r.value)}`}>
          <div className="mb-1 flex justify-between gap-3"><span className="truncate text-ink-soft">{r.label}</span><span className="tabular-nums font-medium">{fmt(r.value)}</span></div>
          <div className="h-2 rounded-sm bg-sand-100"><div className="h-2 rounded-sm transition-opacity" style={{ width: `${(r.value / max) * 100}%`, background: SINGLE, opacity: hover == null || hover === i ? 1 : 0.55 }} /></div>
        </li>
      ))}
    </ul>
  );
}
