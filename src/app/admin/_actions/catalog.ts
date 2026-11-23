"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { getCurrentUser, assertPermission } from "@/server/auth/session";
import { UserError } from "@/server/errors";
import { audit } from "@/server/audit";
import { storeImages } from "@/server/storage";
import { slugify } from "@/lib/ids";
import { toMinor } from "@/lib/money";
import { adjustStock, defaultWarehouseId } from "@/server/commerce/inventory";
import { cancelRegistration, setAttendance } from "@/server/activities";
import type { Permission } from "@/server/auth/permissions";

async function can(p: Permission) {
  const u = await getCurrentUser();
  assertPermission(u, p);
  return u;
}
const lines = (s?: string) => (s ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
const uniqueSlug = async (table: typeof schema.services | typeof schema.products | typeof schema.activities, base: string, exceptId?: string) => {
  let slug = slugify(base) || "item";
  for (let i = 2; i < 50; i++) {
    const [hit] = await db.select({ id: table.id }).from(table).where(eq(table.slug, slug));
    if (!hit || hit.id === exceptId) return slug;
    slug = `${slugify(base)}-${i}`;
  }
  return `${slugify(base)}-${Date.now()}`;
};

/* ---------------- Service categories & services ---------------- */
export async function saveServiceCategory(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.optInt(1), name: f.req("Name", 80), description: f.text(300).optional(), icon: f.text(20).optional(), sort: f.int(0, 999), active: f.bool() }), async (i) => {
    const u = await can("services.manage");
    const values = { name: i.name, description: i.description ?? "", icon: i.icon || "leaf", sort: i.sort, active: i.active };
    if (i.id) await db.update(schema.serviceCategories).set(values).where(eq(schema.serviceCategories.id, i.id));
    else await db.insert(schema.serviceCategories).values({ ...values, slug: slugify(i.name) });
    await audit({ actorId: u.id, action: "service_category.save", entityType: "service", entityId: String(i.id ?? "new") });
    return { ok: true, message: "Category saved." };
  });
}

const serviceSchema = z.object({
  id: f.optUuid(),
  name: f.req("Name", 120),
  categoryId: f.int(1),
  summary: f.req("Summary", 200),
  description: f.req("Description", 5000),
  pricingModel: z.enum(["fixed", "starting", "hourly", "per_sqm", "quote", "inspection"]),
  basePrice: f.amount(),
  minimumCharge: f.amount(),
  currency: z.string().length(3),
  durationMinutes: f.int(15, 24 * 60),
  depositPercent: f.int(0, 100),
  requirements: f.text(1000).optional(),
  includes: f.text(2000).optional(),
  featured: f.bool(),
  active: f.bool(),
  seoTitle: f.text(120).optional(),
  seoDescription: f.text(300).optional(),
  areas: z.array(z.coerce.number().int()).optional(),
  imageUrls: f.text(4000).optional(),
});

export async function saveService(_: Prev, fd: FormData) {
  return run(fd, serviceSchema, async (i) => {
    const u = await can("services.manage");
    if (["fixed", "starting", "hourly", "per_sqm"].includes(i.pricingModel) && i.basePrice <= 0) throw new UserError("This pricing model needs a base price.", "basePrice");
    const uploaded = await storeImages(fd.getAll("images") as File[], "services", u.id, 6);
    const images = [...lines(i.imageUrls), ...uploaded];
    const values = {
      name: i.name, categoryId: i.categoryId, summary: i.summary, description: i.description, pricingModel: i.pricingModel,
      basePrice: toMinor(i.basePrice, i.currency), minimumCharge: toMinor(i.minimumCharge, i.currency), currency: i.currency,
      durationMinutes: i.durationMinutes, depositPercent: i.depositPercent, requirements: i.requirements || null, includes: lines(i.includes),
      featured: i.featured, active: i.active, seoTitle: i.seoTitle || null, seoDescription: i.seoDescription || null, images, updatedAt: new Date(),
      requiresInspection: i.pricingModel === "inspection",
    };
    const id = await db.transaction(async (tx) => {
      let id = i.id;
      if (id) await tx.update(schema.services).set(values).where(eq(schema.services.id, id));
      else {
        const [r] = await tx.insert(schema.services).values({ ...values, slug: await uniqueSlug(schema.services, i.name) }).returning({ id: schema.services.id });
        id = r!.id;
      }
      await tx.delete(schema.serviceAreas).where(eq(schema.serviceAreas.serviceId, id));
      if (i.areas?.length) await tx.insert(schema.serviceAreas).values([...new Set(i.areas)].map((cityId) => ({ serviceId: id!, cityId })));
      return id;
    });
    await audit({ actorId: u.id, action: i.id ? "service.update" : "service.create", entityType: "service", entityId: id });
    if (!i.id) redirect(`/admin/services/${id}?saved=1`);
    return { ok: true, message: "Service saved." };
  });
}

export async function saveServicePrice(_: Prev, fd: FormData) {
  return run(fd, z.object({ serviceId: f.uuid(), countryCode: z.string().length(2), basePrice: f.optAmount(), minimumCharge: f.optAmount() }), async (i) => {
    const u = await can("services.manage");
    const [c] = await db.select().from(schema.countries).where(eq(schema.countries.code, i.countryCode));
    if (!c) throw new UserError("Unknown country.");
    if (i.basePrice == null) {
      await db.delete(schema.servicePrices).where(and(eq(schema.servicePrices.serviceId, i.serviceId), eq(schema.servicePrices.countryCode, i.countryCode)));
    } else {
      const v = { currency: c.currency, basePrice: toMinor(i.basePrice, c.currency), minimumCharge: toMinor(i.minimumCharge ?? 0, c.currency) };
      await db.insert(schema.servicePrices).values({ serviceId: i.serviceId, countryCode: i.countryCode, ...v }).onConflictDoUpdate({ target: [schema.servicePrices.serviceId, schema.servicePrices.countryCode], set: v });
    }
    await audit({ actorId: u.id, action: "service.country_price", entityType: "service", entityId: i.serviceId, meta: i });
    return { ok: true, message: "Country price saved." };
  });
}

/* ---------------- Product categories & brands ---------------- */
export async function saveProductCategory(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.optInt(1), name: f.req("Name", 80), description: f.text(300).optional(), imageUrl: f.text(500).optional(), sort: f.int(0, 999), active: f.bool() }), async (i) => {
    await can("products.manage");
    const v = { name: i.name, description: i.description || null, imageUrl: i.imageUrl || null, sort: i.sort, active: i.active };
    if (i.id) await db.update(schema.productCategories).set(v).where(eq(schema.productCategories.id, i.id));
    else await db.insert(schema.productCategories).values({ ...v, slug: slugify(i.name) });
    return { ok: true, message: "Category saved." };
  });
}
export async function saveBrand(_: Prev, fd: FormData) {
  return run(fd, z.object({ name: f.req("Brand", 60) }), async (i) => {
    await can("products.manage");
    await db.insert(schema.brands).values({ name: i.name, slug: slugify(i.name) }).onConflictDoNothing();
    return { ok: true, message: "Brand added." };
  });
}

/* ---------------- Products & variants ---------------- */
const productSchema = z.object({
  id: f.optUuid(),
  name: f.req("Name", 160),
  sku: f.req("SKU", 40),
  summary: f.text(300).optional(),
  description: f.req("Description", 8000),
  categoryId: f.int(1),
  brandId: f.optInt(1),
  vendorId: f.uuid(),
  price: f.amount().refine((n) => n > 0, "Enter a price"),
  salePrice: f.optAmount(),
  currency: z.string().length(3),
  weightGrams: f.int(0, 1_000_000),
  lowStockThreshold: f.int(0, 10000),
  specs: f.text(4000).optional(),
  imageUrls: f.text(4000).optional(),
  featured: f.bool(),
  active: f.bool(),
  allowBackorder: f.bool(),
  taxable: f.bool(),
  shippable: f.bool(),
  seoTitle: f.text(120).optional(),
  seoDescription: f.text(300).optional(),
  initialStock: f.optInt(0, 100000),
});

export async function saveProduct(_: Prev, fd: FormData) {
  return run(fd, productSchema, async (i) => {
    const u = await can("products.manage");
    if (i.salePrice != null && i.salePrice >= i.price) throw new UserError("Sale price must be lower than the regular price.", "salePrice");
    const [skuHit] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.sku, i.sku));
    if (skuHit && skuHit.id !== i.id) throw new UserError("That SKU is already used.", "sku");
    const uploaded = await storeImages(fd.getAll("images") as File[], "products", u.id, 8);
    const specs = Object.fromEntries(lines(i.specs).map((l) => l.split(":")).filter((p) => p.length >= 2).map(([k, ...v]) => [k!.trim(), v.join(":").trim()]));
    const values = {
      name: i.name, sku: i.sku, summary: i.summary ?? "", description: i.description, categoryId: i.categoryId, brandId: i.brandId ?? null, vendorId: i.vendorId,
      price: toMinor(i.price, i.currency), salePrice: i.salePrice != null ? toMinor(i.salePrice, i.currency) : null, currency: i.currency,
      weightGrams: i.weightGrams, lowStockThreshold: i.lowStockThreshold, specs, images: [...lines(i.imageUrls), ...uploaded],
      featured: i.featured, active: i.active, allowBackorder: i.allowBackorder, taxable: i.taxable, shippable: i.shippable,
      seoTitle: i.seoTitle || null, seoDescription: i.seoDescription || null, updatedAt: new Date(),
    };
    let id = i.id;
    if (id) {
      await db.update(schema.products).set(values).where(eq(schema.products.id, id));
    } else {
      id = await db.transaction(async (tx) => {
        const [p] = await tx.insert(schema.products).values({ ...values, slug: await uniqueSlug(schema.products, i.name) }).returning({ id: schema.products.id });
        const [v] = await tx.insert(schema.productVariants).values({ productId: p!.id, sku: i.sku, name: "Default", isDefault: true }).returning();
        if (i.initialStock) await adjustStock(tx, { variantId: v!.id, warehouseId: await defaultWarehouseId(tx), delta: i.initialStock, reason: "initial", actorId: u.id, note: "Opening stock" });
        return p!.id;
      });
    }
    await audit({ actorId: u.id, action: i.id ? "product.update" : "product.create", entityType: "product", entityId: id });
    if (!i.id) redirect(`/admin/products/${id}?saved=1`);
    return { ok: true, message: "Product saved." };
  });
}

export async function saveVariant(_: Prev, fd: FormData) {
  return run(fd, z.object({ productId: f.uuid(), id: f.optUuid(), name: f.req("Variant name", 80), sku: f.req("SKU", 40), optionName: f.text(40).optional(), price: f.optAmount(), salePrice: f.optAmount(), active: f.bool() }), async (i) => {
    const u = await can("products.manage");
    const [p] = await db.select().from(schema.products).where(eq(schema.products.id, i.productId));
    if (!p) throw new UserError("Product not found.");
    const [hit] = await db.select({ id: schema.productVariants.id }).from(schema.productVariants).where(eq(schema.productVariants.sku, i.sku));
    if (hit && hit.id !== i.id) throw new UserError("That SKU is already used.", "sku");
    const v = { name: i.name, sku: i.sku, options: i.optionName ? { [i.optionName]: i.name } : {}, priceOverride: i.price != null ? toMinor(i.price, p.currency) : null, salePriceOverride: i.salePrice != null ? toMinor(i.salePrice, p.currency) : null, active: i.active };
    if (i.id) await db.update(schema.productVariants).set(v).where(and(eq(schema.productVariants.id, i.id), eq(schema.productVariants.productId, p.id)));
    else await db.insert(schema.productVariants).values({ ...v, productId: p.id, isDefault: false });
    await audit({ actorId: u.id, action: "product.variant", entityType: "product", entityId: p.id, meta: { sku: i.sku } });
    return { ok: true, message: "Variant saved." };
  });
}

/* ---------------- Inventory ---------------- */
export async function adjustInventory(_: Prev, fd: FormData) {
  return run(fd, z.object({ variantId: f.uuid(), warehouseId: f.int(1), mode: z.enum(["add", "remove", "set"]), quantity: f.int(0, 100000), reason: z.enum(["restock", "adjustment", "damage", "return", "transfer"]), note: f.text(300).optional() }), async (i) => {
    const u = await can("inventory.manage");
    await db.transaction(async (tx) => {
      const [cur] = await tx.select().from(schema.inventory).where(and(eq(schema.inventory.variantId, i.variantId), eq(schema.inventory.warehouseId, i.warehouseId))).for("update");
      const onHand = cur?.onHand ?? 0;
      const delta = i.mode === "add" ? i.quantity : i.mode === "remove" ? -i.quantity : i.quantity - onHand;
      if (delta === 0) throw new UserError("Nothing to change.");
      await adjustStock(tx, { variantId: i.variantId, warehouseId: i.warehouseId, delta, reason: i.reason, note: i.note, actorId: u.id });
    });
    await audit({ actorId: u.id, action: "inventory.adjust", entityType: "inventory", entityId: i.variantId, meta: i });
    return { ok: true, message: "Stock updated." };
  });
}

export async function transferStock(_: Prev, fd: FormData) {
  return run(fd, z.object({ variantId: f.uuid(), fromId: f.int(1), toId: f.int(1), quantity: f.int(1, 100000) }), async (i) => {
    const u = await can("inventory.manage");
    if (i.fromId === i.toId) throw new UserError("Choose two different warehouses.");
    await db.transaction(async (tx) => {
      await adjustStock(tx, { variantId: i.variantId, warehouseId: i.fromId, delta: -i.quantity, reason: "transfer", note: `To warehouse ${i.toId}`, actorId: u.id });
      await adjustStock(tx, { variantId: i.variantId, warehouseId: i.toId, delta: i.quantity, reason: "transfer", note: `From warehouse ${i.fromId}`, actorId: u.id });
    });
    await audit({ actorId: u.id, action: "inventory.transfer", entityType: "inventory", entityId: i.variantId, meta: i });
    return { ok: true, message: "Stock transferred." };
  });
}

export async function saveWarehouse(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.optInt(1), code: f.req("Code", 20), name: f.req("Name", 80), address: f.text(200).optional(), countryCode: z.string().length(2), active: f.bool() }), async (i) => {
    await can("inventory.manage");
    const v = { code: i.code.toUpperCase(), name: i.name, address: i.address || null, countryCode: i.countryCode, active: i.active };
    if (i.id) await db.update(schema.warehouses).set(v).where(eq(schema.warehouses.id, i.id));
    else await db.insert(schema.warehouses).values(v);
    return { ok: true, message: "Warehouse saved." };
  });
}

/* ---------------- Activities ---------------- */
const activitySchema = z.object({
  id: f.optUuid(), title: f.req("Title", 160), type: f.req("Type", 30), summary: f.req("Summary", 300), description: f.req("Description", 6000),
  organizer: f.req("Organiser", 120), venue: f.req("Venue", 160), address: f.req("Address", 300), cityId: f.int(1), price: f.amount(), currency: z.string().length(3),
  defaultCapacity: f.int(1, 5000), maxPerBooking: f.int(1, 500), bookingDeadlineHours: f.int(0, 720), requirements: f.text(1000).optional(),
  recurrence: z.enum(["none", "weekly", "monthly"]), requiresPayment: f.bool(), featured: f.bool(), active: f.bool(), imageUrls: f.text(4000).optional(),
});
export async function saveActivity(_: Prev, fd: FormData) {
  return run(fd, activitySchema, async (i) => {
    const u = await can("activities.manage");
    const [city] = await db.select().from(schema.cities).where(eq(schema.cities.id, i.cityId));
    const uploaded = await storeImages(fd.getAll("images") as File[], "activities", u.id, 6);
    const v = { title: i.title, type: i.type, summary: i.summary, description: i.description, organizer: i.organizer, venue: i.venue, address: i.address, cityId: i.cityId, countryCode: city!.countryCode, price: toMinor(i.price, i.currency), currency: i.currency, defaultCapacity: i.defaultCapacity, maxPerBooking: i.maxPerBooking, bookingDeadlineHours: i.bookingDeadlineHours, requirements: i.requirements || null, recurrence: i.recurrence, requiresPayment: i.requiresPayment && i.price > 0, featured: i.featured, active: i.active, images: [...lines(i.imageUrls), ...uploaded] };
    let id = i.id;
    if (id) await db.update(schema.activities).set(v).where(eq(schema.activities.id, id));
    else id = (await db.insert(schema.activities).values({ ...v, slug: await uniqueSlug(schema.activities, i.title) }).returning({ id: schema.activities.id }))[0]!.id;
    await audit({ actorId: u.id, action: i.id ? "activity.update" : "activity.create", entityType: "activity", entityId: id });
    if (!i.id) redirect(`/admin/activities/${id}`);
    return { ok: true, message: "Activity saved." };
  });
}

/** Adds one session, or a series (weekly/monthly) of up to 12. Times are entered in the activity country's local time. */
export async function addSessions(_: Prev, fd: FormData) {
  return run(fd, z.object({ activityId: f.uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/), capacity: f.int(1, 5000), repeat: z.enum(["none", "weekly", "monthly"]), count: f.int(1, 12) }), async (i) => {
    await can("activities.manage");
    if (i.end <= i.start) throw new UserError("End time must be after start.", "end");
    const [a] = await db.select({ a: schema.activities, tz: schema.countries.timezone }).from(schema.activities).innerJoin(schema.countries, eq(schema.countries.code, schema.activities.countryCode)).where(eq(schema.activities.id, i.activityId));
    if (!a) throw new UserError("Activity not found.");
    const { zonedToUtc, addDaysStr } = await import("@/lib/time");
    const rows = [];
    for (let n = 0; n < (i.repeat === "none" ? 1 : i.count); n++) {
      let d = i.date;
      if (i.repeat === "weekly") d = addDaysStr(i.date, 7 * n);
      if (i.repeat === "monthly") { const x = new Date(i.date + "T12:00:00Z"); x.setUTCMonth(x.getUTCMonth() + n); d = x.toISOString().slice(0, 10); }
      rows.push({ activityId: a.a.id, startsAt: zonedToUtc(d, i.start, a.tz), endsAt: zonedToUtc(d, i.end, a.tz), capacity: i.capacity });
    }
    if (rows[0]!.startsAt < new Date()) throw new UserError("Sessions must be in the future.", "date");
    await db.insert(schema.activitySessions).values(rows);
    return { ok: true, message: `${rows.length} session(s) added.` };
  });
}

export async function updateSession(_: Prev, fd: FormData) {
  return run(fd, z.object({ sessionId: f.uuid(), capacity: f.optInt(1, 5000), status: z.enum(["scheduled", "cancelled", "completed"]).optional() }), async (i) => {
    const u = await can("activities.manage");
    const [s] = await db.select().from(schema.activitySessions).where(eq(schema.activitySessions.id, i.sessionId));
    if (!s) throw new UserError("Session not found.");
    if (i.capacity != null && i.capacity < s.seatsTaken) throw new UserError(`Capacity can't be below the ${s.seatsTaken} seats already booked.`, "capacity");
    await db.update(schema.activitySessions).set({ ...(i.capacity != null ? { capacity: i.capacity } : {}), ...(i.status ? { status: i.status } : {}) }).where(eq(schema.activitySessions.id, s.id));
    if (i.status === "cancelled") {
      // Cancel and refund every registration for a cancelled session.
      const regs = await db.select().from(schema.activityRegistrations).where(and(eq(schema.activityRegistrations.sessionId, s.id), sql`${schema.activityRegistrations.status} in ('pending_payment','confirmed')`));
      for (const r of regs) await cancelRegistration({ registrationId: r.id, actorId: u.id, byCustomer: false });
    }
    await audit({ actorId: u.id, action: "activity.session_update", entityType: "activity", entityId: s.activityId, meta: i });
    return { ok: true, message: "Session updated." };
  });
}

export async function markAttendance(_: Prev, fd: FormData) {
  return run(fd, z.object({ registrationId: f.uuid(), status: z.enum(["attended", "no_show", "confirmed"]) }), async (i) => {
    await can("activities.manage");
    await setAttendance(i.registrationId, i.status);
  });
}

export async function staffCancelRegistration(_: Prev, fd: FormData) {
  return run(fd, z.object({ registrationId: f.uuid() }), async (i) => {
    const u = await can("activities.manage");
    await cancelRegistration({ registrationId: i.registrationId, actorId: u.id, byCustomer: false });
    return { ok: true, message: "Registration cancelled and refunded if paid." };
  });
}
