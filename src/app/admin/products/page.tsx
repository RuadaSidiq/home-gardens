import Image from "next/image";
import Link from "next/link";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Pagination, StatusBadge, Badge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, FilterBar, pageParams } from "@/components/admin/table";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Products" };

export default async function AdminProducts({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; status?: string; page?: string }> }) {
  await requirePermission("products.manage");
  const sp = await searchParams;
  const { page, limit, offset } = pageParams(sp);
  const where: (SQL | undefined)[] = [];
  if (sp.q) where.push(or(ilike(schema.products.name, `%${sp.q}%`), ilike(schema.products.sku, `%${sp.q}%`)));
  if (sp.category) where.push(eq(schema.products.categoryId, Number(sp.category)));
  if (sp.status) where.push(eq(schema.products.active, sp.status === "active"));
  const stock = sql<number>`(select coalesce(sum(i.on_hand),0) from inventory i join product_variants v on v.id = i.variant_id where v.product_id = ${schema.products.id})`.mapWith(Number);
  const [rows, [count], cats] = await Promise.all([
    db.select({ p: schema.products, cat: schema.productCategories.name, vendor: schema.vendors.name, stock, variants: sql<number>`(select count(*) from product_variants v where v.product_id = ${schema.products.id})`.mapWith(Number) })
      .from(schema.products).innerJoin(schema.productCategories, eq(schema.productCategories.id, schema.products.categoryId)).innerJoin(schema.vendors, eq(schema.vendors.id, schema.products.vendorId))
      .where(and(...where)).orderBy(asc(schema.products.name)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.products).where(and(...where)),
    db.select().from(schema.productCategories).orderBy(asc(schema.productCategories.sort)),
  ]);
  return (
    <>
      <PageHeader title="Products" description={`${count?.n ?? 0} products`} actions={<ButtonLink href="/admin/products/new" size="sm">New product</ButtonLink>} />
      <FilterBar action="/admin/products" values={sp} filters={[{ name: "q", label: "Search", placeholder: "Name or SKU" }, { name: "category", label: "Category", type: "select", options: cats.map((c) => ({ value: String(c.id), label: c.name })) }, { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] }]} />
      <DataTable rows={rows} rowKey={(r) => r.p.id} columns={[
        { header: "Product", primary: true, cell: (r) => <Link href={`/admin/products/${r.p.id}`} className="flex items-center gap-3 font-medium hover:text-forest-700"><span className="relative hidden h-10 w-10 shrink-0 overflow-hidden rounded bg-sand-100 md:block">{r.p.images[0] && <Image src={r.p.images[0]} alt="" fill sizes="40px" className="object-cover" />}</span><span>{r.p.name}<span className="block text-xs font-normal text-ink-muted">{r.p.sku} · {r.cat}</span></span></Link> },
        { header: "Price", align: "right", cell: (r) => <span className="tabular-nums">{formatMoney(r.p.salePrice ?? r.p.price, r.p.currency)}{r.p.salePrice != null && <span className="block text-xs text-ink-muted line-through">{formatMoney(r.p.price, r.p.currency)}</span>}</span> },
        { header: "Variants", align: "right", cell: (r) => r.variants },
        { header: "Stock", align: "right", cell: (r) => <span className={r.stock <= r.p.lowStockThreshold ? "font-semibold text-clay-600" : ""}>{r.stock}</span> },
        { header: "Vendor", cell: (r) => r.vendor },
        { header: "Status", cell: (r) => <span className="flex gap-1"><StatusBadge status={r.p.active ? "active" : "hidden"} label={r.p.active ? "Active" : "Inactive"} />{r.p.featured && <Badge tone="blue">Featured</Badge>}</span> },
      ]} />
      <Pagination page={page} pageCount={Math.ceil((count?.n ?? 0) / limit)} params={sp} basePath="/admin/products" />
    </>
  );
}
