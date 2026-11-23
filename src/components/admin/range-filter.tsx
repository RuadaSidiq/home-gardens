import Link from "next/link";
import { cn } from "@/lib/utils";

/** Date range control (GET form) used by dashboard and reports. */
export function RangeFilter({ base, current, from, to }: { base: string; current: string; from?: string; to?: string }) {
  const opts = [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["365d", "12 months"]];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md border border-sand-300 bg-white p-0.5">
        {opts.map(([k, l]) => <Link key={k} href={`${base}?range=${k}`} className={cn("rounded px-2.5 py-1 text-sm font-medium", current === k ? "bg-ink text-white" : "text-ink-soft hover:bg-sand-100")}>{l}</Link>)}
      </div>
      <form action={base} className="flex items-center gap-1">
        <input type="hidden" name="range" value="custom" />
        <label className="sr-only" htmlFor="rf-from">From</label>
        <input id="rf-from" type="date" name="from" defaultValue={from} className="h-8 rounded-md border border-sand-300 bg-white px-2 text-sm" />
        <span className="text-ink-muted">–</span>
        <label className="sr-only" htmlFor="rf-to">To</label>
        <input id="rf-to" type="date" name="to" defaultValue={to} className="h-8 rounded-md border border-sand-300 bg-white px-2 text-sm" />
        <button className="h-8 rounded-md border border-sand-300 bg-white px-2.5 text-sm font-medium hover:bg-sand-50">Apply</button>
      </form>
    </div>
  );
}
