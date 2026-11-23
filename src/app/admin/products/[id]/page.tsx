import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { formatDateTime, titleCase } from "@/lib/utils";
import { ProductForm, VariantForm } from "../product-form";

export const metadata = { title: "Edit product" };

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const u = await requirePermission("products.manage");
  const { id } = await params;
  const isNew = id === "new";
  const [p] = isNew ? [undefined] : await db.select().from(schema.products).where(eq(schema.products.id, id));
  if (!isNew && !p) notFound();
  const [cats, brands, vendors, currencies, variants, stock, moves] = await Promise.all([
    db.select({ id: schema.productCategories.id, name: schema.productCategories.name }).from(schema.productCategories).orderBy(asc(schema.productCategories.sort)),
    db.select().from(schema.brands).orderBy(asc(schema.brands.name)),
    db.select({ id: schema.vendors.id, name: schema.vendors.name }).from(schema.vendors).where(eq(schema.vendors.status, "active")),
    db.select({ code: schema.currencies.code }).from(schema.currencies).where(eq(schema.currencies.active, true)),
    p ? db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, p.id)).orderBy(desc(schema.productVariants.isDefault)) : Promise.resolve([]),
    p ? db.select({ variantId: schema.inventory.variantId, onHand: schema.inventory.onHand, wh: schema.warehouses.name }).from(schema.inventory).innerJoin(schema.warehouses, eq(schema.warehouses.id, schema.inventory.warehouseId)).innerJoin(schema.productVariants, eq(schema.productVariants.id, schema.inventory.variantId)).where(eq(schema.productVariants.productId, p.id)) : Promise.resolve([]),
    p ? db.select({ m: schema.inventoryMovements, variant: schema.productVariants.name }).from(schema.inventoryMovements).innerJoin(schema.productVariants, eq(schema.productVariants.id, schema.inventoryMovements.variantId)).where(eq(schema.productVariants.productId, p.id)).orderBy(desc(schema.inventoryMovements.createdAt)).limit(15) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title={p ? p.name : "New product"} breadcrumbs={[{ label: "Products", href: "/admin/products" }, { label: p ? "Edit" : "New" }]} actions={p && <a href={`/shop/${p.slug}`} target="_blank" className="text-sm link">View in shop</a>} />
      {(await searchParams).saved && <Alert tone="success" className="mb-4">Product created.</Alert>}
      <div className="space-y-6">
        <Card className="p-5"><ProductForm p={p} categories={cats} brands={brands} vendors={vendors} currencies={currencies.map((c) => c.code)} /></Card>
        {p && (
          <>
            <Card>
              <CardHeader title="Variants" description="Each variant has its own SKU and stock. Leave price overrides empty to use the product price." />
              <div className="divide-y divide-sand-100">
                {variants.map((v) => (
                  <div key={v.id} className="space-y-1 px-5 py-3">
                    <VariantForm productId={p.id} v={{ id: v.id, name: v.name, sku: v.sku, optionName: Object.keys(v.options)[0], price: v.priceOverride, salePrice: v.salePriceOverride, active: v.active }} />
                    <p className="text-xs text-ink-muted">{v.isDefault ? "Default · " : ""}Stock: {stock.filter((s) => s.variantId === v.id).map((s) => `${s.wh} ${s.onHand}`).join(" · ") || "0"}</p>
                  </div>
                ))}
                <div className="bg-sand-50 px-5 py-3"><VariantForm productId={p.id} /></div>
              </div>
            </Card>
            {u.permissions.has("inventory.manage") && (
              <Card>
                <CardHeader title="Recent stock movements" action={<Link href={`/admin/inventory?q=${encodeURIComponent(p.sku)}`} className="text-sm link">Adjust stock</Link>} />
                <ul className="divide-y divide-sand-100 text-sm">{moves.map(({ m, variant }) => <li key={m.id} className="flex justify-between px-5 py-2"><span>{variant} · {titleCase(m.reason)}{m.reference ? ` · ${m.reference}` : ""}{m.note ? ` · ${m.note}` : ""}</span><span className="tabular-nums"><span className={m.delta < 0 ? "text-clay-600" : "text-forest-700"}>{m.delta > 0 ? "+" : ""}{m.delta}</span> → {m.balanceAfter} <span className="text-xs text-ink-muted">{formatDateTime(m.createdAt)}</span></span></li>)}</ul>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
