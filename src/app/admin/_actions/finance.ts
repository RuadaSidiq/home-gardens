"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { getCurrentUser, assertPermission } from "@/server/auth/session";
import { UserError } from "@/server/errors";
import { audit } from "@/server/audit";
import { confirmManualPayment, rejectManualPayment, verifyAndApply } from "@/server/payments/service";
import { refundSubject, settleRefund } from "@/server/payments/refunds";
import { decidePayout } from "@/server/finance";
import { notify } from "@/server/notify";
import { formatMoney, toMinor } from "@/lib/money";
import { decrypt } from "@/server/crypto";
import type { Permission } from "@/server/auth/permissions";

async function can(p: Permission) {
  const u = await getCurrentUser();
  assertPermission(u, p);
  return u;
}

export async function confirmTransfer(_: Prev, fd: FormData) {
  return run(fd, z.object({ paymentId: f.uuid(), transferReference: f.req("Transfer reference", 80) }), async (i) => {
    const u = await can("payments.refund");
    await confirmManualPayment(i.paymentId, u.id, i.transferReference);
    return { ok: true, message: "Payment confirmed and applied." };
  });
}

export async function rejectTransfer(_: Prev, fd: FormData) {
  return run(fd, z.object({ paymentId: f.uuid(), reason: f.text(300).optional() }), async (i) => {
    const u = await can("payments.refund");
    await rejectManualPayment(i.paymentId, u.id, i.reason || "Transfer not received");
  });
}

export async function recheckPayment(_: Prev, fd: FormData) {
  return run(fd, z.object({ reference: f.req("Reference", 40) }), async (i) => {
    await can("payments.view");
    const p = await verifyAndApply(i.reference);
    return { ok: true, message: `Provider status: ${p.status}.` };
  });
}

export async function issueRefund(_: Prev, fd: FormData) {
  return run(fd, z.object({ paymentId: f.uuid(), amount: f.amount().refine((n) => n > 0, "Enter an amount"), reason: f.req("Reason", 300) }), async (i) => {
    const u = await can("payments.refund");
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.id, i.paymentId));
    if (!p) throw new UserError("Payment not found.");
    const amount = toMinor(i.amount, p.currency);
    if (amount > p.amount - p.amountRefunded) throw new UserError("That's more than can be refunded on this payment.", "amount");
    const subject = p.bookingId ? { bookingId: p.bookingId } : p.orderId ? { orderId: p.orderId } : { registrationId: p.registrationId! };
    const r = await refundSubject(subject, amount, i.reason, u.id);
    await audit({ actorId: u.id, action: "payment.refund", entityType: "payment", entityId: p.id, meta: { amount, reason: i.reason } });
    await notify(p.userId, "refund_processed", { reference: p.reference, amount: formatMoney(amount, p.currency) });
    return { ok: true, message: r.pending ? "Refund recorded. Complete it in the provider dashboard / bank, then mark it processed." : "Refund processed." };
  });
}

export async function markRefundProcessed(_: Prev, fd: FormData) {
  return run(fd, z.object({ refundId: f.uuid(), providerReference: f.req("Reference", 80) }), async (i) => {
    const u = await can("payments.refund");
    await settleRefund(i.refundId, "succeeded", i.providerReference);
    await audit({ actorId: u.id, action: "refund.settled", entityType: "payment", entityId: i.refundId, meta: { ref: i.providerReference } });
  });
}

export async function saveCommissionRule(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.optInt(1), name: f.req("Name", 80), serviceCategoryId: f.optInt(1), countryCode: f.text(2).optional(), rate: z.coerce.number().min(0).max(100), active: f.bool() }), async (i) => {
    const u = await can("commissions.manage");
    const v = { name: i.name, serviceCategoryId: i.serviceCategoryId ?? null, countryCode: i.countryCode || null, rateBps: Math.round(i.rate * 100), active: i.active };
    if (i.id) await db.update(schema.commissionRules).set(v).where(eq(schema.commissionRules.id, i.id));
    else await db.insert(schema.commissionRules).values(v);
    await audit({ actorId: u.id, action: "commission_rule.save", entityType: "settings", entityId: String(i.id ?? "new"), meta: v });
    return { ok: true, message: "Rule saved. It applies to bookings completed from now on." };
  });
}

export async function payoutDecision(_: Prev, fd: FormData) {
  return run(fd, z.object({ payoutId: f.uuid(), decision: z.enum(["approved", "paid", "rejected"]), providerReference: f.text(80).optional(), provider: f.text(40).optional(), note: f.text(300).optional() }), async (i) => {
    const u = await can("payouts.manage");
    if (i.decision === "rejected" && !i.note) throw new UserError("Add a reason for the gardener.", "note");
    const p = await decidePayout(i.payoutId, i.decision, u.id, { providerReference: i.providerReference || undefined, provider: i.provider || undefined, note: i.note || undefined });
    await audit({ actorId: u.id, action: `payout.${i.decision}`, entityType: "payout", entityId: p.id, meta: { ref: i.providerReference } });
    const [g] = await db.select({ userId: schema.gardenerProfiles.userId }).from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, p.gardenerId));
    if (g && i.decision === "paid") await notify(g.userId, "payout_processed", { reference: p.reference, amount: formatMoney(p.amount, p.currency), providerReference: p.providerReference ?? "" }, "/gardener/payouts");
    if (g && i.decision === "rejected") await notify(g.userId, "payout_rejected", { reference: p.reference, note: i.note ?? "" }, "/gardener/payouts");
    return { ok: true, message: `Payout ${i.decision}.` };
  });
}

/** Reveals full payout account details to finance staff; every reveal is audited. */
export async function revealPayoutDetails(_: Prev, fd: FormData) {
  return run(fd, z.object({ payoutId: f.uuid() }), async (i) => {
    const u = await can("payouts.manage");
    const [p] = await db.select({ g: schema.gardenerProfiles }).from(schema.payouts).innerJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.payouts.gardenerId)).where(eq(schema.payouts.id, i.payoutId));
    if (!p?.g.payoutMethod) throw new UserError("No payout details on file.");
    const d = JSON.parse(decrypt(p.g.payoutMethod)) as { method: string; provider: string; accountName: string; accountNumber: string };
    await audit({ actorId: u.id, action: "payout.reveal_details", entityType: "payout", entityId: i.payoutId });
    return { ok: true, message: `${d.method === "momo" ? "Mobile Money" : "Bank"} · ${d.provider} · ${d.accountName} · ${d.accountNumber}` };
  });
}
