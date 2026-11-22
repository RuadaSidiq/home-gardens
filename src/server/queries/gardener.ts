import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export const JOB_TABS = {
  requests: ["assigned"],
  upcoming: ["accepted"],
  active: ["in_progress", "awaiting_confirmation"],
  completed: ["completed"],
  other: ["cancelled", "disputed", "pending_assignment"],
} as const;

export async function gardenerJobs(gardenerId: string, statuses: readonly string[], limit = 50) {
  return db
    .select({ b: schema.bookings, service: schema.services.name, customer: schema.users.fullName })
    .from(schema.bookings)
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .innerJoin(schema.users, eq(schema.users.id, schema.bookings.customerId))
    .where(and(eq(schema.bookings.gardenerId, gardenerId), inArray(schema.bookings.status, statuses as (typeof schema.bookingStatus.enumValues)[number][])))
    .orderBy(statuses.includes("completed") ? desc(schema.bookings.scheduledStart) : asc(schema.bookings.scheduledStart))
    .limit(limit);
}

/** Jobs this gardener declined or was withdrawn from (history from assignments). */
export async function declinedJobs(gardenerId: string) {
  return db
    .select({ a: schema.bookingAssignments, reference: schema.bookings.reference, service: schema.services.name, start: schema.bookings.scheduledStart })
    .from(schema.bookingAssignments)
    .innerJoin(schema.bookings, eq(schema.bookings.id, schema.bookingAssignments.bookingId))
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .where(and(eq(schema.bookingAssignments.gardenerId, gardenerId), inArray(schema.bookingAssignments.status, ["rejected", "withdrawn", "expired"])))
    .orderBy(desc(schema.bookingAssignments.createdAt))
    .limit(30);
}

export async function gardenerStats(gardenerId: string) {
  const [r] = await db
    .select({
      upcoming: sql<number>`count(*) filter (where status in ('accepted','assigned') and scheduled_start >= now())`.mapWith(Number),
      thisMonth: sql<number>`count(*) filter (where status = 'completed' and completed_at >= date_trunc('month', now()))`.mapWith(Number),
      completed: sql<number>`count(*) filter (where status = 'completed')`.mapWith(Number),
    })
    .from(schema.bookings)
    .where(eq(schema.bookings.gardenerId, gardenerId));
  const [m] = await db
    .select({ earned: sql<number>`coalesce(sum(gardener_amount),0)`.mapWith(Number) })
    .from(schema.commissions)
    .where(and(eq(schema.commissions.gardenerId, gardenerId), gte(schema.commissions.createdAt, sql`date_trunc('month', now())`), sql`status <> 'reversed'`));
  return { ...r!, earnedThisMonth: m?.earned ?? 0 };
}
