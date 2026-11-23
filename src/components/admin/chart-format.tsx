"use client";
import { formatMoney } from "@/lib/money";
import { HBars, StackedColumns } from "./charts";

/** Wraps charts so a currency formatter (a function) can be created on the client. */
export function ChartMoney(p: ({ kind: "stacked"; labels: string[]; series: { name: string; values: number[] }[]; height?: number } | { kind: "hbars"; rows: { label: string; value: number }[] }) & { currency?: string }) {
  const fmt = p.currency ? (n: number) => formatMoney(n, p.currency!, { compact: n >= 100000 * 100, noDecimals: true }) : (n: number) => String(Math.round(n));
  return p.kind === "stacked" ? <StackedColumns labels={p.labels} series={p.series} fmt={fmt} height={p.height} /> : <HBars rows={p.rows} fmt={fmt} />;
}
