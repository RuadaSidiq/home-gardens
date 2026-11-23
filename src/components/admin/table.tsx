import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/primitives";

export type Column<T> = { header: string; cell: (row: T) => ReactNode; className?: string; primary?: boolean; align?: "right" };

/** Server-rendered table that becomes stacked cards on small screens (see .rtable in globals.css). */
export function DataTable<T>({ columns, rows, rowKey, empty = "Nothing to show", className }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; empty?: string; className?: string }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <div className={cn("md:overflow-x-auto md:rounded-lg md:border md:border-sand-200 md:bg-white", className)}>
      <table className="rtable w-full text-sm">
        <thead className="border-b border-sand-200 bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-muted">
          <tr>{columns.map((c) => <th key={c.header} className={cn("whitespace-nowrap px-4 py-2.5 font-medium", c.align === "right" && "text-right")}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="md:divide-y md:divide-sand-100">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="md:hover:bg-sand-50/60">
              {columns.map((c) => <td key={c.header} data-label={c.primary ? "" : c.header} className={cn("px-4 py-3 align-top", c.primary && "rt-primary", c.align === "right" && "md:text-right", c.className)}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Filter = { name: string; label: string; type?: "text" | "select" | "date"; options?: { value: string; label: string }[]; placeholder?: string };

/** GET filter bar; keeps the URL as the source of truth so filters are shareable. */
export function FilterBar({ action, filters, values }: { action: string; filters: Filter[]; values: Record<string, string | undefined> }) {
  const cls = "h-9 rounded-md border border-sand-300 bg-white px-2.5 text-sm focus:border-forest-500 focus:outline-none";
  return (
    <form action={action} className="mb-4 flex flex-wrap items-end gap-2">
      {filters.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          {f.label}
          {f.type === "select" ? (
            <select name={f.name} defaultValue={values[f.name] ?? ""} className={cls}>
              <option value="">All</option>
              {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input name={f.name} type={f.type ?? "text"} defaultValue={values[f.name] ?? ""} placeholder={f.placeholder} className={cn(cls, f.type !== "date" && "w-56")} />
          )}
        </label>
      ))}
      <button className="h-9 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-forest-950">Filter</button>
      {Object.values(values).some(Boolean) && <a href={action} className="inline-flex h-9 items-center px-2 text-sm text-ink-soft hover:text-ink">Reset</a>}
    </form>
  );
}

export function pageParams(sp: { page?: string }, size = 25) {
  const page = Math.max(1, Number(sp.page) || 1);
  return { page, limit: size, offset: (page - 1) * size };
}
