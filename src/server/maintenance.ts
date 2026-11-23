import "server-only";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { expireUnpaidOrders } from "./commerce/orders";
import { expireUnpaidRegistrations } from "./activities";
import { releaseMaturedCommissions } from "./finance";
import { autoAssign, confirmCompletion } from "./bookings/engine";
import { reconcilePendingPayments } from "./payments/service";
import { getSettings } from "./settings";
import { notify } from "./notify";
import { reportError } from "./errors";
import { formatDateTime } from "@/lib/utils";

/** Idempotent housekeeping. Schedule every 10-15 minutes via /api/cron/maintenance. */
export async function runMaintenance() {
  const s = await getSettings();
  const out: Record<string, number> = {};
  const step = async (name: string, fn: () => Promise<number>) => {
    try { out[name] = await fn(); } catch (e) { out[name] = -1; await reportError(e, { where: `maintenance:${name}` }); }
  };

  await step("paymentsReconciled", () => reconcilePendingPayments(5));
  await step("ordersExpired", () => expireUnpaidOrders(60));
  await step("registrationsExpired", () => expireUnpaidRegistrations(30));
  await step("commissionsReleased", () => releaseMaturedCommissions());

  // Offers not answered within the response window go to the next gardener.
  await step("offersExpired", async () => {
    const stale = await db.select({ a: schema.bookingAssignments, b: schema.bookings }).from(schema.bookingAssignments).innerJoin(schema.bookings, eq(schema.bookings.id, schema.bookingAssignments.bookingId))
      .where(and(eq(schema.bookingAssignments.status, "offered"), eq(schema.bookings.status, "assigned"), lt(schema.bookingAssignments.createdAt, new Date(Date.now() - s.booking.gardenerResponseHours * 3600_000))));
    for (const { a, b } of stale) {
      await db.transaction(async (tx) => {
        await tx.update(schema.bookingAssignments).set({ status: "expired", respondedAt: new Date(), reason: "No response in time" }).where(eq(schema.bookingAssignments.id, a.id));
        const [u] = await tx.update(schema.bookings).set({ status: "pending_assignment", gardenerId: null, updatedAt: new Date() }).where(and(eq(schema.bookings.id, b.id), eq(schema.bookings.status, "assigned"))).returning();
        if (u) await tx.insert(schema.bookingStatusHistory).values({ bookingId: b.id, fromStatus: "assigned", toStatus: "pending_assignment", note: "Offer expired without response" });
      });
      await autoAssign(b.id, null, s);
    }
    return stale.length;
  });

  // Jobs marked done by the gardener and not disputed are confirmed after the window (only if fully paid).
  await step("bookingsAutoCompleted", async () => {
    const due = await db.select({ id: schema.bookings.id }).from(schema.bookings)
      .where(and(eq(schema.bookings.status, "awaiting_confirmation"), lt(schema.bookings.gardenerCompletedAt, new Date(Date.now() - s.booking.autoCompleteHours * 3600_000)), sql`${schema.bookings.amountPaid} >= ${schema.bookings.total}`));
    let n = 0;
    for (const d of due) { await confirmCompletion(d.id, { userId: null, system: true }).then(() => n++).catch(() => {}); }
    return n;
  });

  // Reminders for bookings starting in the next 20-28 hours, sent once.
  await step("remindersSent", async () => {
    const soon = await db.select({ b: schema.bookings, service: schema.services.name, gUser: schema.gardenerProfiles.userId, tz: schema.countries.timezone }).from(schema.bookings)
      .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
      .innerJoin(schema.countries, eq(schema.countries.code, schema.bookings.countryCode))
      .leftJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.bookings.gardenerId))
      .where(and(eq(schema.bookings.status, "accepted"), gte(schema.bookings.scheduledStart, new Date(Date.now() + 20 * 3600_000)), lt(schema.bookings.scheduledStart, new Date(Date.now() + 28 * 3600_000))));
    let n = 0;
    for (const r of soon) {
      const [already] = await db.select({ id: schema.notifications.id }).from(schema.notifications).where(and(eq(schema.notifications.userId, r.b.customerId), eq(schema.notifications.type, "booking_reminder"), sql`${schema.notifications.link} = ${`/account/bookings/${r.b.id}`}`));
      if (already) continue;
      const vars = { service: r.service, date: formatDateTime(r.b.scheduledStart, r.tz), reference: r.b.reference };
      await notify(r.b.customerId, "booking_reminder", vars, `/account/bookings/${r.b.id}`);
      if (r.gUser) await notify(r.gUser, "booking_reminder", vars, `/gardener/jobs/${r.b.id}`);
      n++;
    }
    return n;
  });

  await step("sessionsPurged", async () => (await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date())).returning({ id: schema.sessions.id })).length);
  await step("rateLimitsPurged", async () => (await db.delete(schema.rateLimits).where(lt(schema.rateLimits.windowStart, new Date(Date.now() - 86400_000))).returning({ k: schema.rateLimits.key })).length);
  await step("tokensPurged", async () => (await db.delete(schema.authTokens).where(and(lt(schema.authTokens.expiresAt, new Date(Date.now() - 7 * 86400_000)), isNull(schema.authTokens.usedAt))).returning({ id: schema.authTokens.id })).length);
  return out;
}
