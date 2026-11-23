import Link from "next/link";
import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Pagination, StatusBadge, staffStatusLabel } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, FilterBar, pageParams } from "@/components/admin/table";
import { formatMoney } from "@/lib/money";
import { formatDateTime, titleCase } from "@/lib/utils";

export const metadata = { title: "Bookings" };
type SP = { q?: string; status?: string; from?: string; to?: string; service?: string; page?: string };

export default async function AdminBookings({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requirePermission("bookings.view");
  const sp = await searchParams;
  const { page, limit, offset } = pageParams(sp);
  const gu = alias(schema.users, "gu");
  const where: (SQL | undefined)[] = [];
  if (sp.status) where.push(sql`${schema.bookings.status} = ${sp.status}`);
  if (sp.service) where.push(eq(schema.bookings.serviceId, sp.service));
  if (sp.from) where.push(gte(schema.bookings.scheduledStart, new Date(sp.from)));
  if (sp.to) where.push(lt(schema.bookings.scheduledStart, new Date(new Date(sp.to).getTime() + 86400_000)));
  if (sp.q) where.push(or(ilike(schema.bookings.reference, `%${sp.q}%`), ilike(schema.users.fullName, `%${sp.q}%`), ilike(schema.users.email, `%${sp.q}%`), ilike(gu.fullName, `%${sp.q}%`)));
  const q = db
    .select({ b: schema.bookings, service: schema.services.name, customer: schema.users.fullName, gardener: gu.fullName })
    .from(schema.bookings)
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .innerJoin(schema.users, eq(schema.users.id, schema.bookings.customerId))
    .leftJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.bookings.gardenerId))
    .leftJoin(gu, eq(gu.id, schema.gardenerProfiles.userId))
    .where(and(...where));
  const [rows, [count], services] = await Promise.all([
    q.orderBy(desc(schema.bookings.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.bookings).innerJoin(schema.users, eq(schema.users.id, schema.bookings.customerId)).leftJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.bookings.gardenerId)).leftJoin(gu, eq(gu.id, schema.gardenerProfiles.userId)).where(and(...where)),
    db.select({ id: schema.services.id, name: schema.services.name }).from(schema.services).orderBy(schema.services.name),
  ]);
  return (
    <>
      <PageHeader title="Bookings" description={`${count?.n ?? 0} bookings`} actions={u.permissions.has("bookings.manage") && <ButtonLink href="/admin/bookings/new" size="sm">New booking</ButtonLink>} />
      <FilterBar action="/admin/bookings" values={sp} filters={[
        { name: "q", label: "Search", placeholder: "Reference, customer, gardener" },
        { name: "status", label: "Status", type: "select", options: schema.bookingStatus.enumValues.map((s) => ({ value: s, label: staffStatusLabel(s) })) },
        { name: "service", label: "Service", type: "select", options: services.map((s) => ({ value: s.id, label: s.name })) },
        { name: "from", label: "From", type: "date" },
        { name: "to", label: "To", type: "date" },
      ]} />
      <DataTable rows={rows} rowKey={(r) => r.b.id} empty="No bookings match these filters" columns={[
        { header: "Booking", primary: true, cell: (r) => <Link href={`/admin/bookings/${r.b.id}`} className="font-medium hover:text-forest-700">{r.b.reference}<span className="block text-xs font-normal text-ink-muted">{r.service}</span></Link> },
        { header: "Customer", cell: (r) => r.customer },
        { header: "Scheduled", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.b.scheduledStart)}</span> },
        { header: "Area", cell: (r) => r.b.address.city },
        { header: "Gardener", cell: (r) => r.gardener ?? <span className="text-ink-muted">Unassigned</span> },
        { header: "Total", align: "right", cell: (r) => <span className="tabular-nums">{r.b.total ? formatMoney(r.b.total, r.b.currency) : "—"}</span> },
        { header: "Payment", cell: (r) => <StatusBadge status={r.b.paymentState} /> },
        { header: "Status", cell: (r) => <StatusBadge status={r.b.status} label={staffStatusLabel(r.b.status)} /> },
        { header: "Mode", cell: (r) => <span className="text-xs text-ink-muted">{titleCase(r.b.assignmentMode)}</span> },
      ]} />
      <Pagination page={page} pageCount={Math.ceil((count?.n ?? 0) / limit)} params={sp} basePath="/admin/bookings" />
    </>
  );
}
