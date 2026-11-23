"use server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { getCurrentUser, assertPermission } from "@/server/auth/session";
import { UserError } from "@/server/errors";
import { audit } from "@/server/audit";
import { cancelOrder, processReturn, updateFulfilment } from "@/server/commerce/orders";
import { toMinor } from "@/lib/money";
import type { Permission } from "@/server/auth/permissions";

async function can(p: Permission) {
  const u = await getCurrentUser();
  assertPermission(u, p);
  return u;
}

export async function fulfilOrder(_: Prev, fd: FormData) {
  return run(fd, z.object({ orderId: f.uuid(), action: z.enum(["processing", "shipped", "delivered"]), carrier: f.text(60).optional(), trackingNumber: f.text(80).optional(), note: f.text(300).optional() }), async (i) => {
    const u = await can("orders.manage");
    await updateFulfilment({ orderId: i.orderId, actorId: u.id, action: i.action, carrier: i.carrier || undefined, trackingNumber: i.trackingNumber || undefined, note: i.note || undefined });
    await audit({ actorId: u.id, action: `order.${i.action}`, entityType: "order", entityId: i.orderId });
    return { ok: true, message: `Order marked ${i.action}.` };
  });
}

export async function staffCancelOrder(_: Prev, fd: FormData) {
  return run(fd, z.object({ orderId: f.uuid(), reason: f.req("Reason", 300) }), async (i) => {
    const u = await can("orders.manage");
    await cancelOrder({ orderId: i.orderId, actorId: u.id, reason: i.reason, byCustomer: false });
    return { ok: true, message: "Order cancelled; stock released and any payment refunded." };
  });
}

export async function handleReturn(_: Prev, fd: FormData) {
  return run(fd, z.object({ returnId: f.uuid(), action: z.enum(["approve", "reject", "receive_refund"]), note: f.text(500).optional(), restock: f.bool().optional() }), async (i) => {
    const u = await can("orders.manage");
    await processReturn({ returnId: i.returnId, actorId: u.id, action: i.action, note: i.note || undefined, restock: i.restock ?? true });
    await audit({ actorId: u.id, action: `return.${i.action}`, entityType: "order", entityId: i.returnId });
    return { ok: true, message: "Return updated." };
  });
}

export async function saveOrderNote(_: Prev, fd: FormData) {
  return run(fd, z.object({ orderId: f.uuid(), internalNote: f.text(2000) }), async (i) => {
    await can("orders.manage");
    await db.update(schema.orders).set({ internalNote: i.internalNote || null }).where(eq(schema.orders.id, i.orderId));
    return { ok: true, message: "Saved." };
  });
}

/* ---------------- Coupons ---------------- */
export async function saveCoupon(_: Prev, fd: FormData) {
  return run(
    fd,
    z.object({ id: f.optUuid(), code: f.req("Code", 30).transform((s) => s.toUpperCase().replace(/\s/g, "")), description: f.text(200).optional(), type: z.enum(["percent", "fixed"]), value: f.amount().refine((n) => n > 0, "Enter a value"), currency: f.text(3).optional(), scope: z.enum(["all", "products", "services", "activities"]), minSubtotal: f.amount(), maxUses: f.optInt(1), perUserLimit: f.int(1, 100), startsAt: f.text(20).optional(), endsAt: f.text(20).optional(), active: f.bool() }),
    async (i) => {
      const u = await can("promotions.manage");
      if (i.type === "percent" && i.value > 100) throw new UserError("A percentage can't exceed 100.", "value");
      const cur = i.currency || "GHS";
      const v = { code: i.code, description: i.description || null, type: i.type, value: i.type === "percent" ? Math.round(i.value) : toMinor(i.value, cur), currency: i.type === "fixed" ? cur : null, scope: i.scope, minSubtotal: toMinor(i.minSubtotal, cur), maxUses: i.maxUses ?? null, perUserLimit: i.perUserLimit, startsAt: i.startsAt ? new Date(i.startsAt) : null, endsAt: i.endsAt ? new Date(i.endsAt + "T23:59:59Z") : null, active: i.active };
      const [dupe] = await db.select({ id: schema.coupons.id }).from(schema.coupons).where(sql`upper(${schema.coupons.code}) = ${i.code}`);
      if (dupe && dupe.id !== i.id) throw new UserError("That code already exists.", "code");
      if (i.id) await db.update(schema.coupons).set(v).where(eq(schema.coupons.id, i.id));
      else await db.insert(schema.coupons).values(v);
      await audit({ actorId: u.id, action: "coupon.save", entityType: "coupon", entityId: i.code });
      return { ok: true, message: "Coupon saved." };
    },
  );
}

/* ---------------- Delivery ---------------- */
export async function saveZone(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.optInt(1), name: f.req("Name", 80), countryCode: z.string().length(2), cityIds: z.array(z.coerce.number().int()).optional(), active: f.bool() }), async (i) => {
    await can("locations.manage");
    const v = { name: i.name, countryCode: i.countryCode, cityIds: i.cityIds ?? [], active: i.active };
    if (i.id) await db.update(schema.shippingZones).set(v).where(eq(schema.shippingZones.id, i.id));
    else await db.insert(schema.shippingZones).values(v);
    return { ok: true, message: "Zone saved." };
  });
}

export async function saveDeliveryMethod(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.optInt(1), zoneId: f.int(1), name: f.req("Name", 80), type: z.enum(["flat", "pickup", "weight"]), price: f.amount(), pricePerKg: f.amount(), currency: z.string().length(3), freeOver: f.optAmount(), minDays: f.int(0, 60), maxDays: f.int(0, 60), active: f.bool() }), async (i) => {
    await can("locations.manage");
    const v = { zoneId: i.zoneId, name: i.name, type: i.type, price: toMinor(i.price, i.currency), pricePerKg: toMinor(i.pricePerKg, i.currency), currency: i.currency, freeOver: i.freeOver != null ? toMinor(i.freeOver, i.currency) : null, minDays: i.minDays, maxDays: Math.max(i.minDays, i.maxDays), active: i.active };
    if (i.id) await db.update(schema.deliveryMethods).set(v).where(eq(schema.deliveryMethods.id, i.id));
    else await db.insert(schema.deliveryMethods).values(v);
    return { ok: true, message: "Delivery method saved." };
  });
}
