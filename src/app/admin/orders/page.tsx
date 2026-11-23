import Link from "next/link";
import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Pagination, StatusBadge } from "@/components/ui/primitives";
import { DataTable, FilterBar, pageParams } from "@/components/admin/table";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Orders" };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; page?: string }> }) {
  await requirePermission("orders.manage");
  const sp = await searchParams;
  const { page, limit, offset } = pageParams(sp);
  const where: (SQL | undefined)[] = [];
  if (sp.q) where.push(or(ilike(schema.orders.reference, `%${sp.q}%`), ilike(schema.orders.email, `%${sp.q}%`), ilike(schema.users.fullName, `%${sp.q}%`)));
  if (sp.status) where.push(sql`${schema.orders.status} = ${sp.status}`);
  if (sp.from) where.push(gte(schema.orders.createdAt, new Date(sp.from)));
  if (sp.to) where.push(lt(schema.orders.createdAt, new Date(new Date(sp.to).getTime() + 86400_000)));
  const [rows, [count]] = await Promise.all([
    db.select({ o: schema.orders, customer: schema.users.fullName, items: sql<number>`(select sum(quantity) from order_items where order_id = ${schema.orders.id})`.mapWith(Number), returns: sql<number>`(select count(*) from return_requests r where r.order_id = ${schema.orders.id} and r.status in ('requested','approved'))`.mapWith(Number) })
      .from(schema.orders).innerJoin(schema.users, eq(schema.users.id, schema.orders.userId)).where(and(...where)).orderBy(desc(schema.orders.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.orders).innerJoin(schema.users, eq(schema.users.id, schema.orders.userId)).where(and(...where)),
  ]);
  return (
    <>
      <PageHeader title="Orders" description={`${count?.n ?? 0} orders`} />
      <FilterBar action="/admin/orders" values={sp} filters={[{ name: "q", label: "Search", placeholder: "Reference, customer, email" }, { name: "status", label: "Status", type: "select", options: schema.orderStatus.enumValues.map((s) => ({ value: s, label: s.replace("_", " ") })) }, { name: "from", label: "From", type: "date" }, { name: "to", label: "To", type: "date" }]} />
      <DataTable rows={rows} rowKey={(r) => r.o.id} columns={[
        { header: "Order", primary: true, cell: (r) => <Link href={`/admin/orders/${r.o.id}`} className="font-medium hover:text-forest-700">{r.o.reference}</Link> },
        { header: "Placed", cell: (r) => formatDateTime(r.o.createdAt) },
        { header: "Customer", cell: (r) => r.customer },
        { header: "Items", align: "right", cell: (r) => r.items },
        { header: "Total", align: "right", cell: (r) => <span className="tabular-nums">{formatMoney(r.o.total, r.o.currency)}</span> },
        { header: "Delivery", cell: (r) => <span className="text-xs">{r.o.deliveryMethodName}</span> },
        { header: "Status", cell: (r) => <span className="flex flex-wrap gap-1"><StatusBadge status={r.o.status} />{r.returns > 0 && <StatusBadge status="requested" label="Return" />}</span> },
      ]} />
      <Pagination page={page} pageCount={Math.ceil((count?.n ?? 0) / limit)} params={sp} basePath="/admin/orders" />
    </>
  );
}
