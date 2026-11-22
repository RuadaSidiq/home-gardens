import { and, eq, inArray, lt, gt, sql, ne } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@/db";
import { zonedInfo, zonedToUtc, timeToMinutes, minutesToTime } from "@/lib/time";

export const ACTIVE_BOOKING_STATUSES = ["assigned", "accepted", "in_progress", "awaiting_confirmation"] as const;

export type Candidate = {
  gardenerId: string;
  userId: string;
  name: string;
  type: "company" | "independent";
  rating: number;
  ratingCount: number;
  years: number;
  verified: boolean;
  weekLoad: number;
  score: number;
};

/**
 * Gardeners eligible for a job: approved, offering the service, covering the city,
 * working at that time, not on leave, without overlapping work, under their daily cap.
 */
export async function eligibleGardeners(
  opts: { serviceId: string; cityId: number | null; start: Date; end: Date; timeZone: string; excludeBookingId?: string; onlyGardenerId?: string; excludeGardenerIds?: string[] },
  tx: DbOrTx = db,
): Promise<Candidate[]> {
  const startInfo = zonedInfo(opts.start, opts.timeZone);
  const endInfo = zonedInfo(opts.end, opts.timeZone);
  const startMin = startInfo.minutes;
  const endMin = endInfo.date === startInfo.date ? endInfo.minutes : 24 * 60;

  const rows = await tx.execute<{
    id: string; user_id: string; full_name: string; type: "company" | "independent"; rating_avg: string; rating_count: number;
    years_experience: number; verified_at: Date | null; max_jobs_per_day: number;
  }>(sql`
    select g.id, g.user_id, u.full_name, g.type, g.rating_avg, g.rating_count, g.years_experience, g.verified_at, g.max_jobs_per_day
    from gardener_profiles g
    join users u on u.id = g.user_id and u.status = 'active'
    join gardener_services gs on gs.gardener_id = g.id and gs.service_id = ${opts.serviceId} and gs.active
    where g.status = 'approved'
      ${opts.onlyGardenerId ? sql`and g.id = ${opts.onlyGardenerId}` : sql``}
      ${opts.excludeGardenerIds?.length ? sql`and g.id not in (${sql.join(opts.excludeGardenerIds.map((x) => sql`${x}`), sql`, `)})` : sql``}
      ${opts.cityId ? sql`and (g.base_city_id = ${opts.cityId} or exists (select 1 from gardener_service_areas a where a.gardener_id = g.id and a.city_id = ${opts.cityId}))` : sql``}
      and exists (
        select 1 from gardener_availability av where av.gardener_id = g.id and av.weekday = ${startInfo.weekday}
          and av.start_time <= ${minutesToTime(startMin)}::time and av.end_time >= ${minutesToTime(Math.min(endMin, 1439))}::time
      )
      and not exists (
        select 1 from gardener_time_off t where t.gardener_id = g.id and t.starts_at < ${opts.end.toISOString()}::timestamptz and t.ends_at > ${opts.start.toISOString()}::timestamptz
      )
      and not exists (
        select 1 from bookings b where b.gardener_id = g.id
          and b.status in ('assigned','accepted','in_progress','awaiting_confirmation')
          ${opts.excludeBookingId ? sql`and b.id <> ${opts.excludeBookingId}` : sql``}
          and tstzrange(b.scheduled_start, b.scheduled_end, '[)') && tstzrange(${opts.start.toISOString()}::timestamptz, ${opts.end.toISOString()}::timestamptz, '[)')
      )`);

  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const dayStart = zonedToUtc(startInfo.date, "00:00", opts.timeZone);
  const dayEnd = new Date(dayStart.getTime() + 86400_000);
  const weekEnd = new Date(opts.start.getTime() + 7 * 86400_000);
  const weekStart = new Date(opts.start.getTime() - 7 * 86400_000);
  const loads = await tx
    .select({
      gardenerId: schema.bookings.gardenerId,
      day: sql<number>`count(*) filter (where ${schema.bookings.scheduledStart} >= ${dayStart.toISOString()}::timestamptz and ${schema.bookings.scheduledStart} < ${dayEnd.toISOString()}::timestamptz)`.mapWith(Number),
      week: sql<number>`count(*)`.mapWith(Number),
    })
    .from(schema.bookings)
    .where(
      and(
        inArray(schema.bookings.gardenerId, ids),
        inArray(schema.bookings.status, [...ACTIVE_BOOKING_STATUSES]),
        gt(schema.bookings.scheduledStart, weekStart),
        lt(schema.bookings.scheduledStart, weekEnd),
        opts.excludeBookingId ? ne(schema.bookings.id, opts.excludeBookingId) : undefined,
      ),
    )
    .groupBy(schema.bookings.gardenerId);
  const loadMap = new Map(loads.map((l) => [l.gardenerId, l]));

  return rows
    .filter((r) => (loadMap.get(r.id)?.day ?? 0) < r.max_jobs_per_day)
    .map((r) => {
      const c = {
        gardenerId: r.id,
        userId: r.user_id,
        name: r.full_name,
        type: r.type,
        rating: Number(r.rating_avg),
        ratingCount: r.rating_count,
        years: r.years_experience,
        verified: !!r.verified_at,
        weekLoad: loadMap.get(r.id)?.week ?? 0,
        score: 0,
      };
      c.score = matchScore(c);
      return c;
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Ranking used by automatic assignment. Weights:
 * rating 35% (shrunk toward 4.0 for few reviews), experience 20%, low workload 25%, verification 10%, company staff 10%.
 */
export function matchScore(c: { rating: number; ratingCount: number; years: number; weekLoad: number; verified: boolean; type: string }) {
  const prior = 4, k = 5;
  const adjRating = (c.rating * c.ratingCount + prior * k) / (c.ratingCount + k);
  const rating = adjRating / 5;
  const exp = Math.min(c.years, 10) / 10;
  const load = Math.max(0, 1 - c.weekLoad / 10);
  return Number((rating * 0.35 + exp * 0.2 + load * 0.25 + (c.verified ? 0.1 : 0) + (c.type === "company" ? 0.1 : 0)).toFixed(4));
}

/** Start times (local HH:MM) on a date where at least one eligible gardener (or the chosen one) is free. */
export async function availableSlots(opts: { serviceId: string; cityId: number | null; date: string; durationMinutes: number; timeZone: string; gardenerId?: string; slotMinutes?: number; minLeadHours?: number }) {
  const step = opts.slotMinutes ?? 60;
  const out: { time: string; gardeners: number }[] = [];
  const earliest = Date.now() + (opts.minLeadHours ?? 0) * 3600_000;
  for (let m = timeToMinutes("07:00"); m + opts.durationMinutes <= timeToMinutes("18:00"); m += step) {
    const start = zonedToUtc(opts.date, minutesToTime(m), opts.timeZone);
    if (start.getTime() < earliest) continue;
    const end = new Date(start.getTime() + opts.durationMinutes * 60_000);
    const c = await eligibleGardeners({ serviceId: opts.serviceId, cityId: opts.cityId, start, end, timeZone: opts.timeZone, onlyGardenerId: opts.gardenerId });
    out.push({ time: minutesToTime(m), gardeners: c.length });
  }
  return out;
}

export async function countryTimeZone(code: string, tx: DbOrTx = db) {
  const [c] = await tx.select({ tz: schema.countries.timezone }).from(schema.countries).where(eq(schema.countries.code, code));
  return c?.tz ?? "UTC";
}
