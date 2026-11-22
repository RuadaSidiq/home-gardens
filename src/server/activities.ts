import { and, eq, lt, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { reference } from "@/lib/ids";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { UserError } from "./errors";
import { ledger } from "./finance";
import { notify } from "./notify";
import { refundSubject } from "./payments/refunds";
import { countryTimeZone } from "./bookings/availability";

/** Seat reservation is atomic: the session row is locked and a CHECK constraint backs it up. */
export async function registerForActivity(opts: { userId: string; sessionId: string; quantity: number; attendeeNames: string[] }) {
  if (opts.quantity < 1) throw new UserError("Choose at least one seat.", "quantity");
  const reg = await db.transaction(async (tx) => {
    const [s] = await tx
      .select({ s: schema.activitySessions, a: schema.activities })
      .from(schema.activitySessions)
      .innerJoin(schema.activities, eq(schema.activities.id, schema.activitySessions.activityId))
      .where(eq(schema.activitySessions.id, opts.sessionId))
      .for("update", { of: schema.activitySessions });
    if (!s || !s.a.active || s.s.status !== "scheduled") throw new UserError("This session is not open for registration.");
    if (opts.quantity > s.a.maxPerBooking) throw new UserError(`You can book up to ${s.a.maxPerBooking} seats at once.`, "quantity");
    if (s.s.startsAt.getTime() - s.a.bookingDeadlineHours * 3600_000 < Date.now()) throw new UserError("Registration for this session has closed.");
    const left = s.s.capacity - s.s.seatsTaken;
    if (opts.quantity > left) throw new UserError(left <= 0 ? "This session is fully booked." : `Only ${left} seat(s) left.`, "quantity");
    await tx.update(schema.activitySessions).set({ seatsTaken: s.s.seatsTaken + opts.quantity }).where(eq(schema.activitySessions.id, s.s.id));
    const amount = s.a.price * opts.quantity;
    const free = amount === 0 || !s.a.requiresPayment;
    const [r] = await tx
      .insert(schema.activityRegistrations)
      .values({
        reference: reference("AC"),
        sessionId: s.s.id,
        userId: opts.userId,
        quantity: opts.quantity,
        attendeeNames: opts.attendeeNames.filter(Boolean).slice(0, opts.quantity),
        amount,
        currency: s.a.currency,
        status: free ? "confirmed" : "pending_payment",
        paymentState: free ? "paid" : "unpaid",
      })
      .returning();
    return { r: r!, a: s.a, s: s.s, free };
  });
  if (reg.free) await sendRegistrationNotice(reg.r.id);
  return reg.r;
}

export async function sendRegistrationNotice(registrationId: string) {
  const [row] = await db
    .select({ r: schema.activityRegistrations, s: schema.activitySessions, a: schema.activities })
    .from(schema.activityRegistrations)
    .innerJoin(schema.activitySessions, eq(schema.activitySessions.id, schema.activityRegistrations.sessionId))
    .innerJoin(schema.activities, eq(schema.activities.id, schema.activitySessions.activityId))
    .where(eq(schema.activityRegistrations.id, registrationId));
  if (!row) return;
  const tz = await countryTimeZone(row.a.countryCode);
  await notify(row.r.userId, "activity_registered", { activity: row.a.title, date: formatDateTime(row.s.startsAt, tz), quantity: row.r.quantity, reference: row.r.reference }, `/account/activities`);
}

export async function applyRegistrationPayment(tx: Tx, registrationId: string, amount: number) {
  const [r] = await tx.select().from(schema.activityRegistrations).where(eq(schema.activityRegistrations.id, registrationId)).for("update");
  if (!r) throw new Error("Registration not found");
  if (r.status === "cancelled") {
    // Seats were released while the customer was paying; try to re-reserve.
    const [s] = await tx.select().from(schema.activitySessions).where(eq(schema.activitySessions.id, r.sessionId)).for("update");
    if (!s || s.capacity - s.seatsTaken < r.quantity) return { becameConfirmed: false, needsRefund: true };
    await tx.update(schema.activitySessions).set({ seatsTaken: s.seatsTaken + r.quantity }).where(eq(schema.activitySessions.id, s.id));
  }
  await tx.update(schema.activityRegistrations).set({ status: "confirmed", paymentState: amount >= r.amount ? "paid" : "unpaid" }).where(eq(schema.activityRegistrations.id, r.id));
  await ledger(tx, [{ account: "company_revenue", amount, currency: r.currency, registrationId: r.id, revenueStream: "activities", description: `Activity tickets ${r.reference}` }]);
  return { becameConfirmed: true, needsRefund: false };
}

export async function cancelRegistration(opts: { registrationId: string; actorId: string; byCustomer: boolean }) {
  const { r, refund } = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ r: schema.activityRegistrations, s: schema.activitySessions, a: schema.activities })
      .from(schema.activityRegistrations)
      .innerJoin(schema.activitySessions, eq(schema.activitySessions.id, schema.activityRegistrations.sessionId))
      .innerJoin(schema.activities, eq(schema.activities.id, schema.activitySessions.activityId))
      .where(eq(schema.activityRegistrations.id, opts.registrationId))
      .for("update", { of: schema.activityRegistrations });
    if (!row) throw new UserError("Registration not found.");
    if (opts.byCustomer && row.r.userId !== opts.actorId) throw new UserError("Registration not found.");
    if (!["pending_payment", "confirmed"].includes(row.r.status)) throw new UserError("This registration cannot be cancelled.");
    const beforeDeadline = row.s.startsAt.getTime() - row.a.bookingDeadlineHours * 3600_000 > Date.now();
    if (opts.byCustomer && row.r.status === "confirmed" && !beforeDeadline) throw new UserError("The cancellation window for this session has closed.");
    await tx.update(schema.activitySessions).set({ seatsTaken: sql`${schema.activitySessions.seatsTaken} - ${row.r.quantity}` }).where(eq(schema.activitySessions.id, row.s.id));
    await tx.update(schema.activityRegistrations).set({ status: "cancelled" }).where(eq(schema.activityRegistrations.id, row.r.id));
    const paid = row.r.paymentState === "paid" && row.r.amount > 0;
    if (paid) await ledger(tx, [{ account: "company_revenue", amount: -row.r.amount, currency: row.r.currency, registrationId: row.r.id, revenueStream: "activities", description: `Activity cancelled ${row.r.reference}` }]);
    return { r: row.r, refund: paid ? row.r.amount : 0 };
  });
  if (refund > 0) {
    await refundSubject({ registrationId: r.id }, refund, `Activity cancellation ${r.reference}`, opts.actorId);
    await notify(r.userId, "refund_processed", { reference: r.reference, amount: formatMoney(refund, r.currency) }, "/account/activities");
  }
}

export async function setAttendance(registrationId: string, status: "attended" | "no_show" | "confirmed") {
  const [r] = await db.select().from(schema.activityRegistrations).where(eq(schema.activityRegistrations.id, registrationId));
  if (!r || !["confirmed", "attended", "no_show"].includes(r.status)) throw new UserError("Only confirmed registrations can be checked in.");
  await db
    .update(schema.activityRegistrations)
    .set({ status, checkedInAt: status === "attended" ? new Date() : null })
    .where(eq(schema.activityRegistrations.id, registrationId));
}

export async function expireUnpaidRegistrations(maxAgeMinutes = 30) {
  const stale = await db
    .select({ id: schema.activityRegistrations.id })
    .from(schema.activityRegistrations)
    .where(and(eq(schema.activityRegistrations.status, "pending_payment"), lt(schema.activityRegistrations.createdAt, new Date(Date.now() - maxAgeMinutes * 60_000))));
  for (const s of stale) {
    await db.transaction(async (tx) => {
      const [r] = await tx.select().from(schema.activityRegistrations).where(eq(schema.activityRegistrations.id, s.id)).for("update");
      if (!r || r.status !== "pending_payment") return;
      await tx.update(schema.activitySessions).set({ seatsTaken: sql`${schema.activitySessions.seatsTaken} - ${r.quantity}` }).where(eq(schema.activitySessions.id, r.sessionId));
      await tx.update(schema.activityRegistrations).set({ status: "cancelled" }).where(eq(schema.activityRegistrations.id, r.id));
    });
  }
  return stale.length;
}
