import Link from "next/link";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { Card, CardHeader, PageHeader, Pagination, Badge } from "@/components/ui/primitives";
import { DataTable, FilterBar, pageParams } from "@/components/admin/table";
import { formatDateTime, titleCase } from "@/lib/utils";
import { AdjustStock, WarehouseForm } from "./forms";

export const metadata = { title: "Inventory" };

export default async function Inventory({ searchParams }: { searchParams: Promise<{ q?: string; low?: string; page?: string }> }) {
  await requirePermission("inventory.manage");
  const sp = await searchParams;
  const { page, limit, offset } = pageParams(sp, 30);
  const where: (SQL | undefined)[] = [];
  if (sp.q) where.push(or(ilike(schema.products.name, `%${sp.q}%`), ilike(schema.productVariants.sku, `%${sp.q}%`), ilike(schema.products.sku, `%${sp.q}%`)));
  const total = sql<number>`(select coalesce(sum(on_hand),0) from inventory i where i.variant_id = ${schema.productVariants.id})`;
  if (sp.low === "1") where.push(sql`${total} <= ${schema.products.lowStockThreshold}`);
  const [warehouses, rows, [count], moves, countries] = await Promise.all([
    db.select().from(schema.warehouses).orderBy(desc(schema.warehouses.isDefault), asc(schema.warehouses.code)),
    db.select({ v: schema.productVariants, p: schema.products, total: total.mapWith(Number) }).from(schema.productVariants).innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId)).where(and(...where)).orderBy(asc(total), asc(schema.products.name)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.productVariants).innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId)).where(and(...where)),
    db.select({ m: schema.inventoryMovements, product: schema.products.name, variant: schema.productVariants.name, wh: schema.warehouses.code, actor: schema.users.fullName }).from(schema.inventoryMovements).innerJoin(schema.productVariants, eq(schema.productVariants.id, schema.inventoryMovements.variantId)).innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId)).innerJoin(schema.warehouses, eq(schema.warehouses.id, schema.inventoryMovements.warehouseId)).leftJoin(schema.users, eq(schema.users.id, schema.inventoryMovements.actorId)).orderBy(desc(schema.inventoryMovements.createdAt)).limit(20),
    db.select({ code: schema.countries.code }).from(schema.countries),
  ]);
  const inv = rows.length ? await db.select().from(schema.inventory).where(sql`${schema.inventory.variantId} in (${sql.join(rows.map((r) => sql`${r.v.id}`), sql`, `)})`) : [];
  const onHand = (v: string, w: number) => inv.find((i) => i.variantId === v && i.warehouseId === w)?.onHand ?? 0;
  return (
    <>
      <PageHeader title="Inventory" description="Stock is reserved when an order is placed and released if it's cancelled or unpaid." />
      <FilterBar action="/admin/inventory" values={sp} filters={[{ name: "q", label: "Search", placeholder: "Product or SKU" }, { name: "low", label: "Stock", type: "select", options: [{ value: "1", label: "Low or out of stock" }] }]} />
      <DataTable rows={rows} rowKey={(r) => r.v.id} columns={[
        { header: "Product", primary: true, cell: (r) => <Link href={`/admin/products/${r.p.id}`} className="font-medium hover:text-forest-700">{r.p.name}{!r.v.isDefault && <span className="text-ink-muted"> · {r.v.name}</span>}<span className="block text-xs font-normal text-ink-muted">{r.v.sku}</span></Link> },
        ...warehouses.map((w) => ({ header: w.code, align: "right" as const, cell: (r: (typeof rows)[number]) => onHand(r.v.id, w.id) })),
        { header: "Total", align: "right", cell: (r) => <span className="font-semibold tabular-nums">{r.total}</span> },
        { header: "Alert", cell: (r) => (r.total <= 0 ? <Badge tone="red">{r.p.allowBackorder ? "Backorder" : "Out of stock"}</Badge> : r.total <= r.p.lowStockThreshold ? <Badge tone="amber">Low</Badge> : null) },
        { header: "", cell: (r) => <AdjustStock variantId={r.v.id} label={`${r.p.name}${r.v.isDefault ? "" : ` (${r.v.name})`}`} warehouses={warehouses.filter((w) => w.active).map((w) => ({ id: w.id, name: w.name, onHand: onHand(r.v.id, w.id) }))} /> },
      ]} />
      <Pagination page={page} pageCount={Math.ceil((count?.n ?? 0) / limit)} params={sp} basePath="/admin/inventory" />
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Recent movements" /><ul className="divide-y divide-sand-100 text-sm">{moves.map(({ m, product, variant, wh, actor }) => <li key={m.id} className="px-5 py-2"><div className="flex justify-between gap-2"><span className="truncate">{product}{variant !== "Default" ? ` · ${variant}` : ""} <span className="text-ink-muted">@{wh}</span></span><span className={`tabular-nums ${m.delta < 0 ? "text-clay-600" : "text-forest-700"}`}>{m.delta > 0 ? "+" : ""}{m.delta} → {m.balanceAfter}</span></div><p className="text-xs text-ink-muted">{titleCase(m.reason)}{m.reference ? ` · ${m.reference}` : ""}{m.note ? ` · ${m.note}` : ""} · {actor ?? "System"} · {formatDateTime(m.createdAt)}</p></li>)}</ul></Card>
        <Card><CardHeader title="Warehouses" /><div className="divide-y divide-sand-100">{warehouses.map((w) => <div key={w.id} className="px-5 py-3"><WarehouseForm w={w} countries={countries.map((c) => c.code)} />{w.isDefault && <p className="mt-1 text-xs text-ink-muted">Default warehouse</p>}</div>)}<div className="bg-sand-50 px-5 py-3"><WarehouseForm countries={countries.map((c) => c.code)} /></div></div></Card>
      </div>
    </>
  );
}
