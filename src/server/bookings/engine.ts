/**
 * Booking engine. All state changes go through `transition`, which enforces the
 * allowed status graph and writes status history inside the same transaction.
 */
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { reference } from "@/lib/ids";
import { zonedToUtc, zonedInfo } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { UserError } from "../errors";
import { audit } from "../audit";
import { applyTaxes, cancellationRefund, couponDiscount, depositFor, priceService, type PricingModel } from "../pricing";
import { convertAmount } from "../currency";
import { eligibleGardeners, countryTimeZone } from "./availability";
import { recordBookingEarnings, reverseCommission } from "../finance";
import { notify, notifyStaff } from "../notify";
import { refundSubject } from "../payments/refunds";
import { getSettings, DEFAULT_SETTINGS, type Settings } from "../settings";
import { validateCoupon } from "../coupons";

type Status = (typeof schema.bookingStatus.enumValues)[number];
type Booking = typeof schema.bookings.$inferSelect;

const TRANSITIONS: Record<Status, Status[]> = {
  awaiting_quote: ["quoted", "cancelled"],
  quoted: ["quoted", "awaiting_payment", "cancelled", "awaiting_quote"],
  awaiting_payment: ["pending_assignment", "cancelled", "quoted"],
  pending_assignment: ["assigned", "accepted", "cancelled"],
  assigned: ["accepted", "pending_assignment", "cancelled", "assigned"],
  accepted: ["in_progress", "pending_assignment", "cancelled", "accepted"],
  in_progress: ["awaiting_confirmation", "disputed"],
  awaiting_confirmation: ["completed", "disputed"],
  completed: ["disputed"],
  disputed: ["completed", "cancelled"],
  cancelled: [],
};

export function canTransition(from: Status, to: Status) {
  return TRANSITIONS[from].includes(to);
}

async function transition(tx: Tx, b: Booking, to: Status, actorId: string | null, note?: string, patch: Partial<typeof schema.bookings.$inferInsert> = {}) {
  if (!canTransition(b.status, to)) throw new UserError(`A booking that is ${b.status.replace(/_/g, " ")} cannot move to ${to.replace(/_/g, " ")}.`);
  const [updated] = await tx
    .update(schema.bookings)
    .set({ ...patch, status: to, updatedAt: new Date() })
    .where(and(eq(schema.bookings.id, b.id), eq(schema.bookings.status, b.status))) // optimistic concurrency
    .returning();
  if (!updated) throw new UserError("This booking was changed by someone else. Refresh and try again.");
  await tx.insert(schema.bookingStatusHistory).values({ bookingId: b.id, fromStatus: b.status, toStatus: to, actorId, note: note ?? null });
  return updated;
}

async function lockBooking(tx: Tx, id: string) {
  const [b] = await tx.select().from(schema.bookings).where(eq(schema.bookings.id, id)).for("update");
  if (!b) throw new UserError("Booking not found.");
  return b;
}

/** Postgres exclusion-constraint violation => the gardener got double booked concurrently. */
function isOverlapError(e: unknown) {
  const err = e as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const code = err.code ?? err.cause?.code;
  const c = err.constraint_name ?? err.cause?.constraint_name;
  return code === "23P01" || c === "bookings_no_gardener_overlap";
}

/* ------------------------------------------------------------------ */
/* Pricing a booking                                                   */
/* ------------------------------------------------------------------ */
export async function quoteServicePrice(opts: {
  serviceId: string;
  countryCode: string;
  gardenSizeSqm?: number | null;
  hours?: number | null;
  gardenerId?: string | null;
  couponCode?: string | null;
  userId?: string | null;
}) {
  const [svc] = await db.select().from(schema.services).where(eq(schema.services.id, opts.serviceId));
  if (!svc || !svc.active) throw new UserError("This service is not available.");
  const [country] = await db.select().from(schema.countries).where(eq(schema.countries.code, opts.countryCode));
  if (!country || !country.servicesEnabled) throw new UserError("We do not offer garden services in this country yet.");
  const currency = country.currency;

  let unit: number;
  let minimum: number;
  const [override] = await db
    .select()
    .from(schema.servicePrices)
    .where(and(eq(schema.servicePrices.serviceId, svc.id), eq(schema.servicePrices.countryCode, opts.countryCode)));
  if (override && override.currency === currency) {
    unit = override.basePrice;
    minimum = override.minimumCharge;
  } else {
    unit = await convertAmount(svc.basePrice, svc.currency, currency);
    minimum = await convertAmount(svc.minimumCharge, svc.currency, currency);
  }
  if (opts.gardenerId) {
    const [gs] = await db
      .select({ customPrice: schema.gardenerServices.customPrice, currency: schema.gardenerProfiles.currency, type: schema.gardenerProfiles.type })
      .from(schema.gardenerServices)
      .innerJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.gardenerServices.gardenerId))
      .where(and(eq(schema.gardenerServices.gardenerId, opts.gardenerId), eq(schema.gardenerServices.serviceId, svc.id)));
    if (gs?.customPrice && gs.type === "independent") unit = await convertAmount(gs.customPrice, gs.currency, currency);
  }

  const priced = priceService({
    model: svc.pricingModel as PricingModel,
    unitPrice: unit,
    minimumCharge: minimum,
    durationMinutes: svc.durationMinutes,
    gardenSizeSqm: opts.gardenSizeSqm,
    hours: opts.hours,
  });
  if (priced.kind === "quote") return { service: svc, currency, kind: "quote" as const, reason: priced.reason };

  const coupon = opts.couponCode ? await validateCoupon(opts.couponCode, { scope: "services", currency, subtotal: priced.subtotal, userId: opts.userId ?? null }) : null;
  const discount = couponDiscount(priced.subtotal, coupon);
  const taxes = await taxRules(opts.countryCode, "services");
  const t = applyTaxes(priced.subtotal - discount, taxes);
  return {
    service: svc,
    currency,
    kind: "priced" as const,
    subtotal: priced.subtotal,
    discount,
    tax: t.tax,
    taxLines: t.lines,
    total: t.total,
    deposit: depositFor(t.total, svc.depositPercent),
    isFinal: priced.isFinal,
    breakdown: priced.breakdown,
    coupon,
  };
}

export async function taxRules(countryCode: string, scope: "services" | "products" | "activities") {
  const rows = await db
    .select()
    .from(schema.taxConfigurations)
    .where(and(eq(schema.taxConfigurations.countryCode, countryCode), eq(schema.taxConfigurations.active, true), inArray(schema.taxConfigurations.scope, ["all", scope])));
  return rows.map((r) => ({ rateBps: r.rateBps, inclusive: r.inclusive, name: r.name }));
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */
export type CreateBookingInput = {
  customerId: string;
  serviceId: string;
  countryCode: string;
  cityId: number;
  address: { line1: string; line2?: string; region?: string; digitalAddress?: string };
  contactPhone: string;
  date: string; // YYYY-MM-DD local
  time: string; // HH:MM local
  gardenSizeSqm?: number | null;
  hours?: number | null;
  details: string;
  customerNotes?: string | null;
  gardenerId?: string | null; // customer's choice
  couponCode?: string | null;
  photos?: string[];
  createdBy?: string; // staff creating on behalf
};

export async function createBooking(input: CreateBookingInput) {
  const settings = await getSettings();
  const [city] = await db.select().from(schema.cities).where(eq(schema.cities.id, input.cityId));
  if (!city || city.countryCode !== input.countryCode || !city.serviceAvailable) throw new UserError("We do not serve this city yet.", "cityId");
  const areas = await db.select().from(schema.serviceAreas).where(eq(schema.serviceAreas.serviceId, input.serviceId));
  if (areas.length && !areas.some((a) => a.cityId === input.cityId)) throw new UserError("This service is not offered in the selected city.", "cityId");

  const tz = await countryTimeZone(input.countryCode);
  const quote = await quoteServicePrice({
    serviceId: input.serviceId,
    countryCode: input.countryCode,
    gardenSizeSqm: input.gardenSizeSqm,
    hours: input.hours,
    gardenerId: input.gardenerId,
    couponCode: input.couponCode,
    userId: input.customerId,
  });
  const svc = quote.service;
  const durationMin = svc.pricingModel === "hourly" && input.hours ? Math.round(input.hours * 60) : svc.durationMinutes;
  const start = zonedToUtc(input.date, input.time, tz);
  const end = new Date(start.getTime() + durationMin * 60_000);
  const lead = (start.getTime() - Date.now()) / 3600_000;
  if (!input.createdBy && lead < settings.booking.minLeadHours) throw new UserError(`Bookings need at least ${settings.booking.minLeadHours} hours' notice.`, "date");
  if (lead < 0) throw new UserError("Choose a time in the future.", "date");
  if (lead > settings.booking.maxAdvanceDays * 24) throw new UserError(`Bookings can be made up to ${settings.booking.maxAdvanceDays} days ahead.`, "date");

  if (input.gardenerId) {
    const ok = await eligibleGardeners({ serviceId: svc.id, cityId: input.cityId, start, end, timeZone: tz, onlyGardenerId: input.gardenerId });
    if (!ok.length) throw new UserError("That gardener is not available at this time. Pick another slot or let us match you.", "time");
  }

  const priced = quote.kind === "priced";
  const status: Status = priced ? "awaiting_payment" : "awaiting_quote";
  const booking = await db.transaction(async (tx) => {
    const [b] = await tx
      .insert(schema.bookings)
      .values({
        reference: reference("BK"),
        customerId: input.customerId,
        serviceId: svc.id,
        requestedGardenerId: input.gardenerId ?? null,
        status,
        assignmentMode: input.gardenerId ? "customer_choice" : settings.booking.autoAssign ? "auto" : "manual",
        scheduledStart: start,
        scheduledEnd: end,
        countryCode: input.countryCode,
        cityId: input.cityId,
        address: { ...input.address, city: city.name, countryCode: input.countryCode },
        contactPhone: input.contactPhone,
        gardenSizeSqm: input.gardenSizeSqm ?? null,
        estimatedHours: input.hours != null ? String(input.hours) : null,
        details: input.details,
        customerNotes: input.customerNotes ?? null,
        currency: quote.currency,
        subtotal: priced ? quote.subtotal : 0,
        discount: priced ? quote.discount : 0,
        tax: priced ? quote.tax : 0,
        total: priced ? quote.total : 0,
        depositAmount: priced ? quote.deposit : 0,
        couponId: priced && quote.coupon ? quote.coupon.id : null,
        priceIsFinal: priced ? quote.isFinal : false,
      })
      .returning();
    await tx.insert(schema.bookingStatusHistory).values({ bookingId: b!.id, toStatus: status, actorId: input.createdBy ?? input.customerId, note: input.createdBy ? "Created by staff" : null });
    if (input.photos?.length) {
      await tx.insert(schema.bookingMedia).values(input.photos.map((url) => ({ bookingId: b!.id, kind: "request" as const, url, uploadedBy: input.createdBy ?? input.customerId })));
    }
    if (input.createdBy) await audit({ actorId: input.createdBy, action: "booking.create", entityType: "booking", entityId: b!.id }, tx);
    return b!;
  });

  await notify(input.customerId, "booking_created", { reference: booking.reference, service: svc.name, date: formatDateTime(start, tz) }, `/account/bookings/${booking.id}`);
  if (!priced) await notifyStaff("bookings.manage", `Quote needed: ${booking.reference}`, `${svc.name} in ${city.name} needs a quote.`, `/admin/bookings/${booking.id}`);
  return booking;
}

/* ------------------------------------------------------------------ */
/* Quotes                                                              */
/* ------------------------------------------------------------------ */
export async function issueQuote(opts: { bookingId: string; actorId: string; gardenerId?: string | null; amount: number; estimatedHours?: number | null; note?: string | null; validDays?: number }) {
  if (opts.amount <= 0) throw new UserError("Enter a quote amount.", "amount");
  const result = await db.transaction(async (tx) => {
    const b = await lockBooking(tx, opts.bookingId);
    if (opts.gardenerId) {
      // Gardeners may quote on requests addressed to them, or propose a revised price on an offered job.
      const mine = b.requestedGardenerId === opts.gardenerId || b.gardenerId === opts.gardenerId;
      if (!mine) throw new UserError("You can only quote on jobs offered to you.");
      if (!["awaiting_quote", "quoted", "assigned"].includes(b.status)) throw new UserError("This job can no longer be quoted.");
      if (b.status === "assigned") {
        const [svc] = await tx.select().from(schema.services).where(eq(schema.services.id, b.serviceId));
        if (svc && ["fixed"].includes(svc.pricingModel)) throw new UserError("Fixed-price services cannot be re-quoted.");
      }
    } else if (!["awaiting_quote", "quoted", "awaiting_payment"].includes(b.status)) {
      throw new UserError("Quotes can only be issued before payment.");
    }
    await tx.update(schema.bookingQuotes).set({ status: "superseded" }).where(and(eq(schema.bookingQuotes.bookingId, b.id), eq(schema.bookingQuotes.status, "pending")));
    const [q] = await tx
      .insert(schema.bookingQuotes)
      .values({
        bookingId: b.id,
        gardenerId: opts.gardenerId ?? null,
        createdBy: opts.actorId,
        amount: opts.amount,
        currency: b.currency,
        estimatedHours: opts.estimatedHours != null ? String(opts.estimatedHours) : null,
        note: opts.note ?? null,
        validUntil: new Date(Date.now() + (opts.validDays ?? 7) * 86400_000),
      })
      .returning();
    if (b.status !== "assigned") await transition(tx, b, "quoted", opts.actorId, `Quote ${formatMoney(opts.amount, b.currency)}`);
    else await tx.insert(schema.bookingStatusHistory).values({ bookingId: b.id, fromStatus: b.status, toStatus: b.status, actorId: opts.actorId, note: `Gardener proposed revised price ${formatMoney(opts.amount, b.currency)}` });
    return { b, q: q! };
  });
  const [svc] = await db.select({ name: schema.services.name }).from(schema.services).where(eq(schema.services.id, result.b.serviceId));
  await notify(result.b.customerId, "booking_quoted", { reference: result.b.reference, amount: formatMoney(opts.amount, result.b.currency), service: svc?.name }, `/account/bookings/${result.b.id}`);
  return result.q;
}

export async function respondToQuote(opts: { quoteId: string; customerId: string; accept: boolean }) {
  return db.transaction(async (tx) => {
    const [q] = await tx.select().from(schema.bookingQuotes).where(eq(schema.bookingQuotes.id, opts.quoteId)).for("update");
    if (!q || q.status !== "pending") throw new UserError("This quote is no longer open.");
    const b = await lockBooking(tx, q.bookingId);
    if (b.customerId !== opts.customerId) throw new UserError("Quote not found.");
    if (q.validUntil && q.validUntil < new Date()) {
      await tx.update(schema.bookingQuotes).set({ status: "expired" }).where(eq(schema.bookingQuotes.id, q.id));
      throw new UserError("This quote has expired. Ask us for a new one.");
    }
    await tx.update(schema.bookingQuotes).set({ status: opts.accept ? "accepted" : "declined", respondedAt: new Date() }).where(eq(schema.bookingQuotes.id, q.id));
    if (!opts.accept) {
      if (b.status === "quoted") await transition(tx, b, "awaiting_quote", opts.customerId, "Customer declined quote");
      return b;
    }
    const [svc] = await tx.select().from(schema.services).where(eq(schema.services.id, b.serviceId));
    const taxes = await taxRules(b.countryCode, "services");
    const t = applyTaxes(q.amount - b.discount > 0 ? q.amount - b.discount : q.amount, taxes);
    const patch = {
      subtotal: q.amount,
      tax: t.tax,
      total: t.total,
      depositAmount: depositFor(t.total, svc!.depositPercent),
      priceIsFinal: true,
      estimatedHours: q.estimatedHours,
    };
    if (b.status === "assigned") {
      // Revised price proposed by the gardener on an offered job: accepting confirms the gardener too.
      const updated = await transition(tx, b, "accepted", opts.customerId, "Customer accepted revised price", {
        ...patch,
        paymentState: b.amountPaid >= t.total ? "paid" : b.amountPaid > 0 ? "deposit_paid" : "unpaid",
      });
      await tx
        .update(schema.bookingAssignments)
        .set({ status: "accepted", respondedAt: new Date() })
        .where(and(eq(schema.bookingAssignments.bookingId, b.id), eq(schema.bookingAssignments.status, "offered")));
      return updated;
    }
    return transition(tx, b, "awaiting_payment", opts.customerId, "Quote accepted", patch);
  });
}

/* ------------------------------------------------------------------ */
/* Payment applied                                                     */
/* ------------------------------------------------------------------ */
/** Called inside the payment transaction. Returns true when the booking now needs assignment. */
export async function applyBookingPayment(tx: Tx, bookingId: string, amount: number, actorId: string | null) {
  const b = await lockBooking(tx, bookingId);
  const paid = b.amountPaid + amount;
  const paymentState = paid >= b.total ? "paid" : "deposit_paid";
  if (b.status === "awaiting_payment") {
    await transition(tx, b, "pending_assignment", actorId, "Payment received", { amountPaid: paid, paymentState });
    return true;
  }
  await tx.update(schema.bookings).set({ amountPaid: paid, paymentState, updatedAt: new Date() }).where(eq(schema.bookings.id, b.id));
  return false;
}

/** Amount the customer must pay now: deposit (or more) before work, remaining balance before completion. */
export function amountDue(b: Pick<Booking, "status" | "total" | "amountPaid" | "depositAmount">, kind: "deposit" | "full" | "balance") {
  if (b.status === "awaiting_payment") return kind === "deposit" ? b.depositAmount : b.total;
  if (["pending_assignment", "assigned", "accepted", "in_progress", "awaiting_confirmation"].includes(b.status)) return Math.max(b.total - b.amountPaid, 0);
  return 0;
}

/* ------------------------------------------------------------------ */
/* Assignment                                                          */
/* ------------------------------------------------------------------ */
async function offer(tx: Tx, b: Booking, gardenerId: string, method: "manual" | "auto" | "customer_choice", actorId: string | null, score?: number) {
  const [g] = await tx.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, gardenerId));
  if (!g || g.status !== "approved") throw new UserError("This gardener cannot take jobs.");
  const isCompany = g.type === "company";
  const to: Status = isCompany ? "accepted" : "assigned";
  const updated = await transition(tx, b, to, actorId, `${isCompany ? "Assigned" : "Offered"} to gardener (${method})`, { gardenerId });
  await tx.insert(schema.bookingAssignments).values({
    bookingId: b.id,
    gardenerId,
    method,
    status: isCompany ? "accepted" : "offered",
    score: score != null ? String(score) : null,
    assignedBy: actorId,
    respondedAt: isCompany ? new Date() : null,
  });
  return { updated, gardener: g };
}

async function notifyAssignment(b: Booking, g: typeof schema.gardenerProfiles.$inferSelect) {
  const [svc] = await db.select({ name: schema.services.name }).from(schema.services).where(eq(schema.services.id, b.serviceId));
  const tz = await countryTimeZone(b.countryCode);
  const vars = { reference: b.reference, service: svc?.name, date: formatDateTime(b.scheduledStart, tz), city: b.address.city };
  if (g.type === "company") {
    await notify(g.userId, "job_assigned", vars, `/gardener/jobs/${b.id}`);
    const [u] = await db.select({ name: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, g.userId));
    await notify(b.customerId, "booking_accepted", { ...vars, gardener: u?.name }, `/account/bookings/${b.id}`);
  } else {
    await notify(g.userId, "job_offered", vars, `/gardener/jobs/${b.id}`);
  }
}

/** Staff assigns a specific gardener. Validates availability; the DB constraint guards races. */
export async function assignGardener(bookingId: string, gardenerId: string, actorId: string) {
  const tz = await bookingTz(bookingId);
  try {
    const { updated, gardener } = await db.transaction(async (tx) => {
      let b = await lockBooking(tx, bookingId);
      const free = await eligibleGardeners({ serviceId: b.serviceId, cityId: b.cityId, start: b.scheduledStart, end: b.scheduledEnd, timeZone: tz, onlyGardenerId: gardenerId, excludeBookingId: b.id }, tx);
      if (!free.length) throw new UserError("This gardener is not available (schedule, service area, leave or existing job).");
      if (b.status === "assigned" || b.status === "accepted") {
        await tx
          .update(schema.bookingAssignments)
          .set({ status: "withdrawn", respondedAt: new Date() })
          .where(and(eq(schema.bookingAssignments.bookingId, b.id), inArray(schema.bookingAssignments.status, ["offered", "accepted"])));
        b = await transition(tx, b, "pending_assignment", actorId, "Reassignment", { gardenerId: null });
      }
      const r = await offer(tx, b, gardenerId, "manual", actorId);
      await audit({ actorId, action: "booking.assign", entityType: "booking", entityId: b.id, meta: { gardenerId } }, tx);
      return r;
    });
    await notifyAssignment(updated, gardener);
    return updated;
  } catch (e) {
    if (isOverlapError(e)) throw new UserError("That gardener was just booked for an overlapping job.");
    throw e;
  }
}

async function bookingTz(bookingId: string) {
  const [b] = await db.select({ c: schema.bookings.countryCode }).from(schema.bookings).where(eq(schema.bookings.id, bookingId));
  if (!b) throw new UserError("Booking not found.");
  return countryTimeZone(b.c);
}

/**
 * Automatic assignment: requested gardener first (if free), otherwise the best-scoring
 * eligible gardener who has not already declined. Leaves the booking for staff when nobody fits.
 */
export async function autoAssign(bookingId: string, actorId: string | null = null, settings: Settings = DEFAULT_SETTINGS) {
  const tz = await bookingTz(bookingId);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await db.transaction(async (tx) => {
        const b = await lockBooking(tx, bookingId);
        if (b.status !== "pending_assignment") return null;
        const declined = await tx
          .select({ g: schema.bookingAssignments.gardenerId })
          .from(schema.bookingAssignments)
          .where(and(eq(schema.bookingAssignments.bookingId, b.id), inArray(schema.bookingAssignments.status, ["rejected", "expired", "withdrawn"])));
        const exclude = declined.map((d) => d.g);
        const base = { serviceId: b.serviceId, cityId: b.cityId, start: b.scheduledStart, end: b.scheduledEnd, timeZone: tz, excludeBookingId: b.id, excludeGardenerIds: exclude };
        if (b.requestedGardenerId && !exclude.includes(b.requestedGardenerId)) {
          const req = await eligibleGardeners({ ...base, onlyGardenerId: b.requestedGardenerId }, tx);
          if (req.length) return offer(tx, b, b.requestedGardenerId, "customer_choice", actorId, req[0]!.score);
        }
        if (!settings.booking.autoAssign && actorId === null) return null;
        const candidates = await eligibleGardeners(base, tx);
        if (!candidates.length) return null;
        return offer(tx, b, candidates[0]!.gardenerId, "auto", actorId, candidates[0]!.score);
      });
      if (!res) {
        const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
        if (b?.status === "pending_assignment") {
          await notifyStaff("bookings.manage", `Assignment needed: ${b.reference}`, "No eligible gardener was found automatically.", `/admin/bookings/${b.id}`);
        }
        return null;
      }
      await notifyAssignment(res.updated, res.gardener);
      return res.updated;
    } catch (e) {
      if (isOverlapError(e)) continue; // a concurrent booking took the slot; recompute
      throw e;
    }
  }
  return null;
}

/** Recommendations for staff (does not assign). */
export async function recommendGardeners(bookingId: string) {
  const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId));
  if (!b) return [];
  const tz = await countryTimeZone(b.countryCode);
  return eligibleGardeners({ serviceId: b.serviceId, cityId: b.cityId, start: b.scheduledStart, end: b.scheduledEnd, timeZone: tz, excludeBookingId: b.id });
}

/** Independent gardener accepts or declines an offered job. */
export async function respondToOffer(opts: { bookingId: string; gardenerId: string; userId: string; accept: boolean; reason?: string }) {
  const settings = await getSettings();
  const b = await db.transaction(async (tx) => {
    const b = await lockBooking(tx, opts.bookingId);
    if (b.gardenerId !== opts.gardenerId || b.status !== "assigned") throw new UserError("This job is no longer waiting for your response.");
    await tx
      .update(schema.bookingAssignments)
      .set({ status: opts.accept ? "accepted" : "rejected", respondedAt: new Date(), reason: opts.reason ?? null })
      .where(and(eq(schema.bookingAssignments.bookingId, b.id), eq(schema.bookingAssignments.gardenerId, opts.gardenerId), eq(schema.bookingAssignments.status, "offered")));
    if (opts.accept) return transition(tx, b, "accepted", opts.userId, "Gardener accepted");
    return transition(tx, b, "pending_assignment", opts.userId, `Gardener declined${opts.reason ? `: ${opts.reason}` : ""}`, { gardenerId: null });
  });
  const [svc] = await db.select({ name: schema.services.name }).from(schema.services).where(eq(schema.services.id, b.serviceId));
  const [u] = await db.select({ name: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, opts.userId));
  const tz = await countryTimeZone(b.countryCode);
  if (opts.accept) {
    await notify(b.customerId, "booking_accepted", { reference: b.reference, service: svc?.name, gardener: u?.name, date: formatDateTime(b.scheduledStart, tz) }, `/account/bookings/${b.id}`);
  } else {
    await notifyStaff("bookings.manage", `Job declined: ${b.reference}`, `${u?.name} declined. ${opts.reason ?? ""}`, `/admin/bookings/${b.id}`);
    await autoAssign(b.id, null, settings);
  }
  return b;
}

/* ------------------------------------------------------------------ */
/* Doing the job                                                       */
/* ------------------------------------------------------------------ */
export async function startJob(bookingId: string, gardenerId: string, userId: string, beforePhotos: string[] = []) {
  const b = await db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.gardenerId !== gardenerId) throw new UserError("This job is not assigned to you.");
    if (b.scheduledStart.getTime() - Date.now() > 12 * 3600_000) throw new UserError("You can start a job on the day it is scheduled.");
    const updated = await transition(tx, b, "in_progress", userId, "Job started", { startedAt: new Date() });
    if (beforePhotos.length) await tx.insert(schema.bookingMedia).values(beforePhotos.map((url) => ({ bookingId, kind: "before" as const, url, uploadedBy: userId })));
    return updated;
  });
  return b;
}

export async function completeJob(bookingId: string, gardenerId: string, userId: string, afterPhotos: string[], note?: string) {
  if (!afterPhotos.length) throw new UserError("Add at least one photo of the finished work.", "photos");
  const b = await db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (b.gardenerId !== gardenerId) throw new UserError("This job is not assigned to you.");
    const updated = await transition(tx, b, "awaiting_confirmation", userId, note || "Gardener marked the job complete", { gardenerCompletedAt: new Date() });
    await tx.insert(schema.bookingMedia).values(afterPhotos.map((url) => ({ bookingId, kind: "after" as const, url, uploadedBy: userId })));
    return updated;
  });
  const [svc] = await db.select({ name: schema.services.name }).from(schema.services).where(eq(schema.services.id, b.serviceId));
  await notify(b.customerId, "booking_completed_by_gardener", { reference: b.reference, service: svc?.name }, `/account/bookings/${b.id}`);
  return b;
}

/** Customer (or the system after the confirmation window) confirms completion. Requires full payment. */
export async function confirmCompletion(bookingId: string, actor: { userId: string | null; customerId?: string; system?: boolean }) {
  const settings = await getSettings();
  const b = await db.transaction(async (tx) => {
    const b = await lockBooking(tx, bookingId);
    if (actor.customerId && b.customerId !== actor.customerId) throw new UserError("Booking not found.");
    if (b.amountPaid < b.total) throw new UserError("Please pay the remaining balance before confirming completion.");
    const updated = await transition(tx, b, "completed", actor.userId, actor.system ? "Auto-confirmed after confirmation window" : "Customer confirmed completion", { completedAt: new Date() });
    await recordBookingEarnings(tx, b.id, { holdDays: settings.finance.payoutHoldDays, defaultBps: settings.finance.defaultCommissionBps });
    if (b.gardenerId) {
      await tx.update(schema.gardenerProfiles).set({ jobsCompleted: sql`${schema.gardenerProfiles.jobsCompleted} + 1` }).where(eq(schema.gardenerProfiles.id, b.gardenerId));
    }
    return updated;
  });
  await notify(b.customerId, "booking_completed", { reference: b.reference }, `/account/bookings/${b.id}`);
  return b;
}

/* ------------------------------------------------------------------ */
/* Cancel / reschedule / dispute                                       */
/* ------------------------------------------------------------------ */
export async function cancelBooking(opts: { bookingId: string; actorId: string; reason: string; byCustomer: boolean; refundOverride?: number }) {
  const settings = await getSettings();
  const { b, refund } = await db.transaction(async (tx) => {
    const b = await lockBooking(tx, opts.bookingId);
    if (opts.byCustomer && b.customerId !== opts.actorId) throw new UserError("Booking not found.");
    if (["in_progress", "awaiting_confirmation", "completed", "cancelled"].includes(b.status) || (opts.byCustomer && b.status === "disputed")) {
      throw new UserError("This booking can no longer be cancelled. Contact support if there is a problem.");
    }
    const hours = (b.scheduledStart.getTime() - Date.now()) / 3600_000;
    const calc = cancellationRefund({
      amountPaid: b.amountPaid - b.amountRefunded,
      total: b.total,
      hoursBeforeStart: hours,
      freeCancellationHours: settings.booking.freeCancellationHours,
      lateFeePercent: settings.booking.lateCancellationFeePercent,
      cancelledByCustomer: opts.byCustomer,
    });
    const refund = opts.refundOverride != null ? Math.min(opts.refundOverride, b.amountPaid - b.amountRefunded) : calc.refund;
    await tx
      .update(schema.bookingAssignments)
      .set({ status: "withdrawn", respondedAt: new Date() })
      .where(and(eq(schema.bookingAssignments.bookingId, b.id), eq(schema.bookingAssignments.status, "offered")));
    await tx.update(schema.bookingQuotes).set({ status: "superseded" }).where(and(eq(schema.bookingQuotes.bookingId, b.id), eq(schema.bookingQuotes.status, "pending")));
    const updated = await transition(tx, b, "cancelled", opts.actorId, opts.reason, { cancellationReason: opts.reason, cancelledBy: opts.actorId, cancelledAt: new Date() });
    if (b.status === "disputed") await reverseCommission(tx, b.id);
    return { b: updated, refund };
  });
  let refundNote = "";
  if (refund > 0) {
    await refundSubject({ bookingId: b.id }, refund, `Cancellation ${b.reference}`, opts.actorId);
    refundNote = `A refund of ${formatMoney(refund, b.currency)} has been issued.`;
    await notify(b.customerId, "refund_processed", { reference: b.reference, amount: formatMoney(refund, b.currency) }, `/account/bookings/${b.id}`);
  }
  // Late cancellation fee kept by the company is recognised as revenue.
  const kept = b.amountPaid - b.amountRefunded - refund;
  if (kept > 0) {
    await db.insert(schema.ledgerEntries).values({ account: "company_revenue", amount: kept, currency: b.currency, bookingId: b.id, revenueStream: "services", description: `Cancellation fee ${b.reference}` });
  }
  await notify(b.customerId, "booking_cancelled", { reference: b.reference, note: refundNote }, `/account/bookings/${b.id}`);
  if (b.gardenerId) {
    const [g] = await db.select({ userId: schema.gardenerProfiles.userId }).from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, b.gardenerId));
    if (g) await notify(g.userId, "booking_cancelled", { reference: b.reference, note: "" }, `/gardener/jobs/${b.id}`);
  }
  return { booking: b, refund };
}

export async function rescheduleBooking(opts: { bookingId: string; actorId: string; date: string; time: string; byCustomer: boolean }) {
  const settings = await getSettings();
  const tz = await bookingTz(opts.bookingId);
  let needsReassign = false;
  try {
    const b = await db.transaction(async (tx) => {
      const b = await lockBooking(tx, opts.bookingId);
      if (opts.byCustomer && b.customerId !== opts.actorId) throw new UserError("Booking not found.");
      if (!["awaiting_quote", "quoted", "awaiting_payment", "pending_assignment", "assigned", "accepted"].includes(b.status)) {
        throw new UserError("This booking can no longer be rescheduled.");
      }
      if (opts.byCustomer && b.rescheduleCount >= settings.booking.maxReschedules) throw new UserError(`A booking can be rescheduled at most ${settings.booking.maxReschedules} times. Contact support for help.`);
      const start = zonedToUtc(opts.date, opts.time, tz);
      const duration = b.scheduledEnd.getTime() - b.scheduledStart.getTime();
      const end = new Date(start.getTime() + duration);
      const lead = (start.getTime() - Date.now()) / 3600_000;
      if (lead < (opts.byCustomer ? settings.booking.minLeadHours : 0)) throw new UserError(`Choose a time at least ${settings.booking.minLeadHours} hours from now.`, "date");
      let patch: Partial<typeof schema.bookings.$inferInsert> = { scheduledStart: start, scheduledEnd: end, rescheduleCount: b.rescheduleCount + 1, updatedAt: new Date() };
      if (b.gardenerId && (b.status === "assigned" || b.status === "accepted")) {
        const free = await eligibleGardeners({ serviceId: b.serviceId, cityId: b.cityId, start, end, timeZone: tz, onlyGardenerId: b.gardenerId, excludeBookingId: b.id }, tx);
        if (!free.length) {
          await tx
            .update(schema.bookingAssignments)
            .set({ status: "withdrawn", respondedAt: new Date(), reason: "Unavailable after reschedule" })
            .where(and(eq(schema.bookingAssignments.bookingId, b.id), inArray(schema.bookingAssignments.status, ["offered", "accepted"])));
          needsReassign = true;
          return transition(tx, b, "pending_assignment", opts.actorId, `Rescheduled to ${opts.date} ${opts.time}; gardener unavailable`, { ...patch, gardenerId: null });
        }
      }
      const [u] = await tx.update(schema.bookings).set(patch).where(eq(schema.bookings.id, b.id)).returning();
      await tx.insert(schema.bookingStatusHistory).values({ bookingId: b.id, fromStatus: b.status, toStatus: b.status, actorId: opts.actorId, note: `Rescheduled to ${opts.date} ${opts.time}` });
      return u!;
    });
    if (needsReassign) await autoAssign(b.id, null, settings);
    await notify(b.customerId, "booking_rescheduled", { reference: b.reference, date: formatDateTime(b.scheduledStart, tz) }, `/account/bookings/${b.id}`);
    if (b.gardenerId && !needsReassign) {
      const [g] = await db.select({ userId: schema.gardenerProfiles.userId }).from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, b.gardenerId));
      if (g) await notify(g.userId, "booking_rescheduled", { reference: b.reference, date: formatDateTime(b.scheduledStart, tz) }, `/gardener/jobs/${b.id}`);
    }
    return b;
  } catch (e) {
    if (isOverlapError(e)) throw new UserError("Your gardener already has a job at that time. Choose another time.");
    throw e;
  }
}

export async function raiseDispute(opts: { bookingId: string; customerId: string; reason: string }) {
  const { b, ticket } = await db.transaction(async (tx) => {
    const b = await lockBooking(tx, opts.bookingId);
    if (b.customerId !== opts.customerId) throw new UserError("Booking not found.");
    if (b.status === "completed" && b.completedAt && Date.now() - b.completedAt.getTime() > 7 * 86400_000) {
      throw new UserError("Disputes must be raised within 7 days of completion.");
    }
    const updated = await transition(tx, b, "disputed", opts.customerId, opts.reason);
    const [conv] = await tx.insert(schema.conversations).values({ type: "support", subject: `Dispute ${b.reference}`, bookingId: b.id, createdBy: opts.customerId }).returning();
    await tx.insert(schema.conversationParticipants).values({ conversationId: conv!.id, userId: opts.customerId, lastReadAt: new Date() });
    await tx.insert(schema.messages).values({ conversationId: conv!.id, senderId: opts.customerId, body: opts.reason });
    const [t] = await tx
      .insert(schema.supportTickets)
      .values({ reference: reference("TK"), userId: opts.customerId, category: "dispute", subject: `Dispute on booking ${b.reference}`, priority: "high", bookingId: b.id, conversationId: conv!.id })
      .returning();
    return { b: updated, ticket: t! };
  });
  await notifyStaff("support.manage", `Dispute: ${b.reference}`, opts.reason.slice(0, 140), `/admin/support/${ticket.id}`);
  return { booking: b, ticket };
}

/** Staff resolution: release payment to the gardener, or refund (fully => cancelled). */
export async function resolveDispute(opts: { bookingId: string; actorId: string; outcome: "release" | "refund"; refundAmount?: number; note: string }) {
  const settings = await getSettings();
  const [current] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, opts.bookingId));
  if (!current || current.status !== "disputed") throw new UserError("This booking is not in dispute.");
  const refundable = current.amountPaid - current.amountRefunded;
  if (opts.outcome === "refund") {
    const amt = opts.refundAmount ?? refundable;
    if (amt <= 0 || amt > refundable) throw new UserError("Enter a refund amount up to the amount paid.", "refundAmount");
    if (amt >= refundable) {
      await db.transaction(async (tx) => reverseCommission(tx, current.id));
      return (await cancelBooking({ bookingId: current.id, actorId: opts.actorId, reason: `Dispute resolved with full refund. ${opts.note}`, byCustomer: false, refundOverride: amt })).booking;
    }
    await db.transaction(async (tx) => reverseCommission(tx, current.id));
    await refundSubject({ bookingId: current.id }, amt, `Partial refund (dispute) ${current.reference}`, opts.actorId);
  }
  const b = await db.transaction(async (tx) => {
    const b = await lockBooking(tx, opts.bookingId);
    // Re-record earnings on the net amount (commission was reversed above for partial refunds).
    const existing = await tx.select().from(schema.commissions).where(and(eq(schema.commissions.bookingId, b.id), ne(schema.commissions.status, "reversed")));
    const updated = await transition(tx, b, "completed", opts.actorId, `Dispute resolved: ${opts.note}`, { completedAt: b.completedAt ?? new Date() });
    if (!existing.length) {
      await tx.delete(schema.commissions).where(and(eq(schema.commissions.bookingId, b.id), eq(schema.commissions.status, "reversed")));
      await recordBookingEarnings(tx, b.id, { holdDays: settings.finance.payoutHoldDays, defaultBps: settings.finance.defaultCommissionBps });
    }
    await audit({ actorId: opts.actorId, action: "booking.dispute_resolved", entityType: "booking", entityId: b.id, meta: { outcome: opts.outcome, refundAmount: opts.refundAmount } }, tx);
    return updated;
  });
  return b;
}

export async function bookingHistory(bookingId: string) {
  return db
    .select({ h: schema.bookingStatusHistory, actor: schema.users.fullName })
    .from(schema.bookingStatusHistory)
    .leftJoin(schema.users, eq(schema.users.id, schema.bookingStatusHistory.actorId))
    .where(eq(schema.bookingStatusHistory.bookingId, bookingId))
    .orderBy(desc(schema.bookingStatusHistory.createdAt));
}

export { zonedInfo };
