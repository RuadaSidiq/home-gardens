import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import { reference } from "@/lib/ids";
import { bps, convert, formatMoney } from "@/lib/money";
import { UserError } from "../errors";
import { audit } from "../audit";
import { adjustStock, pickWarehouse } from "./inventory";
import { cartLines, clearCart, getOrCreateCart } from "./cart";
import { applyTaxes, couponDiscount, shippingPrice } from "../pricing";
import { taxRules } from "../bookings/engine";
import { validateCoupon, redeemCoupon } from "../coupons";
import { getRate } from "../currency";
import { ledger } from "../finance";
import { notify, notifyStaff } from "../notify";
import { refundSubject } from "../payments/refunds";
import { getSettings } from "../settings";

type Order = typeof schema.orders.$inferSelect;

export async function deliveryOptions(countryCode: string, cityId: number | null) {
  const rows = await db
    .select({ m: schema.deliveryMethods, z: schema.shippingZones })
    .from(schema.deliveryMethods)
    .innerJoin(schema.shippingZones, eq(schema.shippingZones.id, schema.deliveryMethods.zoneId))
    .where(and(eq(schema.shippingZones.countryCode, countryCode), eq(schema.shippingZones.active, true), eq(schema.deliveryMethods.active, true)));
  return rows.filter((r) => r.z.cityIds.length === 0 || (cityId != null && r.z.cityIds.includes(cityId))).map((r) => r.m);
}

export type CheckoutAddress = { recipient: string; phone: string; line1: string; line2?: string; city: string; cityId?: number | null; region?: string; postalCode?: string; digitalAddress?: string; countryCode: string };

/** Prices a checkout without writing anything. */
export async function priceCheckout(opts: { userId: string; currency: string; address: CheckoutAddress; deliveryMethodId: number | null; couponCode?: string | null }) {
  const cart = await getOrCreateCart({ userId: opts.userId });
  const lines = await cartLines(cart.id, opts.currency);
  if (!lines.length) throw new UserError("Your cart is empty.");
  for (const l of lines) {
    if (!l.allowBackorder && l.quantity > l.stock) throw new UserError(`${l.name}: only ${l.stock} in stock. Update your cart to continue.`);
  }
  const [country] = await db.select().from(schema.countries).where(eq(schema.countries.code, opts.address.countryCode));
  if (!country?.shippingEnabled) throw new UserError("We do not deliver to this country yet.", "countryCode");

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const weight = lines.reduce((s, l) => s + l.weightGrams, 0);
  const options = await deliveryOptions(opts.address.countryCode, opts.address.cityId ?? null);
  const method = options.find((m) => m.id === opts.deliveryMethodId) ?? null;
  let shipping = 0;
  if (method) {
    const rate = await getRate(method.currency, opts.currency);
    const subInMethodCurrency = convert(subtotal, 1 / rate);
    shipping = convert(shippingPrice(method, subInMethodCurrency, weight), rate);
  }
  const coupon = opts.couponCode ? await validateCoupon(opts.couponCode, { scope: "products", currency: opts.currency, subtotal, userId: opts.userId }) : null;
  const discount = couponDiscount(subtotal, coupon);
  const taxes = applyTaxes(subtotal - discount, await taxRules(opts.address.countryCode, "products"));
  const total = subtotal - discount + taxes.added + shipping;
  return { cart, lines, subtotal, discount, shipping, tax: taxes.tax, taxAdded: taxes.added, taxLines: taxes.lines, total, method, options, coupon, country };
}

/** Creates the order and reserves stock so items cannot be oversold while the customer pays. */
export async function createOrder(opts: { userId: string; email: string; currency: string; address: CheckoutAddress; deliveryMethodId: number; couponCode?: string | null; note?: string | null }) {
  const settings = await getSettings();
  const priced = await priceCheckout(opts);
  if (!priced.method) throw new UserError("Choose a delivery option.", "deliveryMethodId");
  const baseRate = await getRate(settings.finance.baseCurrency, opts.currency);
  const order = await db.transaction(async (tx) => {
    const [o] = await tx
      .insert(schema.orders)
      .values({
        reference: reference("OR"),
        userId: opts.userId,
        email: opts.email,
        phone: opts.address.phone,
        currency: opts.currency,
        exchangeRate: String(baseRate),
        subtotal: priced.subtotal,
        discount: priced.discount,
        shipping: priced.shipping,
        tax: priced.tax,
        total: priced.total,
        shippingAddress: Object.fromEntries(Object.entries(opts.address).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])),
        deliveryMethodId: priced.method!.id,
        deliveryMethodName: priced.method!.name,
        couponId: priced.coupon?.id ?? null,
        customerNote: opts.note ?? null,
        stockReserved: true,
      })
      .returning();
    for (const l of priced.lines) {
      const wh = await pickWarehouse(tx, l.variantId, l.quantity);
      await adjustStock(tx, { variantId: l.variantId, warehouseId: wh, delta: -l.quantity, reason: "sale", reference: o!.reference, allowNegative: l.allowBackorder || settings.commerce.allowBackorders });
      await tx.insert(schema.orderItems).values({
        orderId: o!.id,
        productId: l.productId,
        variantId: l.variantId,
        vendorId: l.vendorId,
        warehouseId: wh,
        name: l.name,
        variantName: l.variantName || null,
        sku: l.sku,
        image: l.image,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
      });
    }
    await tx.insert(schema.orderEvents).values({ orderId: o!.id, type: "created", actorId: opts.userId });
    await clearCart(priced.cart.id, priced.lines.map((l) => l.variantId), tx);
    return o!;
  });
  return order;
}

/** Inside the payment transaction. Allocates revenue between company and vendors. */
export async function applyOrderPayment(tx: Tx, orderId: string, amount: number) {
  const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId)).for("update");
  if (!o) throw new Error("Order not found");
  const paid = o.amountPaid + amount;
  const fullyPaid = paid >= o.total;
  await tx
    .update(schema.orders)
    .set({ amountPaid: paid, paymentState: fullyPaid ? "paid" : "unpaid", status: fullyPaid && o.status === "pending_payment" ? "paid" : o.status, paidAt: fullyPaid ? new Date() : o.paidAt, updatedAt: new Date() })
    .where(eq(schema.orders.id, o.id));
  if (!fullyPaid || o.status !== "pending_payment") return { order: o, becamePaid: false };
  await tx.insert(schema.orderEvents).values({ orderId: o.id, type: "paid", note: formatMoney(paid, o.currency) });
  await allocateOrderRevenue(tx, o, 1);
  if (o.couponId) await redeemCoupon(tx, o.couponId, { userId: o.userId, amount: o.discount, currency: o.currency, orderId: o.id });
  return { order: o, becamePaid: true };
}

/** sign = 1 to recognise, -1 to reverse on cancellation. */
async function allocateOrderRevenue(tx: Tx, o: Order, sign: 1 | -1) {
  const items = await tx
    .select({ i: schema.orderItems, v: schema.vendors })
    .from(schema.orderItems)
    .innerJoin(schema.vendors, eq(schema.vendors.id, schema.orderItems.vendorId))
    .where(eq(schema.orderItems.orderId, o.id));
  const entries: (typeof schema.ledgerEntries.$inferInsert)[] = [];
  for (const { i, v } of items) {
    // allocate the order discount proportionally to each line
    const share = o.subtotal > 0 ? Math.round((o.discount * i.lineTotal) / o.subtotal) : 0;
    const net = i.lineTotal - share;
    if (v.isCompany) {
      entries.push({ account: "company_revenue", amount: sign * net, currency: o.currency, orderId: o.id, vendorId: v.id, revenueStream: "products", description: `Product sales ${o.reference}` });
    } else {
      const commission = bps(net, v.commissionBps);
      entries.push({ account: "company_revenue", amount: sign * commission, currency: o.currency, orderId: o.id, vendorId: v.id, revenueStream: "products", description: `Marketplace commission ${o.reference}` });
      entries.push({ account: "vendor_payable", amount: sign * (net - commission), currency: o.currency, orderId: o.id, vendorId: v.id, revenueStream: "products", description: `Vendor share ${o.reference}` });
    }
  }
  if (o.shipping) entries.push({ account: "company_revenue", amount: sign * o.shipping, currency: o.currency, orderId: o.id, revenueStream: "products", description: `Delivery fee ${o.reference}` });
  if (o.tax) entries.push({ account: "tax_collected", amount: sign * o.tax, currency: o.currency, orderId: o.id, revenueStream: "products", description: `Tax ${o.reference}` });
  await ledger(tx, entries);
}

async function releaseStock(tx: Tx, o: Order, actorId: string | null) {
  if (!o.stockReserved) return;
  const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
  for (const i of items) {
    if (i.warehouseId) await adjustStock(tx, { variantId: i.variantId, warehouseId: i.warehouseId, delta: i.quantity, reason: "cancellation", reference: o.reference, actorId });
  }
  await tx.update(schema.orders).set({ stockReserved: false }).where(eq(schema.orders.id, o.id));
}

export async function cancelOrder(opts: { orderId: string; actorId: string | null; reason: string; byCustomer: boolean }) {
  const { o, refund } = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.id, opts.orderId)).for("update");
    if (!o) throw new UserError("Order not found.");
    if (opts.byCustomer && o.userId !== opts.actorId) throw new UserError("Order not found.");
    const allowed = opts.byCustomer ? ["pending_payment", "paid"] : ["pending_payment", "paid", "processing"];
    if (!allowed.includes(o.status)) throw new UserError(opts.byCustomer ? "This order is already being prepared. Contact support to cancel it." : "Shipped orders cannot be cancelled; process a return instead.");
    await releaseStock(tx, o, opts.actorId);
    const wasPaid = o.status !== "pending_payment";
    if (wasPaid) await allocateOrderRevenue(tx, o, -1);
    await tx.update(schema.orders).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(schema.orders.id, o.id));
    await tx.insert(schema.orderEvents).values({ orderId: o.id, type: "cancelled", note: opts.reason, actorId: opts.actorId });
    if (opts.actorId && !opts.byCustomer) await audit({ actorId: opts.actorId, action: "order.cancel", entityType: "order", entityId: o.id, meta: { reason: opts.reason } }, tx);
    return { o, refund: wasPaid ? o.amountPaid - o.amountRefunded : 0 };
  });
  if (refund > 0) {
    await refundSubject({ orderId: o.id }, refund, `Order cancelled ${o.reference}`, opts.actorId);
    await db.update(schema.orders).set({ status: "refunded" }).where(eq(schema.orders.id, o.id));
    await notify(o.userId, "refund_processed", { reference: o.reference, amount: formatMoney(refund, o.currency) }, `/account/orders/${o.id}`);
  }
  return o;
}

export async function updateFulfilment(opts: { orderId: string; actorId: string; action: "processing" | "shipped" | "delivered"; carrier?: string; trackingNumber?: string; note?: string }) {
  const o = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(schema.orders).where(eq(schema.orders.id, opts.orderId)).for("update");
    if (!o) throw new UserError("Order not found.");
    const from: Record<string, string[]> = { processing: ["paid"], shipped: ["paid", "processing"], delivered: ["shipped"] };
    if (!from[opts.action]!.includes(o.status)) throw new UserError(`An order that is ${o.status.replace(/_/g, " ")} cannot be marked ${opts.action}.`);
    const patch: Partial<Order> = { status: opts.action, updatedAt: new Date() };
    if (opts.action === "shipped") Object.assign(patch, { shippedAt: new Date(), carrier: opts.carrier ?? null, trackingNumber: opts.trackingNumber ?? null, fulfilmentStatus: "fulfilled", stockReserved: false });
    if (opts.action === "delivered") patch.deliveredAt = new Date();
    const [u] = await tx.update(schema.orders).set(patch).where(eq(schema.orders.id, o.id)).returning();
    await tx.insert(schema.orderEvents).values({ orderId: o.id, type: opts.action, note: opts.note ?? (opts.trackingNumber ? `${opts.carrier ?? ""} ${opts.trackingNumber}`.trim() : null), actorId: opts.actorId });
    return u!;
  });
  if (opts.action === "shipped") {
    const note = o.trackingNumber ? `Tracking: ${o.carrier ?? ""} ${o.trackingNumber}`.trim() : `Delivery: ${o.deliveryMethodName ?? ""}`;
    await notify(o.userId, "order_dispatched", { reference: o.reference, note }, `/account/orders/${o.id}`);
  }
  if (opts.action === "delivered") await notify(o.userId, "order_delivered", { reference: o.reference }, `/account/orders/${o.id}`);
  return o;
}

export async function requestReturn(opts: { orderId: string; userId: string; items: { orderItemId: string; quantity: number }[]; reason: string }) {
  const settings = await getSettings();
  const [o] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, opts.orderId), eq(schema.orders.userId, opts.userId)));
  if (!o) throw new UserError("Order not found.");
  if (o.status !== "delivered" || !o.deliveredAt) throw new UserError("Returns can be requested once the order is delivered.");
  if (Date.now() - o.deliveredAt.getTime() > settings.commerce.returnWindowDays * 86400_000) throw new UserError(`Returns must be requested within ${settings.commerce.returnWindowDays} days of delivery.`);
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
  const chosen = opts.items.filter((i) => i.quantity > 0);
  if (!chosen.length) throw new UserError("Select at least one item to return.");
  for (const c of chosen) {
    const it = items.find((i) => i.id === c.orderItemId);
    if (!it || c.quantity > it.quantity - it.returnedQuantity) throw new UserError("Invalid return quantity.");
  }
  const open = await db.select().from(schema.returnRequests).where(and(eq(schema.returnRequests.orderId, o.id), inArray(schema.returnRequests.status, ["requested", "approved"])));
  if (open.length) throw new UserError("There is already an open return for this order.");
  const [r] = await db.insert(schema.returnRequests).values({ orderId: o.id, userId: opts.userId, items: chosen, reason: opts.reason }).returning();
  await notifyStaff("orders.manage", `Return requested: ${o.reference}`, opts.reason.slice(0, 140), `/admin/orders/${o.id}`);
  return r!;
}

/** approve -> received (restock) -> refunded, or reject. */
export async function processReturn(opts: { returnId: string; actorId: string; action: "approve" | "reject" | "receive_refund"; note?: string; restock?: boolean }) {
  const [r] = await db.select().from(schema.returnRequests).where(eq(schema.returnRequests.id, opts.returnId));
  if (!r) throw new UserError("Return not found.");
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, r.orderId));
  if (opts.action === "reject") {
    if (r.status !== "requested") throw new UserError("Only new return requests can be rejected.");
    await db.update(schema.returnRequests).set({ status: "rejected", adminNote: opts.note ?? null, resolvedAt: new Date() }).where(eq(schema.returnRequests.id, r.id));
    return;
  }
  if (opts.action === "approve") {
    if (r.status !== "requested") throw new UserError("This return was already handled.");
    await db.update(schema.returnRequests).set({ status: "approved", adminNote: opts.note ?? null }).where(eq(schema.returnRequests.id, r.id));
    return;
  }
  if (r.status !== "approved") throw new UserError("Approve the return before refunding it.");
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, r.orderId));
  let amount = 0;
  await db.transaction(async (tx) => {
    for (const ri of r.items) {
      const it = items.find((i) => i.id === ri.orderItemId)!;
      const share = o!.subtotal > 0 ? Math.round((o!.discount * it.unitPrice * ri.quantity) / o!.subtotal) : 0;
      amount += it.unitPrice * ri.quantity - share;
      await tx.update(schema.orderItems).set({ returnedQuantity: it.returnedQuantity + ri.quantity }).where(eq(schema.orderItems.id, it.id));
      if (opts.restock !== false && it.warehouseId) {
        await adjustStock(tx, { variantId: it.variantId, warehouseId: it.warehouseId, delta: ri.quantity, reason: "return", reference: o!.reference, actorId: opts.actorId });
      }
    }
    await tx.update(schema.returnRequests).set({ status: "refunded", restock: opts.restock !== false, adminNote: opts.note ?? r.adminNote, resolvedAt: new Date() }).where(eq(schema.returnRequests.id, r.id));
    await tx.insert(schema.orderEvents).values({ orderId: o!.id, type: "returned", note: formatMoney(amount, o!.currency), actorId: opts.actorId });
  });
  const refundable = o!.amountPaid - o!.amountRefunded;
  amount = Math.min(amount, refundable);
  if (amount > 0) {
    await refundSubject({ orderId: o!.id }, amount, `Return ${o!.reference}`, opts.actorId);
    const fully = amount >= refundable;
    await db.update(schema.orders).set({ status: fully ? "refunded" : "partially_refunded", fulfilmentStatus: fully ? "returned" : o!.fulfilmentStatus }).where(eq(schema.orders.id, o!.id));
    await notify(o!.userId, "refund_processed", { reference: o!.reference, amount: formatMoney(amount, o!.currency) }, `/account/orders/${o!.id}`);
  }
}

/** Cancels orders left unpaid and releases their stock. */
export async function expireUnpaidOrders(maxAgeMinutes = 60) {
  const stale = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(eq(schema.orders.status, "pending_payment"), lt(schema.orders.createdAt, new Date(Date.now() - maxAgeMinutes * 60_000))));
  for (const s of stale) {
    // A payment may still be in flight; skip if any payment is pending verification.
    const pending = await db.select({ id: schema.payments.id }).from(schema.payments).where(and(eq(schema.payments.orderId, s.id), sql`${schema.payments.status} = 'pending' and ${schema.payments.provider} = 'manual'`));
    if (pending.length) continue;
    await cancelOrder({ orderId: s.id, actorId: null, reason: "Payment not completed in time", byCustomer: false }).catch(() => {});
  }
  return stale.length;
}

export async function notifyOrderPaid(o: Order) {
  await notify(o.userId, "order_confirmation", { reference: o.reference, amount: formatMoney(o.total, o.currency) }, `/account/orders/${o.id}`);
  await notifyStaff("orders.manage", `New order ${o.reference}`, formatMoney(o.total, o.currency), `/admin/orders/${o.id}`);
}
