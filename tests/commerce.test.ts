import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { setCartQuantity, cartLines, getOrCreateCart, mergeGuestCart } from "@/server/commerce/cart";
import { createOrder, cancelOrder, updateFulfilment, requestReturn, processReturn, priceCheckout } from "@/server/commerce/orders";
import { stockFor, adjustStock } from "@/server/commerce/inventory";
import { initiatePayment, confirmManualPayment, verifyAndApply } from "@/server/payments/service";
import { registerForActivity, cancelRegistration } from "@/server/activities";
import { userByEmail, newCustomer, cityByName } from "./helpers";

async function variantFor(slug: string) {
  const [v] = await db
    .select({ id: schema.productVariants.id })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.products.id, schema.productVariants.productId))
    .where(eq(schema.products.slug, slug))
    .limit(1);
  return v!.id;
}
async function address() {
  const c = await cityByName("East Legon");
  return { recipient: "Test", phone: "+233240000000", line1: "1 Street", city: c.name, cityId: c.id, countryCode: "GH" };
}
async function deliveryId() {
  const [m] = await db.select().from(schema.deliveryMethods).where(eq(schema.deliveryMethods.name, "Standard delivery (1–2 days)")).limit(1);
  return m!.id;
}

describe("cart", () => {
  it("persists for users and merges guest carts", async () => {
    const u = await newCustomer();
    const v = await variantFor("bypass-pruning-shears");
    await setCartQuantity({ guestToken: "guest-abc" }, v, 2, "add");
    await setCartQuantity({ userId: u.id }, v, 1, "add");
    await mergeGuestCart("guest-abc", u.id);
    const cart = await getOrCreateCart({ userId: u.id });
    const lines = await cartLines(cart.id, "GHS");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(3);
  });

  it("refuses quantities above stock", async () => {
    const u = await newCustomer();
    const v = await variantFor("rotary-petrol-lawn-mower-46"); // 8 in stock
    await expect(setCartQuantity({ userId: u.id }, v, 50)).rejects.toThrow(/left in stock/);
  });

  it("converts prices to the display currency", async () => {
    const u = await newCustomer();
    const v = await variantFor("bypass-pruning-shears");
    await setCartQuantity({ userId: u.id }, v, 1);
    const cart = await getOrCreateCart({ userId: u.id });
    const [ghs] = await cartLines(cart.id, "GHS");
    const [usd] = await cartLines(cart.id, "USD");
    expect(ghs!.unitPrice).toBe(18500);
    expect(usd!.unitPrice).toBe(Math.round(18500 / 15.2));
  });
});

describe("orders and inventory", () => {
  it("checkout reserves stock, payment confirms, fulfilment and return restock", async () => {
    const u = await newCustomer();
    const v = await variantFor("cordless-grass-trimmer");
    const before = (await stockFor([v])).get(v)!;
    await setCartQuantity({ userId: u.id }, v, 2);
    const priced = await priceCheckout({ userId: u.id, currency: "GHS", address: await address(), deliveryMethodId: await deliveryId(), couponCode: "WELCOME10" });
    // 2 × 1450 = 2900, -10% = 2610, +20% tax = 522, shipping free over 1000
    expect(priced).toMatchObject({ subtotal: 290000, discount: 29000, shipping: 0, tax: 52200, total: 313200 });

    const order = await createOrder({ userId: u.id, email: u.email, currency: "GHS", address: await address(), deliveryMethodId: await deliveryId(), couponCode: "WELCOME10" });
    expect((await stockFor([v])).get(v)).toBe(before - 2);
    const cart = await getOrCreateCart({ userId: u.id });
    expect(await cartLines(cart.id, "GHS")).toHaveLength(0);

    const r = await initiatePayment({ purpose: "order", subjectId: order.id, userId: u.id, email: u.email, provider: "manual" });
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.reference, r.reference));
    const fin = await userByEmail("finance@homegardens.example");
    await confirmManualPayment(p!.id, fin.id, "MOMO-777");
    await confirmManualPayment(p!.id, fin.id, "MOMO-777").catch(() => {}); // second confirm is rejected, not double-applied
    const [paid] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(paid).toMatchObject({ status: "paid", amountPaid: 313200 });
    const [redemptions] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.couponRedemptions).where(eq(schema.couponRedemptions.orderId, order.id));
    expect(redemptions!.n).toBe(1);

    const store = await userByEmail("store@homegardens.example");
    await updateFulfilment({ orderId: order.id, actorId: store.id, action: "shipped", carrier: "Own fleet", trackingNumber: "HG-1" });
    await updateFulfilment({ orderId: order.id, actorId: store.id, action: "delivered" });
    const [item] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
    const ret = await requestReturn({ orderId: order.id, userId: u.id, items: [{ orderItemId: item!.id, quantity: 1 }], reason: "Battery does not charge" });
    await processReturn({ returnId: ret.id, actorId: store.id, action: "approve" });
    await processReturn({ returnId: ret.id, actorId: store.id, action: "receive_refund", restock: true });
    const [after] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(after!.status).toBe("partially_refunded");
    expect(after!.amountRefunded).toBe(145000 - 14500); // unit price less its share of the discount
    expect((await stockFor([v])).get(v)).toBe(before - 1);
  });

  it("cancelling an unpaid order releases stock", async () => {
    const u = await newCustomer();
    const v = await variantFor("metal-watering-can-9l");
    const before = (await stockFor([v])).get(v)!;
    await setCartQuantity({ userId: u.id }, v, 3);
    const order = await createOrder({ userId: u.id, email: u.email, currency: "GHS", address: await address(), deliveryMethodId: await deliveryId() });
    expect((await stockFor([v])).get(v)).toBe(before - 3);
    await cancelOrder({ orderId: order.id, actorId: u.id, reason: "Changed mind", byCustomer: true });
    expect((await stockFor([v])).get(v)).toBe(before);
  });

  it("stock never goes negative without backorders", async () => {
    const v = await variantFor("petrol-brush-cutter");
    const [inv] = await db.select().from(schema.inventory).where(eq(schema.inventory.variantId, v));
    await expect(db.transaction((tx) => adjustStock(tx, { variantId: v, warehouseId: inv!.warehouseId, delta: -(inv!.onHand + 1), reason: "adjustment" }))).rejects.toThrow(/stock/);
  });

  it("concurrent checkouts cannot oversell the last unit", async () => {
    const v = await variantFor("ceramic-planter-white");
    const [inv] = await db.select().from(schema.inventory).where(eq(schema.inventory.variantId, v));
    await db.update(schema.inventory).set({ onHand: 1 }).where(eq(schema.inventory.variantId, v));
    const [a, b] = [await newCustomer(), await newCustomer()];
    for (const u of [a, b]) await setCartQuantity({ userId: u.id }, v, 1);
    const res = await Promise.allSettled([a, b].map(async (u) => createOrder({ userId: u.id, email: u.email, currency: "GHS", address: await address(), deliveryMethodId: await deliveryId() })));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [after] = await db.select().from(schema.inventory).where(eq(schema.inventory.variantId, v));
    expect(after!.onHand).toBe(0);
    expect(inv).toBeDefined();
  });
});

describe("activities", () => {
  it("enforces seat limits and releases seats on cancellation", async () => {
    const [act] = await db.select().from(schema.activities).where(eq(schema.activities.slug, "pruning-masterclass"));
    const [session] = await db.select().from(schema.activitySessions).where(eq(schema.activitySessions.activityId, act!.id)).limit(1);
    await db.update(schema.activitySessions).set({ capacity: 4, seatsTaken: 0 }).where(eq(schema.activitySessions.id, session!.id));
    const [u1, u2] = [await newCustomer(), await newCustomer()];
    const r1 = await registerForActivity({ userId: u1.id, sessionId: session!.id, quantity: 3, attendeeNames: [] });
    expect(r1.status).toBe("pending_payment");
    await expect(registerForActivity({ userId: u2.id, sessionId: session!.id, quantity: 2, attendeeNames: [] })).rejects.toThrow(/Only 1 seat/);
    await cancelRegistration({ registrationId: r1.id, actorId: u1.id, byCustomer: true });
    const r2 = await registerForActivity({ userId: u2.id, sessionId: session!.id, quantity: 2, attendeeNames: [] });
    const pay = await initiatePayment({ purpose: "activity", subjectId: r2.id, userId: u2.id, email: u2.email, provider: "manual" });
    const [p] = await db.select().from(schema.payments).where(eq(schema.payments.reference, pay.reference));
    await confirmManualPayment(p!.id, (await userByEmail("finance@homegardens.example")).id, "BANK-1");
    const [r2after] = await db.select().from(schema.activityRegistrations).where(eq(schema.activityRegistrations.id, r2.id));
    expect(r2after!.status).toBe("confirmed");
  });

  it("parallel registrations cannot exceed capacity", async () => {
    const [act] = await db.select().from(schema.activities).where(eq(schema.activities.slug, "kids-garden-club"));
    const [session] = await db.select().from(schema.activitySessions).where(eq(schema.activitySessions.activityId, act!.id)).limit(1);
    await db.update(schema.activitySessions).set({ capacity: 5, seatsTaken: 0 }).where(eq(schema.activitySessions.id, session!.id));
    const users = await Promise.all(Array.from({ length: 8 }, () => newCustomer()));
    const res = await Promise.allSettled(users.map((u) => registerForActivity({ userId: u.id, sessionId: session!.id, quantity: 1, attendeeNames: [] })));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    const [s] = await db.select().from(schema.activitySessions).where(eq(schema.activitySessions.id, session!.id));
    expect(s!.seatsTaken).toBe(5);
  });
});

describe("payment verification", () => {
  it("unconfigured providers cannot be used and manual payments are never auto-verified", async () => {
    const u = await newCustomer();
    const v = await variantFor("gardening-gloves");
    await setCartQuantity({ userId: u.id }, v, 1);
    const order = await createOrder({ userId: u.id, email: u.email, currency: "GHS", address: await address(), deliveryMethodId: await deliveryId() });
    await expect(initiatePayment({ purpose: "order", subjectId: order.id, userId: u.id, email: u.email, provider: "paystack" })).rejects.toThrow(/not available/);
    const r = await initiatePayment({ purpose: "order", subjectId: order.id, userId: u.id, email: u.email, provider: "manual" });
    const p = await verifyAndApply(r.reference);
    expect(p.status).toBe("pending");
    const other = await newCustomer();
    await expect(initiatePayment({ purpose: "order", subjectId: order.id, userId: other.id, email: other.email, provider: "manual" })).rejects.toThrow(/not found/);
  });
});
