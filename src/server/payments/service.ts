import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { reference } from "@/lib/ids";
import { formatMoney } from "@/lib/money";
import { getProvider } from "./registry";
import { UserError, reportError } from "../errors";
import { ledger } from "../finance";
import { audit } from "../audit";
import { amountDue, applyBookingPayment, autoAssign } from "../bookings/engine";
import { applyOrderPayment, notifyOrderPaid } from "../commerce/orders";
import { applyRegistrationPayment, sendRegistrationNotice } from "../activities";
import { refundSubject } from "./refunds";
import { notify } from "../notify";
import { getSettings } from "../settings";
import { redeemCoupon } from "../coupons";
import { formatDateTime } from "@/lib/utils";
import { countryTimeZone } from "../bookings/availability";

type Purpose = "booking" | "order" | "activity";
const APP = () => process.env.APP_URL ?? "http://localhost:3000";

/** Creates a payment record and starts checkout with the provider. Returns the URL to send the customer to. */
export async function initiatePayment(opts: { purpose: Purpose; subjectId: string; userId: string; email: string; provider: string; kind?: "deposit" | "full" | "balance" }) {
  const provider = getProvider(opts.provider);
  if (!provider.configured()) throw new UserError("This payment method is not available right now.");

  let amount = 0, currency = "", description = "", kind: "deposit" | "full" | "balance" = "full", returnPath = "", allowedProviders: string[] = [];
  if (opts.purpose === "booking") {
    const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, opts.subjectId));
    if (!b || b.customerId !== opts.userId) throw new UserError("Booking not found.");
    kind = b.status === "awaiting_payment" ? (opts.kind === "deposit" ? "deposit" : "full") : "balance";
    amount = amountDue(b, kind);
    currency = b.currency;
    description = `Booking ${b.reference}`;
    returnPath = `/account/bookings/${b.id}`;
    allowedProviders = await countryProviders(b.countryCode);
  } else if (opts.purpose === "order") {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, opts.subjectId));
    if (!o || o.userId !== opts.userId) throw new UserError("Order not found.");
    if (o.status !== "pending_payment") throw new UserError("This order does not need payment.");
    amount = o.total - o.amountPaid;
    currency = o.currency;
    description = `Order ${o.reference}`;
    returnPath = `/account/orders/${o.id}`;
    allowedProviders = await countryProviders(o.shippingAddress.countryCode ?? "GH");
  } else {
    const [r] = await db.select({ r: schema.activityRegistrations, a: schema.activities })
      .from(schema.activityRegistrations)
      .innerJoin(schema.activitySessions, eq(schema.activitySessions.id, schema.activityRegistrations.sessionId))
      .innerJoin(schema.activities, eq(schema.activities.id, schema.activitySessions.activityId))
      .where(eq(schema.activityRegistrations.id, opts.subjectId));
    if (!r || r.r.userId !== opts.userId) throw new UserError("Registration not found.");
    if (r.r.status !== "pending_payment") throw new UserError("This registration does not need payment.");
    amount = r.r.amount;
    currency = r.r.currency;
    description = `${r.a.title} (${r.r.quantity} seat${r.r.quantity > 1 ? "s" : ""})`;
    returnPath = `/account/activities`;
    allowedProviders = await countryProviders(r.a.countryCode);
  }
  if (amount <= 0) throw new UserError("Nothing is due for payment.");
  if (!allowedProviders.includes(provider.key)) throw new UserError("This payment method is not offered in your country.");
  if (!provider.currencies.includes(currency)) throw new UserError(`${provider.label} does not support ${currency}.`);

  const ref = reference("PAY");
  const [p] = await db
    .insert(schema.payments)
    .values({
      reference: ref,
      provider: provider.key,
      purpose: opts.purpose,
      bookingId: opts.purpose === "booking" ? opts.subjectId : null,
      orderId: opts.purpose === "order" ? opts.subjectId : null,
      registrationId: opts.purpose === "activity" ? opts.subjectId : null,
      userId: opts.userId,
      kind,
      amount,
      currency,
      status: "initiated",
      idempotencyKey: `${opts.purpose}:${opts.subjectId}:${ref}`,
    })
    .returning();
  try {
    const init = await provider.initialize({
      reference: ref,
      amount,
      currency,
      email: opts.email,
      description,
      callbackUrl: `${APP()}/api/payments/return?reference=${encodeURIComponent(ref)}`,
      cancelUrl: `${APP()}${returnPath}?payment=cancelled`,
      metadata: { purpose: opts.purpose, subjectId: opts.subjectId, reference: ref },
    });
    await db.update(schema.payments).set({ status: "pending", checkoutUrl: init.checkoutUrl, providerReference: init.providerReference ?? null }).where(eq(schema.payments.id, p!.id));
    return { url: init.checkoutUrl, reference: ref };
  } catch (e) {
    await db.update(schema.payments).set({ status: "failed", failureReason: (e as Error).message.slice(0, 300) }).where(eq(schema.payments.id, p!.id));
    await reportError(e, { where: "initiatePayment", reference: ref });
    throw new UserError("We could not start the payment with the provider. Please try again or choose another method.");
  }
}

async function countryProviders(code: string) {
  const [c] = await db.select({ p: schema.countries.paymentProviders }).from(schema.countries).where(eq(schema.countries.code, code));
  return c?.p ?? [];
}

/**
 * Verifies a payment with the provider (never trusting the browser redirect) and applies it.
 * Idempotent: safe to call from the return URL, webhooks and the reconciliation job.
 */
export async function verifyAndApply(ref: string, providerRefHint?: string | null) {
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.reference, ref));
  if (!p) throw new UserError("Payment not found.");
  if (p.status === "succeeded" || p.status === "refunded" || p.status === "partially_refunded") return p;
  if (p.provider === "manual") return p;
  const provider = getProvider(p.provider);
  const v = await provider.verify(p.reference, p.providerReference ?? providerRefHint);
  if (v.status === "pending") return p;
  if (v.status === "failed") {
    const [u] = await db.update(schema.payments).set({ status: "failed", failureReason: v.failureReason ?? "Declined", providerPayload: v.raw as object, updatedAt: new Date() }).where(and(eq(schema.payments.id, p.id), sql`${schema.payments.status} in ('initiated','pending')`)).returning();
    return u ?? p;
  }
  if (v.currency !== p.currency || v.amount < p.amount) {
    await db.update(schema.payments).set({ status: "failed", failureReason: `Amount mismatch: expected ${p.amount} ${p.currency}, got ${v.amount} ${v.currency}`, providerPayload: v.raw as object }).where(eq(schema.payments.id, p.id));
    await reportError(new Error("Payment amount mismatch"), { reference: ref });
    return p;
  }
  return markSucceeded(p.id, { fee: v.fee ?? 0, channel: v.channel, providerReference: v.providerReference, raw: v.raw, actorId: null });
}

/** Single place where a payment becomes successful. Locks the row so concurrent webhooks apply it once. */
async function markSucceeded(paymentId: string, info: { fee: number; channel?: string; providerReference?: string; raw: unknown; actorId: string | null }) {
  const effects = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).for("update");
    if (!p) throw new Error("payment missing");
    if (p.status === "succeeded") return null;
    await tx
      .update(schema.payments)
      .set({ status: "succeeded", fee: info.fee, channel: info.channel ?? p.channel, providerReference: info.providerReference ?? p.providerReference, providerPayload: (info.raw ?? p.providerPayload) as object, verifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.payments.id, p.id));
    const stream = p.purpose === "booking" ? "services" : p.purpose === "order" ? "products" : "activities";
    await ledger(tx, [
      { account: "gross_receipts", amount: p.amount, currency: p.currency, paymentId: p.id, bookingId: p.bookingId, orderId: p.orderId, registrationId: p.registrationId, revenueStream: stream, description: `Payment ${p.reference} via ${p.provider}` },
      { account: "processing_fees", amount: info.fee, currency: p.currency, paymentId: p.id, revenueStream: stream, description: `Processing fee ${p.reference}` },
    ]);
    if (p.bookingId) {
      const needsAssignment = await applyBookingPayment(tx, p.bookingId, p.amount, info.actorId);
      const [b] = await tx.select().from(schema.bookings).where(eq(schema.bookings.id, p.bookingId));
      if (needsAssignment && b?.couponId) await redeemCoupon(tx, b.couponId, { userId: b.customerId, amount: b.discount, currency: b.currency, bookingId: b.id });
      return { p, needsAssignment, booking: b };
    }
    if (p.orderId) {
      const r = await applyOrderPayment(tx, p.orderId, p.amount);
      return { p, orderPaid: r.becamePaid };
    }
    const r = await applyRegistrationPayment(tx, p.registrationId!, p.amount);
    return { p, registration: r };
  });
  if (!effects) {
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
    return p!;
  }
  const { p } = effects;
  await notify(p.userId, "payment_confirmation", { reference: p.reference, amount: formatMoney(p.amount, p.currency) });
  if ("booking" in effects && effects.booking) {
    const b = effects.booking;
    if (effects.needsAssignment) {
      const [svc] = await db.select({ name: schema.services.name }).from(schema.services).where(eq(schema.services.id, b.serviceId));
      const tz = await countryTimeZone(b.countryCode);
      await notify(b.customerId, "booking_confirmed", { reference: b.reference, service: svc?.name, date: formatDateTime(b.scheduledStart, tz) }, `/account/bookings/${b.id}`);
      await autoAssign(b.id, null, await getSettings());
    }
  } else if ("orderPaid" in effects && effects.orderPaid) {
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, p.orderId!));
    if (o) await notifyOrderPaid(o);
  } else if ("registration" in effects && effects.registration) {
    if (effects.registration.needsRefund) await refundSubject({ registrationId: p.registrationId! }, p.amount, "Session filled before payment completed", null);
    else await sendRegistrationNotice(p.registrationId!);
  }
  const [fresh] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
  return fresh!;
}

/** Finance staff confirm an offline transfer after checking the bank / MoMo statement. */
export async function confirmManualPayment(paymentId: string, actorId: string, transferReference: string) {
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
  if (!p || p.provider !== "manual") throw new UserError("Only manual transfers can be confirmed here.");
  if (p.status !== "pending") throw new UserError("This payment is not awaiting confirmation.");
  if (!transferReference.trim()) throw new UserError("Enter the transfer reference from the statement.", "transferReference");
  const res = await markSucceeded(p.id, { fee: 0, channel: "transfer", providerReference: transferReference.trim(), raw: { confirmedBy: actorId }, actorId });
  await audit({ actorId, action: "payment.manual_confirm", entityType: "payment", entityId: p.id, meta: { transferReference } });
  return res;
}

export async function rejectManualPayment(paymentId: string, actorId: string, reason: string) {
  const [u] = await db
    .update(schema.payments)
    .set({ status: "failed", failureReason: reason || "Transfer not found", updatedAt: new Date() })
    .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.provider, "manual"), eq(schema.payments.status, "pending")))
    .returning();
  if (!u) throw new UserError("This payment is not awaiting confirmation.");
  await audit({ actorId, action: "payment.manual_reject", entityType: "payment", entityId: paymentId, meta: { reason } });
}

/** Records a webhook delivery once (provider + event id); returns false if it was already processed. */
export async function recordWebhookEvent(provider: string, eventId: string, type: string, payload: unknown) {
  const [row] = await db.insert(schema.paymentEvents).values({ provider, eventId, type, payload: payload as object }).onConflictDoNothing().returning();
  return row ?? null;
}

export async function markWebhookProcessed(id: string, error?: string) {
  await db.update(schema.paymentEvents).set({ processedAt: new Date(), error: error ?? null }).where(eq(schema.paymentEvents.id, id));
}

/** Re-checks payments stuck in pending (e.g. a lost webhook). */
export async function reconcilePendingPayments(olderThanMinutes = 5) {
  const rows = await db
    .select({ reference: schema.payments.reference })
    .from(schema.payments)
    .where(sql`${schema.payments.status} = 'pending' and ${schema.payments.provider} <> 'manual' and ${schema.payments.createdAt} < now() - make_interval(mins => ${olderThanMinutes}) and ${schema.payments.createdAt} > now() - interval '3 days'`);
  let n = 0;
  for (const r of rows) {
    try {
      await verifyAndApply(r.reference);
      n++;
    } catch (e) {
      await reportError(e, { where: "reconcile", reference: r.reference });
    }
  }
  return n;
}

export { markSucceeded as _markSucceededForTests };
