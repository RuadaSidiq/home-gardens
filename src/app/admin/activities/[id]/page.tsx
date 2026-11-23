import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { Card, CardHeader, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { ActivityForm, AddSessions, Attendance, SessionControls } from "../forms";

export const metadata = { title: "Activity" };

export default async function AdminActivity({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("activities.manage");
  const { id } = await params;
  const isNew = id === "new";
  const [a] = isNew ? [undefined] : await db.select().from(schema.activities).where(eq(schema.activities.id, id));
  if (!isNew && !a) notFound();
  const cities = await db.select({ id: schema.cities.id, name: schema.cities.name }).from(schema.cities).where(eq(schema.cities.active, true)).orderBy(asc(schema.cities.name));
  const sessions = a ? await db.select().from(schema.activitySessions).where(eq(schema.activitySessions.activityId, a.id)).orderBy(desc(schema.activitySessions.startsAt)) : [];
  const regs = sessions.length ? await db.select({ r: schema.activityRegistrations, name: schema.users.fullName, email: schema.users.email }).from(schema.activityRegistrations).innerJoin(schema.users, eq(schema.users.id, schema.activityRegistrations.userId)).where(inArray(schema.activityRegistrations.sessionId, sessions.map((s) => s.id))).orderBy(asc(schema.activityRegistrations.createdAt)) : [];
  return (
    <>
      <PageHeader title={a?.title ?? "New activity"} breadcrumbs={[{ label: "Activities", href: "/admin/activities" }, { label: a ? "Edit" : "New" }]} actions={a && <a href={`/activities/${a.slug}`} target="_blank" className="text-sm link">View on site</a>} />
      <div className="space-y-6">
        <Card className="p-5"><ActivityForm a={a} cities={cities} /></Card>
        {a && (
          <>
            <Card><CardHeader title="Add sessions" description="Times are in the activity's local time." /><div className="p-5"><AddSessions activityId={a.id} capacity={a.defaultCapacity} /></div></Card>
            {sessions.map((s) => {
              const list = regs.filter((r) => r.r.sessionId === s.id);
              return (
                <Card key={s.id}>
                  <CardHeader title={formatDateTime(s.startsAt)} description={`${s.seatsTaken} / ${s.capacity} seats · ${list.filter((r) => r.r.status === "attended").length} attended`} action={<div className="flex items-center gap-2"><StatusBadge status={s.status} /><SessionControls sessionId={s.id} capacity={s.capacity} status={s.status} /></div>} />
                  {list.length > 0 ? (
                    <ul className="divide-y divide-sand-100 text-sm">{list.map(({ r, name, email }) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                        <span><span className="font-medium">{name}</span> <span className="text-ink-muted">· {email} · {r.quantity} seat(s) · {r.amount ? formatMoney(r.amount, r.currency) : "Free"} · {r.reference}</span>{r.attendeeNames.length > 0 && <span className="block text-xs text-ink-muted">{r.attendeeNames.join(", ")}</span>}</span>
                        <span className="flex items-center gap-2"><StatusBadge status={r.status} />{["confirmed", "attended", "no_show"].includes(r.status) && <Attendance registrationId={r.id} status={r.status} />}</span>
                      </li>
                    ))}</ul>
                  ) : <p className="px-5 py-3 text-sm text-ink-muted">No registrations.</p>}
                </Card>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
