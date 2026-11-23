import Link from "next/link";
import { requirePermission } from "@/server/auth/session";
import { parseRange } from "@/server/queries/admin";
import { REPORTS, runReport } from "@/server/queries/reports";
import { Card, PageHeader, EmptyState } from "@/components/ui/primitives";
import { RangeFilter } from "@/components/admin/range-filter";
import { formatMoney } from "@/lib/money";
import { cn, titleCase } from "@/lib/utils";

export const metadata = { title: "Reports" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ type?: string; range?: string; from?: string; to?: string }> }) {
  await requirePermission("reports.view");
  const sp = await searchParams;
  const type = REPORTS.some(([k]) => k === sp.type) ? sp.type! : "financial";
  const range = parseRange(sp.range, sp.from, sp.to);
  const report = await runReport(type, range);
  const curIdx = report.columns.indexOf("Currency");
  const qs = new URLSearchParams({ type, range: range.key, ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) });
  return (
    <>
      <PageHeader title="Reports" actions={<RangeFilter base={`/admin/reports`} current={range.key} from={sp.from} to={sp.to} />} />
      <nav className="scrollbar-none -mx-4 mb-4 flex gap-1 overflow-x-auto px-4">
        {REPORTS.map(([k, label]) => <Link key={k} href={`/admin/reports?type=${k}&range=${range.key}`} className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm font-medium", type === k ? "bg-ink text-white" : "text-ink-soft hover:bg-white")}>{label}</Link>)}
      </nav>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-200 px-5 py-3">
          <h2 className="font-semibold">{report.title}</h2>
          <a href={`/api/admin/reports?${qs}`} className="text-sm link">Download CSV</a>
        </div>
        {report.rows.length === 0 ? <div className="p-5"><EmptyState title="No data for this period" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-muted"><tr>{report.columns.map((c) => <th key={c} className="whitespace-nowrap px-4 py-2 font-medium">{c}</th>)}</tr></thead>
              <tbody className="divide-y divide-sand-100">{report.rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j} className={cn("whitespace-nowrap px-4 py-2", typeof v === "number" && "text-right tabular-nums")}>{report.money?.includes(j) && curIdx >= 0 ? formatMoney(Number(v), String(row[curIdx])) : typeof v === "string" && j === 0 ? titleCase(v) : v}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
