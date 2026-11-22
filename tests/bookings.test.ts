import { describe, expect, it, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  createBooking, issueQuote, respondToQuote, assignGardener, respondToOffer, startJob, completeJob, confirmCompletion,
  cancelBooking, rescheduleBooking, raiseDispute, resolveDispute, recommendGardeners,
} from "@/server/bookings/engine";
import { initiatePayment, confirmManualPayment } from "@/server/payments/service";
import { releaseMaturedCommissions, requestPayout, decidePayout } from "@/server/finance";
import { userByEmail, gardenerByEmail, serviceBySlug, cityByName, nextWeekday, newCustomer } from "./helpers";

async function pay(bookingId: string, userId: string, email: string, kind: "deposit" | "full" = "full") {
  const r = await initiatePayment({ purpose: "booking", subjectId: bookingId, userId, email, provider: "manual", kind });
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.reference, r.reference));
  const admin = await userByEmail("finance@homegardens.example");
  await confirmManualPayment(p!.id, admin.id, "BANK-" + r.reference);
  const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
  return b!;
}

let eastLegon: Awaited<ReturnType<typeof cityByName>>;
beforeAll(async () => {
  eastLegon = await cityByName("East Legon");
});

const baseInput = (customerId: string, serviceId: string, date: string, time = "09:00") => ({
  customerId, serviceId, countryCode: "GH", cityId: eastLegon.id,
  address: { line1: "1 Test Street" }, contactPhone: "+233240000000", date, time, details: "Front and back lawn",
});

describe("booking lifecycle with an independent gardener", () => {
  it("books, pays, auto-assigns the requested gardener, completes and records commission", async () => {
    const cust = await newCustomer();
    const svc = await serviceBySlug("standard-lawn-mowing");
    const { gardener, user: gUser } = await gardenerByEmail("kojo.antwi@example.com");
    const date = nextWeekday(3);

    const b = await createBooking({ ...baseInput(cust.id, svc.id, date), gardenSizeSqm: 300, gardenerId: gardener.id });
    expect(b.status).toBe("awaiting_payment");
    // 300 m² × GH₵1.50 = GH₵450 → +20% Ghana taxes = GH₵540
    expect(b.subtotal).toBe(45000);
    expect(b.total).toBe(54000);

    const paid = await pay(b.id, cust.id, cust.email);
    expect(paid.paymentState).toBe("paid");
    expect(paid.status).toBe("assigned"); // independent gardeners must accept
    expect(paid.gardenerId).toBe(gardener.id);

    await respondToOffer({ bookingId: b.id, gardenerId: gardener.id, userId: gUser.id, accept: true });
    // move start into the window that allows starting
    await db.update(schema.bookings).set({ scheduledStart: new Date(Date.now() + 3600_000), scheduledEnd: new Date(Date.now() + 3 * 3600_000) }).where(eq(schema.bookings.id, b.id));
    await startJob(b.id, gardener.id, gUser.id);
    await expect(completeJob(b.id, gardener.id, gUser.id, [])).rejects.toThrow(/photo/);
    await completeJob(b.id, gardener.id, gUser.id, ["/media/after.jpg"]);
    const done = await confirmCompletion(b.id, { userId: cust.id, customerId: cust.id });
    expect(done.status).toBe("completed");

    const [c] = await db.select().from(schema.commissions).where(eq(schema.commissions.bookingId, b.id));
    // commission on net of tax: 45000 × 15% = 6750
    expect(c).toMatchObject({ grossAmount: 45000, rateBps: 1500, commissionAmount: 6750, gardenerAmount: 38250, status: "pending" });
    const history = await db.select().from(schema.bookingStatusHistory).where(eq(schema.bookingStatusHistory.bookingId, b.id));
    expect(history.map((h) => h.toStatus)).toEqual(expect.arrayContaining(["awaiting_payment", "pending_assignment", "assigned", "accepted", "in_progress", "awaiting_confirmation", "completed"]));
  });
});

describe("double booking prevention", () => {
  it("never assigns two overlapping jobs to the same gardener", async () => {
    const svc = await serviceBySlug("garden-clean-up");
    const { gardener } = await gardenerByEmail("kojo.antwi@example.com");
    const date = nextWeekday(6);
    const c1 = await newCustomer();
    const c2 = await newCustomer();
    const b1 = await createBooking({ ...baseInput(c1.id, svc.id, date, "10:00"), gardenerId: gardener.id });
    await pay(b1.id, c1.id, c1.email);
    // Second customer asks for the same gardener at an overlapping time: refused up front
    await expect(createBooking({ ...baseInput(c2.id, svc.id, date, "11:00"), gardenerId: gardener.id })).rejects.toThrow(/not available/);

    // Bypass application checks and hit the database constraint directly
    const b2 = await createBooking({ ...baseInput(c2.id, svc.id, date, "11:00") });
    await expect(
      db.update(schema.bookings).set({ gardenerId: gardener.id, status: "assigned" }).where(eq(schema.bookings.id, b2.id)),
    ).rejects.toThrow();
    const recs = await recommendGardeners(b2.id);
    expect(recs.find((r) => r.gardenerId === gardener.id)).toBeUndefined();
  });

  it("concurrent manual assignments: only one wins", async () => {
    const svc = await serviceBySlug("garden-clean-up");
    const { gardener } = await gardenerByEmail("kwame.mensah@homegardens.example");
    const admin = await userByEmail("ops@homegardens.example");
    const date = nextWeekday(9);
    const [c1, c2] = [await newCustomer(), await newCustomer()];
    const b1 = await createBooking(baseInput(c1.id, svc.id, date, "09:00"));
    const b2 = await createBooking(baseInput(c2.id, svc.id, date, "10:00"));
    // Turn off auto assignment effect by withdrawing whatever auto-assign did
    for (const [b, c] of [[b1, c1], [b2, c2]] as const) await pay(b.id, c.id, c.email);
    await db.update(schema.bookings).set({ gardenerId: null, status: "pending_assignment" }).where(eq(schema.bookings.id, b1.id));
    await db.update(schema.bookings).set({ gardenerId: null, status: "pending_assignment" }).where(eq(schema.bookings.id, b2.id));
    const results = await Promise.allSettled([assignGardener(b1.id, gardener.id, admin.id), assignGardener(b2.id, gardener.id, admin.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
});

describe("quotes, rejection and reassignment", () => {
  it("quote flow → payment → company gardener auto-accepts", async () => {
    const cust = await newCustomer();
    const svc = await serviceBySlug("landscape-installation");
    const ops = await userByEmail("ops@homegardens.example");
    const b = await createBooking(baseInput(cust.id, svc.id, nextWeekday(12)));
    expect(b.status).toBe("awaiting_quote");
    await expect(initiatePayment({ purpose: "booking", subjectId: b.id, userId: cust.id, email: cust.email, provider: "manual" })).rejects.toThrow();
    const q = await issueQuote({ bookingId: b.id, actorId: ops.id, amount: 500000, note: "Turf and edging" });
    const accepted = await respondToQuote({ quoteId: q.id, customerId: cust.id, accept: true });
    expect(accepted.status).toBe("awaiting_payment");
    expect(accepted.total).toBe(600000);
    expect(accepted.depositAmount).toBe(240000);
    const paid = await pay(b.id, cust.id, cust.email, "deposit");
    expect(paid.paymentState).toBe("deposit_paid");
    expect(paid.status).toBe("accepted"); // Kwame (company) is the only landscaper free → auto accepted
    // cannot confirm completion while balance is outstanding
    await db.update(schema.bookings).set({ status: "awaiting_confirmation" }).where(eq(schema.bookings.id, b.id));
    await expect(confirmCompletion(b.id, { userId: cust.id, customerId: cust.id })).rejects.toThrow(/balance/);
    const balance = await pay(b.id, cust.id, cust.email);
    expect(balance.amountPaid).toBe(600000);
    const done = await confirmCompletion(b.id, { userId: cust.id, customerId: cust.id });
    expect(done.status).toBe("completed");
    const comm = await db.select().from(schema.commissions).where(eq(schema.commissions.bookingId, b.id));
    expect(comm).toHaveLength(0); // company gardener: no commission, all company revenue
  });

  it("declined offer goes to the next eligible gardener", async () => {
    const cust = await newCustomer();
    const svc = await serviceBySlug("standard-lawn-mowing");
    const { gardener, user } = await gardenerByEmail("kojo.antwi@example.com");
    const b = await createBooking({ ...baseInput(cust.id, svc.id, nextWeekday(15), "13:00"), gardenSizeSqm: 100, gardenerId: gardener.id });
    await pay(b.id, cust.id, cust.email);
    const after = await respondToOffer({ bookingId: b.id, gardenerId: gardener.id, userId: user.id, accept: false, reason: "Mower in repair" });
    expect(after.status).toBe("pending_assignment");
    const [now] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, b.id));
    expect(now!.gardenerId).not.toBe(gardener.id);
    expect(["accepted", "assigned"]).toContain(now!.status);
  });
});

describe("cancellation, rescheduling and disputes", () => {
  it("free cancellation refunds in full", async () => {
    const cust = await newCustomer();
    const svc = await serviceBySlug("garden-consultation");
    const b = await createBooking(baseInput(cust.id, svc.id, nextWeekday(18), "15:00"));
    await pay(b.id, cust.id, cust.email);
    const { refund } = await cancelBooking({ bookingId: b.id, actorId: cust.id, reason: "Travelling", byCustomer: true });
    expect(refund).toBe(b.total);
    const [after] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, b.id));
    expect(after).toMatchObject({ status: "cancelled", paymentState: "refunded", amountRefunded: b.total });
    const refunds = await db.select().from(schema.refunds);
    expect(refunds.length).toBeGreaterThan(0);
  });

  it("reschedule limit applies to customers", async () => {
    const cust = await newCustomer();
    const svc = await serviceBySlug("garden-consultation");
    const b = await createBooking(baseInput(cust.id, svc.id, nextWeekday(20), "08:00"));
    await rescheduleBooking({ bookingId: b.id, actorId: cust.id, date: nextWeekday(21), time: "09:00", byCustomer: true });
    await rescheduleBooking({ bookingId: b.id, actorId: cust.id, date: nextWeekday(22), time: "09:00", byCustomer: true });
    await expect(rescheduleBooking({ bookingId: b.id, actorId: cust.id, date: nextWeekday(23), time: "09:00", byCustomer: true })).rejects.toThrow(/at most/);
  });

  it("dispute with partial refund reverses and re-records commission on the net", async () => {
    const cust = await newCustomer();
    const ops = await userByEmail("ops@homegardens.example");
    const svc = await serviceBySlug("weed-control");
    const { gardener, user } = await gardenerByEmail("efua.boakye@example.com");
    const labone = await cityByName("Labone");
    const b = await createBooking({ ...baseInput(cust.id, svc.id, nextWeekday(24), "09:00"), cityId: labone.id, gardenSizeSqm: 100, gardenerId: gardener.id });
    await pay(b.id, cust.id, cust.email);
    await respondToOffer({ bookingId: b.id, gardenerId: gardener.id, userId: user.id, accept: true });
    await db.update(schema.bookings).set({ scheduledStart: new Date(Date.now() + 3600_000), scheduledEnd: new Date(Date.now() + 2 * 3600_000) }).where(eq(schema.bookings.id, b.id));
    await startJob(b.id, gardener.id, user.id);
    await completeJob(b.id, gardener.id, user.id, ["/media/x.jpg"]);
    await raiseDispute({ bookingId: b.id, customerId: cust.id, reason: "Half the beds were not weeded" });
    const res = await resolveDispute({ bookingId: b.id, actorId: ops.id, outcome: "refund", refundAmount: 6000, note: "Refunded part" });
    expect(res.status).toBe("completed");
    const comms = await db.select().from(schema.commissions).where(eq(schema.commissions.bookingId, b.id));
    expect(comms).toHaveLength(1);
    // 100 m² × GH₵4 = 40000 + 20% tax = 48000 paid; net = 48000 - 6000 refunded - 8000 tax
    expect(comms[0]!.grossAmount).toBe(34000);
    const tickets = await db.select().from(schema.supportTickets).where(and(eq(schema.supportTickets.bookingId, b.id), eq(schema.supportTickets.category, "dispute")));
    expect(tickets).toHaveLength(1);
  });
});

describe("gardener payouts", () => {
  it("earnings mature, payout reserves and pays out", async () => {
    const { gardener } = await gardenerByEmail("kojo.antwi@example.com");
    const fin = await userByEmail("finance@homegardens.example");
    await db.update(schema.commissions).set({ availableAt: new Date(Date.now() - 1000) }).where(eq(schema.commissions.gardenerId, gardener.id));
    await releaseMaturedCommissions(gardener.id);
    const [w] = await db.select().from(schema.gardenerWallets).where(eq(schema.gardenerWallets.gardenerId, gardener.id));
    expect(w!.availableBalance).toBeGreaterThan(0);
    await expect(requestPayout(gardener.id, w!.availableBalance + 1, "GHS", 100)).rejects.toThrow(/more than/);
    const p = await requestPayout(gardener.id, w!.availableBalance, "GHS", 100);
    await expect(decidePayout(p.id, "paid", fin.id, {})).rejects.toThrow(/reference/);
    await decidePayout(p.id, "paid", fin.id, { providerReference: "MOMO-123", provider: "mtn_momo" });
    const [w2] = await db.select().from(schema.gardenerWallets).where(eq(schema.gardenerWallets.gardenerId, gardener.id));
    expect(w2).toMatchObject({ availableBalance: 0, reservedBalance: 0, totalPaidOut: w!.availableBalance });
  });

  it("company gardeners cannot request payouts", async () => {
    const { gardener } = await gardenerByEmail("kwame.mensah@homegardens.example");
    await expect(requestPayout(gardener.id, 1000, "GHS", 0)).rejects.toThrow(/independent/);
  });
});
