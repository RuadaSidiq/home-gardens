import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, StatusBadge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/admin/table";
import { formatMoney } from "@/lib/money";
import { formatDateTime, titleCase } from "@/lib/utils";

export const metadata = { title: "Activities" };

export default async function AdminActivities() {
  await requirePermission("activities.manage");
  const rows = await db.select({
    a: schema.activities,
    next: sql<Date | null>`(select min(starts_at) from activity_sessions s where s.activity_id = ${schema.activities.id} and s.starts_at > now() and s.status = 'scheduled')`,
    sessions: sql<number>`(select count(*) from activity_sessions s where s.activity_id = ${schema.activities.id} and s.starts_at > now())`.mapWith(Number),
    seats: sql<number>`(select coalesce(sum(seats_taken),0) from activity_sessions s where s.activity_id = ${schema.activities.id} and s.starts_at > now())`.mapWith(Number),
  }).from(schema.activities).orderBy(desc(schema.activities.createdAt));
  return (
    <>
      <PageHeader title="Activities" actions={<ButtonLink href="/admin/activities/new" size="sm">New activity</ButtonLink>} />
      <DataTable rows={rows} rowKey={(r) => r.a.id} columns={[
        { header: "Activity", primary: true, cell: (r) => <Link href={`/admin/activities/${r.a.id}`} className="font-medium hover:text-forest-700">{r.a.title}<span className="block text-xs font-normal text-ink-muted">{titleCase(r.a.type)} · {r.a.venue}</span></Link> },
        { header: "Price", cell: (r) => (r.a.price ? formatMoney(r.a.price, r.a.currency) : "Free") },
        { header: "Next session", cell: (r) => (r.next ? formatDateTime(r.next) : "—") },
        { header: "Upcoming sessions", align: "right", cell: (r) => r.sessions },
        { header: "Seats booked", align: "right", cell: (r) => r.seats },
        { header: "Status", cell: (r) => <StatusBadge status={r.a.active ? "active" : "hidden"} label={r.a.active ? "Published" : "Unpublished"} /> },
      ]} />
    </>
  );
}
