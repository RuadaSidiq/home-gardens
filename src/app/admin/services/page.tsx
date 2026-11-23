import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { Card, CardHeader, PageHeader, StatusBadge, Badge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/admin/table";
import { formatMoney } from "@/lib/money";
import { titleCase } from "@/lib/utils";
import { CategoryForm } from "./category-form";

export const metadata = { title: "Services" };

export default async function AdminServices() {
  await requirePermission("services.manage");
  const [rows, cats] = await Promise.all([
    db.select({ s: schema.services, cat: schema.serviceCategories.name, areas: sql<number>`(select count(*) from service_areas a where a.service_id = ${schema.services.id})`.mapWith(Number), gardeners: sql<number>`(select count(*) from gardener_services g where g.service_id = ${schema.services.id} and g.active)`.mapWith(Number) })
      .from(schema.services).innerJoin(schema.serviceCategories, eq(schema.serviceCategories.id, schema.services.categoryId)).orderBy(asc(schema.serviceCategories.sort), asc(schema.services.name)),
    db.select().from(schema.serviceCategories).orderBy(asc(schema.serviceCategories.sort)),
  ]);
  return (
    <>
      <PageHeader title="Services" actions={<ButtonLink href="/admin/services/new" size="sm">New service</ButtonLink>} />
      <DataTable rows={rows} rowKey={(r) => r.s.id} columns={[
        { header: "Service", primary: true, cell: (r) => <Link href={`/admin/services/${r.s.id}`} className="font-medium hover:text-forest-700">{r.s.name}<span className="block text-xs font-normal text-ink-muted">{r.cat}</span></Link> },
        { header: "Pricing", cell: (r) => <span>{titleCase(r.s.pricingModel)}{r.s.basePrice ? ` · ${formatMoney(r.s.basePrice, r.s.currency)}` : ""}</span> },
        { header: "Deposit", cell: (r) => `${r.s.depositPercent}%` },
        { header: "Areas", align: "right", cell: (r) => r.areas },
        { header: "Gardeners", align: "right", cell: (r) => r.gardeners },
        { header: "Status", cell: (r) => <span className="flex gap-1"><StatusBadge status={r.s.active ? "active" : "hidden"} label={r.s.active ? "Published" : "Unpublished"} />{r.s.featured && <Badge tone="blue">Featured</Badge>}</span> },
      ]} />
      <Card className="mt-8">
        <CardHeader title="Categories" />
        <div className="divide-y divide-sand-100">
          {cats.map((c) => <div key={c.id} className="px-5 py-3"><CategoryForm c={c} /></div>)}
          <div className="bg-sand-50 px-5 py-3"><p className="mb-2 text-sm font-semibold">Add category</p><CategoryForm /></div>
        </div>
      </Card>
    </>
  );
}
