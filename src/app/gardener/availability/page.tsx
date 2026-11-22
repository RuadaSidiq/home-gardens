import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireGardener } from "@/server/auth/session";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/form";
import { formatDate, formatTime } from "@/lib/utils";
import { addDaysStr, zonedInfo } from "@/lib/time";
import { removeTimeOff } from "../actions";
import { TimeOffForm, WeeklyHours } from "./forms";

export const metadata = { title: "Schedule & availability" };

export default async function Availability() {
  const u = await requireGardener();
  const [[g], rows, off, jobs] = await Promise.all([
    db.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, u.gardenerId)),
    db.select().from(schema.gardenerAvailability).where(eq(schema.gardenerAvailability.gardenerId, u.gardenerId)),
    db.select().from(schema.gardenerTimeOff).where(and(eq(schema.gardenerTimeOff.gardenerId, u.gardenerId), gte(schema.gardenerTimeOff.endsAt, new Date()))).orderBy(asc(schema.gardenerTimeOff.startsAt)),
    db.select({ b: schema.bookings, service: schema.services.name }).from(schema.bookings).innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
      .where(and(eq(schema.bookings.gardenerId, u.gardenerId), inArray(schema.bookings.status, ["assigned", "accepted", "in_progress"]), gte(schema.bookings.scheduledStart, new Date(Date.now() - 86400_000)))).orderBy(asc(schema.bookings.scheduledStart)),
  ]);
  const today = zonedInfo(new Date(), "Africa/Accra").date;
  const days = Array.from({ length: 14 }, (_, i) => addDaysStr(today, i));
  return (
    <>
      <PageHeader title="Schedule & availability" description="New jobs are only offered when you're available and have no other job at that time." />
      <Card className="mb-6">
        <CardHeader title="Next two weeks" />
        <div className="grid grid-cols-2 gap-px bg-sand-200 sm:grid-cols-4 lg:grid-cols-7">
          {days.map((d) => {
            const wd = new Date(d + "T12:00:00Z").getUTCDay();
            const working = rows.find((r) => r.weekday === wd);
            const dayOff = off.some((o) => o.startsAt.toISOString().slice(0, 10) <= d && o.endsAt.toISOString().slice(0, 10) >= d);
            const dayJobs = jobs.filter((j) => zonedInfo(j.b.scheduledStart, "Africa/Accra").date === d);
            return (
              <div key={d} className={`min-h-[96px] p-2 text-xs ${dayOff || !working ? "bg-sand-50" : "bg-white"}`}>
                <p className="font-semibold">{formatDate(d + "T12:00:00Z", { weekday: "short", day: "numeric", month: "short" })}</p>
                <p className="text-ink-muted">{dayOff ? "Time off" : working ? `${working.startTime.slice(0, 5)}–${working.endTime.slice(0, 5)}` : "Not working"}</p>
                {dayJobs.map((j) => <p key={j.b.id} className={`mt-1 truncate rounded px-1 py-0.5 ${j.b.status === "assigned" ? "bg-sky-50 text-sky-700" : "bg-forest-100 text-forest-800"}`}>{formatTime(j.b.scheduledStart)} {j.service}</p>)}
              </div>
            );
          })}
        </div>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Weekly working hours" /><div className="p-5"><WeeklyHours rows={rows} maxJobs={g?.maxJobsPerDay ?? 3} /></div></Card>
        <Card>
          <CardHeader title="Time off" description="Block dates when you're unavailable." />
          <div className="space-y-4 p-5">
            <TimeOffForm />
            <ul className="divide-y divide-sand-100">{off.map((o) => <li key={o.id} className="flex items-center justify-between py-2 text-sm"><span>{formatDate(o.startsAt)} – {formatDate(o.endsAt)}{o.reason ? ` · ${o.reason}` : ""}</span><ActionButton action={removeTimeOff} fields={{ id: o.id }} variant="ghost">Remove</ActionButton></li>)}</ul>
          </div>
        </Card>
      </div>
    </>
  );
}
