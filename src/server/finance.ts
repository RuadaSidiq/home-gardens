import { and, eq, lte, sql } from "drizzle-orm";
import { db, schema, type DbOrTx, type Tx } from "@/db";
import { commissionSplit } from "./pricing";
import { reference } from "@/lib/ids";
import { UserError } from "./errors";
import { DEFAULT_SETTINGS } from "./settings";

type LedgerInsert = typeof schema.ledgerEntries.$inferInsert;

export async function ledger(tx: DbOrTx, entries: LedgerInsert[]) {
  const rows = entries.filter((e) => e.amount !== 0);
  if (rows.length) await tx.insert(schema.ledgerEntries).values(rows);
}

/** Most specific active rule wins: category+country, category, country, global. */
export async function resolveCommissionRate(tx: DbOrTx, categoryId: number, countryCode: string, fallbackBps: number) {
  const rules = await tx.select().from(schema.commissionRules).where(eq(schema.commissionRules.active, true));
  const score = (r: (typeof rules)[number]) => {
    if (r.serviceCategoryId != null && r.serviceCategoryId !== categoryId) return -1;
    if (r.countryCode != null && r.countryCode !== countryCode) return -1;
    return (r.serviceCategoryId != null ? 2 : 0) + (r.countryCode != null ? 1 : 0);
  };
  const best = rules.map((r) => ({ r, s: score(r) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0];
  return best ? { rateBps: best.r.rateBps, ruleId: best.r.id } : { rateBps: fallbackBps, ruleId: null };
}

async function ensureWallet(tx: DbOrTx, gardenerId: string, currency: string) {
  await tx.insert(schema.gardenerWallets).values({ gardenerId, currency }).onConflictDoNothing();
}

/**
 * Called when a booking is completed. Independent gardeners earn the job value minus commission;
 * for company gardeners the whole amount is company revenue.
 */
export async function recordBookingEarnings(tx: Tx, bookingId: string, opts: { holdDays?: number; defaultBps?: number } = {}) {
  const [b] = await tx
    .select({
      id: schema.bookings.id,
      reference: schema.bookings.reference,
      gardenerId: schema.bookings.gardenerId,
      total: schema.bookings.total,
      tax: schema.bookings.tax,
      amountPaid: schema.bookings.amountPaid,
      amountRefunded: schema.bookings.amountRefunded,
      currency: schema.bookings.currency,
      countryCode: schema.bookings.countryCode,
      categoryId: schema.services.categoryId,
      gardenerType: schema.gardenerProfiles.type,
    })
    .from(schema.bookings)
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .leftJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.bookings.gardenerId))
    .where(eq(schema.bookings.id, bookingId));
  if (!b || !b.gardenerId) return null;
  const existing = await tx.select({ id: schema.commissions.id }).from(schema.commissions).where(eq(schema.commissions.bookingId, bookingId));
  if (existing.length) return null; // idempotent
  // Earnings are based on the net amount collected excluding tax.
  const net = Math.max(b.amountPaid - b.amountRefunded - b.tax, 0);
  if (b.gardenerType === "company") {
    await ledger(tx, [{ account: "company_revenue", amount: net, currency: b.currency, bookingId, gardenerId: b.gardenerId, revenueStream: "services", description: `Service revenue ${b.reference} (company gardener)` }]);
    return null;
  }
  const { rateBps, ruleId } = await resolveCommissionRate(tx, b.categoryId, b.countryCode, opts.defaultBps ?? DEFAULT_SETTINGS.finance.defaultCommissionBps);
  const split = commissionSplit(net, rateBps);
  const holdDays = opts.holdDays ?? DEFAULT_SETTINGS.finance.payoutHoldDays;
  const [c] = await tx
    .insert(schema.commissions)
    .values({
      bookingId,
      gardenerId: b.gardenerId,
      ruleId,
      grossAmount: net,
      rateBps,
      commissionAmount: split.commission,
      gardenerAmount: split.gardener,
      currency: b.currency,
      status: holdDays === 0 ? "available" : "pending",
      availableAt: new Date(Date.now() + holdDays * 86400_000),
    })
    .returning();
  await ensureWallet(tx, b.gardenerId, b.currency);
  const col = holdDays === 0 ? schema.gardenerWallets.availableBalance : schema.gardenerWallets.pendingBalance;
  await tx
    .update(schema.gardenerWallets)
    .set({ [holdDays === 0 ? "availableBalance" : "pendingBalance"]: sql`${col} + ${split.gardener}`, totalEarned: sql`${schema.gardenerWallets.totalEarned} + ${split.gardener}`, updatedAt: new Date() })
    .where(and(eq(schema.gardenerWallets.gardenerId, b.gardenerId), eq(schema.gardenerWallets.currency, b.currency)));
  await ledger(tx, [
    { account: "company_revenue", amount: split.commission, currency: b.currency, bookingId, gardenerId: b.gardenerId, revenueStream: "services", description: `Commission ${rateBps / 100}% on ${b.reference}` },
    { account: "gardener_payable", amount: split.gardener, currency: b.currency, bookingId, gardenerId: b.gardenerId, revenueStream: "services", description: `Gardener earnings ${b.reference}` },
  ]);
  return c!;
}

/** Moves matured pending commissions into the available balance. Safe to run repeatedly. */
export async function releaseMaturedCommissions(gardenerId?: string) {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(schema.commissions)
      .where(and(eq(schema.commissions.status, "pending"), lte(schema.commissions.availableAt, new Date()), gardenerId ? eq(schema.commissions.gardenerId, gardenerId) : undefined))
      .for("update", { skipLocked: true });
    for (const c of due) {
      await tx.update(schema.commissions).set({ status: "available" }).where(eq(schema.commissions.id, c.id));
      await tx
        .update(schema.gardenerWallets)
        .set({
          pendingBalance: sql`${schema.gardenerWallets.pendingBalance} - ${c.gardenerAmount}`,
          availableBalance: sql`${schema.gardenerWallets.availableBalance} + ${c.gardenerAmount}`,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.gardenerWallets.gardenerId, c.gardenerId), eq(schema.gardenerWallets.currency, c.currency)));
    }
    return due.length;
  });
}

/** Reverses a commission (e.g. a completed booking is refunded after a dispute). */
export async function reverseCommission(tx: Tx, bookingId: string) {
  const [c] = await tx.select().from(schema.commissions).where(eq(schema.commissions.bookingId, bookingId)).for("update");
  if (!c || c.status === "reversed") return;
  if (c.status === "paid") throw new UserError("Earnings for this booking were already paid out; adjust manually.");
  const col = c.status === "pending" ? "pendingBalance" : "availableBalance";
  const ref = c.status === "pending" ? schema.gardenerWallets.pendingBalance : schema.gardenerWallets.availableBalance;
  await tx
    .update(schema.gardenerWallets)
    .set({ [col]: sql`greatest(${ref} - ${c.gardenerAmount}, 0)`, totalEarned: sql`${schema.gardenerWallets.totalEarned} - ${c.gardenerAmount}` })
    .where(and(eq(schema.gardenerWallets.gardenerId, c.gardenerId), eq(schema.gardenerWallets.currency, c.currency)));
  await tx.update(schema.commissions).set({ status: "reversed" }).where(eq(schema.commissions.id, c.id));
  await ledger(tx, [
    { account: "company_revenue", amount: -c.commissionAmount, currency: c.currency, bookingId, gardenerId: c.gardenerId, revenueStream: "services", description: "Commission reversed" },
    { account: "gardener_payable", amount: -c.gardenerAmount, currency: c.currency, bookingId, gardenerId: c.gardenerId, revenueStream: "services", description: "Gardener earnings reversed" },
  ]);
}

export async function requestPayout(gardenerId: string, amount: number, currency: string, minimum: number) {
  return db.transaction(async (tx) => {
    const [g] = await tx.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, gardenerId));
    if (!g || g.type !== "independent") throw new UserError("Payouts are only available to independent gardeners.");
    if (g.status !== "approved") throw new UserError("Your account must be approved to request payouts.");
    if (!g.payoutMethodSummary) throw new UserError("Add your payout details in Settings first.");
    if (amount < minimum) throw new UserError("The amount is below the minimum payout.");
    const [w] = await tx
      .select()
      .from(schema.gardenerWallets)
      .where(and(eq(schema.gardenerWallets.gardenerId, gardenerId), eq(schema.gardenerWallets.currency, currency)))
      .for("update");
    if (!w || w.availableBalance < amount) throw new UserError("The amount is more than your available balance.");
    await tx
      .update(schema.gardenerWallets)
      .set({ availableBalance: w.availableBalance - amount, reservedBalance: w.reservedBalance + amount, updatedAt: new Date() })
      .where(and(eq(schema.gardenerWallets.gardenerId, gardenerId), eq(schema.gardenerWallets.currency, currency)));
    const [p] = await tx
      .insert(schema.payouts)
      .values({ reference: reference("PO"), gardenerId, amount, currency, methodSummary: g.payoutMethodSummary })
      .returning();
    return p!;
  });
}

/** Admin decision on a payout. "paid" records the external transfer reference. */
export async function decidePayout(payoutId: string, decision: "approved" | "paid" | "rejected", actorId: string, opts: { providerReference?: string; provider?: string; note?: string } = {}) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.payouts).where(eq(schema.payouts.id, payoutId)).for("update");
    if (!p) throw new UserError("Payout not found.");
    const allowed: Record<string, string[]> = { requested: ["approved", "rejected", "paid"], approved: ["paid", "rejected"], processing: ["paid", "rejected"] };
    if (!allowed[p.status]?.includes(decision)) throw new UserError(`A ${p.status} payout cannot be marked ${decision}.`);
    if (decision === "paid" && !opts.providerReference) throw new UserError("Enter the transfer reference.", "providerReference");
    const walletWhere = and(eq(schema.gardenerWallets.gardenerId, p.gardenerId), eq(schema.gardenerWallets.currency, p.currency));
    if (decision === "rejected") {
      await tx
        .update(schema.gardenerWallets)
        .set({ reservedBalance: sql`${schema.gardenerWallets.reservedBalance} - ${p.amount}`, availableBalance: sql`${schema.gardenerWallets.availableBalance} + ${p.amount}` })
        .where(walletWhere);
    }
    if (decision === "paid") {
      await tx
        .update(schema.gardenerWallets)
        .set({ reservedBalance: sql`${schema.gardenerWallets.reservedBalance} - ${p.amount}`, totalPaidOut: sql`${schema.gardenerWallets.totalPaidOut} + ${p.amount}` })
        .where(walletWhere);
      // Mark oldest available commissions as paid up to the payout amount.
      const avail = await tx
        .select()
        .from(schema.commissions)
        .where(and(eq(schema.commissions.gardenerId, p.gardenerId), eq(schema.commissions.status, "available"), eq(schema.commissions.currency, p.currency)))
        .orderBy(schema.commissions.availableAt);
      let left = p.amount;
      for (const c of avail) {
        if (c.gardenerAmount > left) break;
        await tx.update(schema.commissions).set({ status: "paid" }).where(eq(schema.commissions.id, c.id));
        left -= c.gardenerAmount;
      }
      await ledger(tx, [
        { account: "payouts", amount: p.amount, currency: p.currency, payoutId: p.id, gardenerId: p.gardenerId, description: `Payout ${p.reference}` },
        { account: "gardener_payable", amount: -p.amount, currency: p.currency, payoutId: p.id, gardenerId: p.gardenerId, description: `Payout ${p.reference}` },
      ]);
    }
    const [updated] = await tx
      .update(schema.payouts)
      .set({
        status: decision,
        providerReference: opts.providerReference ?? p.providerReference,
        provider: opts.provider ?? p.provider,
        note: opts.note ?? p.note,
        processedBy: actorId,
        processedAt: new Date(),
      })
      .where(eq(schema.payouts.id, p.id))
      .returning();
    return updated!;
  });
}

export async function walletsFor(gardenerId: string) {
  return db.select().from(schema.gardenerWallets).where(eq(schema.gardenerWallets.gardenerId, gardenerId));
}

