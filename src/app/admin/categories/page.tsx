import { asc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { BrandForm, ProductCategoryForm } from "./forms";

export const metadata = { title: "Categories & brands" };

export default async function Categories() {
  await requirePermission("products.manage");
  const [cats, brands] = await Promise.all([
    db.select().from(schema.productCategories).orderBy(asc(schema.productCategories.sort)),
    db.select({ b: schema.brands, n: sql<number>`(select count(*) from products p where p.brand_id = ${schema.brands.id})`.mapWith(Number) }).from(schema.brands).orderBy(asc(schema.brands.name)),
  ]);
  return (
    <>
      <PageHeader title="Categories & brands" />
      <Card><CardHeader title="Product categories" /><div className="divide-y divide-sand-100">{cats.map((c) => <div key={c.id} className="px-5 py-3"><ProductCategoryForm c={c} /></div>)}<div className="bg-sand-50 px-5 py-3"><ProductCategoryForm /></div></div></Card>
      <Card className="mt-6"><CardHeader title="Brands" /><div className="space-y-3 p-5"><div className="flex flex-wrap gap-2">{brands.map(({ b, n }) => <span key={b.id} className="rounded-md border border-sand-200 px-2.5 py-1 text-sm">{b.name} <span className="text-ink-muted">({n})</span></span>)}</div><BrandForm /></div></Card>
    </>
  );
}
