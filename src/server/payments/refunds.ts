import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getProvider } from "./registry";
import { ledger } from "../finance";
import { UserError, reportError } from "../errors";

type Subject = { bookingId?: string; orderId?: string; registrationId?: string };

/**
 * Refunds `amount` across the subject's successful payments (newest first).
 * A refund row is written before calling the provider so concurrent requests
 * cannot refund the same money twice. Returns the amount committed.
 */
export async function refundSubject(subject: Subject, amount: number, reason: string, actorId: string | null) {
  if (amount <= 0) return { refunded: 0, pending: 0 };
  const where = subject.bookingId
    ? eq(schema.payments.bookingId, subject.bookingId)
    : subject.orderId
      ? eq(schema.payments.orderId, subject.orderId)
      : eq(schema.payments.registrationId, subject.registrationId!);

  const plans = await db.transaction(async (tx) => {
    const pays = await tx
      .select()
      .from(schema.payments)
      .where(and(where, sql`${schema.payments.status} in ('succeeded','partially_refunded')`))
      .orderBy(desc(schema.payments.createdAt))
      .for("update");
    const refundable = pays.reduce((s, p) => s + (p.amount - p.amountRefunded), 0);
    if (amount > refundable) throw new UserError(`Only ${refundable / 100} can be refunded.`);
    let left = amount;
    const out: { refundId: string; payment: (typeof pays)[number]; amt: number }[] = [];
    for (const p of pays) {
      if (left <= 0) break;
      const amt = Math.min(left, p.amount - p.amountRefunded);
      if (amt <= 0) continue;
      const [r] = await tx.insert(schema.refunds).values({ paymentId: p.id, amount: amt, currency: p.currency, reason, processedBy: actorId }).returning();
      const newRefunded = p.amountRefunded + amt;
      await tx
        .update(schema.payments)
        .set({ amountRefunded: newRefunded, status: newRefunded >= p.amount ? "refunded" : "partially_refunded", updatedAt: new Date() })
        .where(eq(schema.payments.id, p.id));
      await ledger(tx, [
        {
          account: "refunds",
          amount: -amt,
          currency: p.currency,
          paymentId: p.id,
          refundId: r!.id,
          bookingId: p.bookingId,
          orderId: p.orderId,
          registrationId: p.registrationId,
          revenueStream: p.purpose === "booking" ? "services" : p.purpose === "order" ? "products" : "activities",
          description: `Refund: ${reason}`.slice(0, 200),
        },
      ]);
      out.push({ refundId: r!.id, payment: p, amt });
      left -= amt;
    }
    await applySubjectRefund(tx, subject, amount);
    return out;
  });

  let pending = 0;
  for (const plan of plans) {
    try {
      const res = await getProvider(plan.payment.provider).refund({
        reference: plan.payment.reference,
        providerReference: plan.payment.providerReference,
        amount: plan.amt,
        currency: plan.payment.currency,
        raw: plan.payment.providerPayload,
      });
      if (res.status === "pending") pending += plan.amt;
      await db
        .update(schema.refunds)
        .set({ status: res.status, providerReference: res.providerReference ?? null, failureReason: res.failureReason ?? null })
        .where(eq(schema.refunds.id, plan.refundId));
    } catch (e) {
      await reportError(e, { where: "refund", refundId: plan.refundId });
      // Keep the refund recorded as pending; finance can complete it manually from /admin/payments.
      pending += plan.amt;
      await db.update(schema.refunds).set({ status: "pending", failureReason: (e as Error).message.slice(0, 300) }).where(eq(schema.refunds.id, plan.refundId));
    }
  }
  return { refunded: amount, pending };
}

async function applySubjectRefund(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], s: Subject, amount: number) {
  if (s.bookingId) {
    await tx
      .update(schema.bookings)
      .set({
        amountRefunded: sql`${schema.bookings.amountRefunded} + ${amount}`,
        paymentState: sql`case when ${schema.bookings.amountRefunded} + ${amount} >= ${schema.bookings.amountPaid} then 'refunded'::payment_state else 'partially_refunded'::payment_state end`,
        updatedAt: new Date(),
      })
      .where(eq(schema.bookings.id, s.bookingId));
  } else if (s.orderId) {
    await tx
      .update(schema.orders)
      .set({
        amountRefunded: sql`${schema.orders.amountRefunded} + ${amount}`,
        paymentState: sql`case when ${schema.orders.amountRefunded} + ${amount} >= ${schema.orders.amountPaid} then 'refunded'::payment_state else 'partially_refunded'::payment_state end`,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, s.orderId));
  } else if (s.registrationId) {
    await tx.update(schema.activityRegistrations).set({ paymentState: "refunded" }).where(eq(schema.activityRegistrations.id, s.registrationId));
  }
}

/** Finance marks a pending (manual / Hubtel) refund as completed or failed. */
export async function settleRefund(refundId: string, status: "succeeded" | "failed", providerReference: string | null) {
  await db.update(schema.refunds).set({ status, providerReference }).where(eq(schema.refunds.id, refundId));
}
