import Link from "next/link";
import { and, desc, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Pagination, StatusBadge } from "@/components/ui/primitives";
import { DataTable, FilterBar, pageParams } from "@/components/admin/table";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requirePermission("customers.view");
  const sp = await searchParams;
  const { page, limit, offset } = pageParams(sp);
  const where: (SQL | undefined)[] = [sql`exists (select 1 from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = ${schema.users.id} and r.key = 'customer')`];
  if (sp.q) where.push(or(ilike(schema.users.fullName, `%${sp.q}%`), ilike(schema.users.email, `%${sp.q}%`), ilike(schema.users.phone, `%${sp.q}%`)));
  const [rows, [count]] = await Promise.all([
    db.select({ u: schema.users, bookings: sql<number>`(select count(*) from bookings b where b.customer_id = ${schema.users.id})`.mapWith(Number), orders: sql<number>`(select count(*) from orders o where o.user_id = ${schema.users.id})`.mapWith(Number) }).from(schema.users).where(and(...where)).orderBy(desc(schema.users.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.users).where(and(...where)),
  ]);
  return (
    <>
      <PageHeader title="Customers" description={`${count?.n ?? 0} customers`} />
      <FilterBar action="/admin/customers" values={sp} filters={[{ name: "q", label: "Search", placeholder: "Name, email, phone" }]} />
      <DataTable rows={rows} rowKey={(r) => r.u.id} columns={[
        { header: "Customer", primary: true, cell: (r) => <Link href={`/admin/customers/${r.u.id}`} className="font-medium hover:text-forest-700">{r.u.fullName}<span className="block text-xs font-normal text-ink-muted">{r.u.email}</span></Link> },
        { header: "Phone", cell: (r) => r.u.phone ?? "—" },
        { header: "Country", cell: (r) => r.u.countryCode ?? "—" },
        { header: "Bookings", align: "right", cell: (r) => r.bookings },
        { header: "Orders", align: "right", cell: (r) => r.orders },
        { header: "Joined", cell: (r) => formatDate(r.u.createdAt) },
        { header: "Status", cell: (r) => <StatusBadge status={r.u.status} /> },
      ]} />
      <Pagination page={page} pageCount={Math.ceil((count?.n ?? 0) / limit)} params={sp} basePath="/admin/customers" />
    </>
  );
}
