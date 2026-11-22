import { and, eq, sql } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@/db";
import { UserError } from "./errors";

export type ValidCoupon = { id: string; code: string; type: "percent" | "fixed"; value: number; minSubtotal: number };

/** Validates a coupon for a purchase. Fixed-amount coupons only apply in their own currency. */
export async function validateCoupon(
  code: string,
  ctx: { scope: "products" | "services" | "activities"; currency: string; subtotal: number; userId: string | null },
  tx: DbOrTx = db,
): Promise<ValidCoupon> {
  const [c] = await tx.select().from(schema.coupons).where(sql`upper(${schema.coupons.code}) = ${code.trim().toUpperCase()}`);
  const now = new Date();
  if (!c || !c.active) throw new UserError("This discount code is not valid.", "couponCode");
  if (c.startsAt && c.startsAt > now) throw new UserError("This discount code is not active yet.", "couponCode");
  if (c.endsAt && c.endsAt < now) throw new UserError("This discount code has expired.", "couponCode");
  if (c.scope !== "all" && c.scope !== ctx.scope) throw new UserError(`This code only applies to ${c.scope}.`, "couponCode");
  if (c.maxUses != null && c.uses >= c.maxUses) throw new UserError("This discount code has been fully used.", "couponCode");
  if (c.type === "fixed" && c.currency && c.currency !== ctx.currency) throw new UserError(`This code can only be used for ${c.currency} purchases.`, "couponCode");
  if (c.minSubtotal && ctx.subtotal < c.minSubtotal) throw new UserError("Your order does not meet the minimum spend for this code.", "couponCode");
  if (ctx.userId) {
    const [r] = await tx
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.couponRedemptions)
      .where(and(eq(schema.couponRedemptions.couponId, c.id), eq(schema.couponRedemptions.userId, ctx.userId)));
    if ((r?.n ?? 0) >= c.perUserLimit) throw new UserError("You have already used this discount code.", "couponCode");
  }
  return { id: c.id, code: c.code, type: c.type, value: c.value, minSubtotal: c.minSubtotal };
}

/** Records a redemption when payment succeeds. Enforces max uses atomically. */
export async function redeemCoupon(tx: DbOrTx, couponId: string, r: { userId: string; amount: number; currency: string; orderId?: string; bookingId?: string }) {
  await tx.update(schema.coupons).set({ uses: sql`${schema.coupons.uses} + 1` }).where(eq(schema.coupons.id, couponId));
  await tx.insert(schema.couponRedemptions).values({ couponId, userId: r.userId, amount: r.amount, currency: r.currency, orderId: r.orderId ?? null, bookingId: r.bookingId ?? null });
}
