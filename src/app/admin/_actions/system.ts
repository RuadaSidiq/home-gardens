"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { getCurrentUser, assertPermission } from "@/server/auth/session";
import { UserError } from "@/server/errors";
import { audit } from "@/server/audit";
import { saveSetting, getSettings, type Settings } from "@/server/settings";
import { moderateReview } from "@/server/reviews";
import { sendMessage } from "@/server/messaging";
import { storeImages } from "@/server/storage";
import { slugify } from "@/lib/ids";
import { toMinor } from "@/lib/money";
import type { Permission } from "@/server/auth/permissions";

async function can(p: Permission) {
  const u = await getCurrentUser();
  assertPermission(u, p);
  return u;
}

/* ---------------- CMS ---------------- */
async function setContent(key: string, value: unknown, userId: string) {
  await db.insert(schema.websiteContent).values({ key, value, updatedBy: userId }).onConflictDoUpdate({ target: schema.websiteContent.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
  await audit({ actorId: userId, action: "content.update", entityType: "settings", entityId: key });
}

export async function saveHero(_: Prev, fd: FormData) {
  return run(fd, z.object({ eyebrow: f.text(80), title: f.req("Headline", 120), subtitle: f.text(300), image: f.text(500), primaryLabel: f.text(40), secondaryLabel: f.text(40) }), async (i) => {
    const u = await can("content.manage");
    const up = await storeImages([fd.get("imageFile") as File].filter(Boolean), "cms", u.id, 1);
    await setContent("home.hero", { ...i, image: up[0] ?? i.image }, u.id);
    return { ok: true, message: "Homepage hero saved." };
  });
}

export async function savePromo(_: Prev, fd: FormData) {
  return run(fd, z.object({ title: f.text(120), body: f.text(400), image: f.text(500), ctaLabel: f.text(40), ctaHref: f.text(200), active: f.bool() }), async (i) => {
    const u = await can("content.manage");
    if (i.ctaHref && !i.ctaHref.startsWith("/")) throw new UserError("Use an internal link such as /services.", "ctaHref");
    const up = await storeImages([fd.get("imageFile") as File].filter(Boolean), "cms", u.id, 1);
    await setContent("home.promo", { ...i, image: up[0] ?? i.image }, u.id);
    return { ok: true, message: "Promotion banner saved." };
  });
}

export async function saveAnnouncement(_: Prev, fd: FormData) {
  return run(fd, z.object({ text: f.text(160), active: f.bool() }), async (i) => {
    const u = await can("content.manage");
    await setContent("site.announcement", i, u.id);
    return { ok: true, message: "Announcement saved." };
  });
}

export async function saveSeo(_: Prev, fd: FormData) {
  return run(fd, z.object({ title: f.req("Title", 120), description: f.req("Description", 300) }), async (i) => {
    const u = await can("content.manage");
    await setContent("seo.default", i, u.id);
    return { ok: true, message: "SEO defaults saved." };
  });
}

export async function saveTestimonial(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.optUuid(), name: f.req("Name", 80), location: f.req("Location", 80), quote: f.req("Quote", 600), serviceLabel: f.text(80).optional(), sort: f.int(0, 999), active: f.bool(), delete: f.bool().optional() }), async (i) => {
    const u = await can("content.manage");
    if (i.id && i.delete) await db.delete(schema.testimonials).where(eq(schema.testimonials.id, i.id));
    else {
      const v = { name: i.name, location: i.location, quote: i.quote, serviceLabel: i.serviceLabel || null, sort: i.sort, active: i.active };
      if (i.id) await db.update(schema.testimonials).set(v).where(eq(schema.testimonials.id, i.id));
      else await db.insert(schema.testimonials).values(v);
    }
    await audit({ actorId: u.id, action: "content.testimonial", entityType: "settings", entityId: i.id ?? "new" });
    return { ok: true, message: "Saved." };
  });
}

export async function saveFaq(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.optUuid(), category: f.req("Category", 40), question: f.req("Question", 200), answer: f.req("Answer", 2000), sort: f.int(0, 999), active: f.bool(), delete: f.bool().optional() }), async (i) => {
    await can("content.manage");
    if (i.id && i.delete) await db.delete(schema.faqs).where(eq(schema.faqs.id, i.id));
    else {
      const v = { category: i.category, question: i.question, answer: i.answer, sort: i.sort, active: i.active };
      if (i.id) await db.update(schema.faqs).set(v).where(eq(schema.faqs.id, i.id));
      else await db.insert(schema.faqs).values(v);
    }
    return { ok: true, message: "Saved." };
  });
}

export async function saveProject(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.optUuid(), title: f.req("Title", 120), location: f.req("Location", 120), summary: f.req("Summary", 500), beforeUrl: f.text(500), afterUrl: f.text(500), durationLabel: f.text(40).optional(), serviceCategoryId: f.optInt(1), sort: f.int(0, 999), featured: f.bool(), delete: f.bool().optional() }), async (i) => {
    const u = await can("content.manage");
    if (i.id && i.delete) { await db.delete(schema.gardenProjects).where(eq(schema.gardenProjects.id, i.id)); return { ok: true }; }
    const [before] = await storeImages([fd.get("beforeFile") as File].filter(Boolean), "projects", u.id, 1);
    const [after] = await storeImages([fd.get("afterFile") as File].filter(Boolean), "projects", u.id, 1);
    const v = { title: i.title, location: i.location, summary: i.summary, beforeUrl: before ?? i.beforeUrl, afterUrl: after ?? i.afterUrl, durationLabel: i.durationLabel || null, serviceCategoryId: i.serviceCategoryId ?? null, sort: i.sort, featured: i.featured };
    if (!v.beforeUrl || !v.afterUrl) throw new UserError("Add both a before and an after photo.");
    if (i.id) await db.update(schema.gardenProjects).set(v).where(eq(schema.gardenProjects.id, i.id));
    else await db.insert(schema.gardenProjects).values({ ...v, slug: `${slugify(i.title)}-${Date.now().toString(36)}` });
    return { ok: true, message: "Project saved." };
  });
}

export async function savePage(_: Prev, fd: FormData) {
  return run(fd, z.object({ slug: f.req("Slug", 60).transform(slugify), title: f.req("Title", 120), body: f.req("Content", 50000), seoTitle: f.text(120).optional(), seoDescription: f.text(300).optional(), published: f.bool() }), async (i) => {
    const u = await can("content.manage");
    const v = { title: i.title, body: i.body, seoTitle: i.seoTitle || null, seoDescription: i.seoDescription || null, published: i.published, updatedAt: new Date() };
    await db.insert(schema.pages).values({ slug: i.slug, ...v }).onConflictDoUpdate({ target: schema.pages.slug, set: v });
    await audit({ actorId: u.id, action: "content.page", entityType: "settings", entityId: i.slug });
    return { ok: true, message: `Page saved at /pages/${i.slug}.` };
  });
}

/* ---------------- Reviews ---------------- */
export async function moderate(_: Prev, fd: FormData) {
  return run(fd, z.object({ reviewId: f.uuid(), status: z.enum(["published", "hidden"]), response: f.text(1000).optional() }), async (i) => {
    const u = await can("reviews.moderate");
    await moderateReview(i.reviewId, i.status, fd.has("response") ? i.response || null : undefined);
    await audit({ actorId: u.id, action: `review.${i.status}`, entityType: "settings", entityId: i.reviewId });
  });
}

/* ---------------- Notification templates ---------------- */
export async function saveTemplate(_: Prev, fd: FormData) {
  return run(fd, z.object({ key: f.req("Key", 60), subject: f.req("Subject", 200), body: f.req("Body", 4000), sms: f.text(320).optional(), channels: z.array(z.enum(["in_app", "email", "sms", "whatsapp", "push"])).optional(), active: f.bool() }), async (i) => {
    const u = await can("notifications.manage");
    await db.update(schema.notificationTemplates).set({ subject: i.subject, body: i.body, sms: i.sms || null, channels: i.channels ?? [], active: i.active, updatedAt: new Date() }).where(eq(schema.notificationTemplates.key, i.key));
    await audit({ actorId: u.id, action: "notification_template.update", entityType: "settings", entityId: i.key });
    return { ok: true, message: "Template saved." };
  });
}

/* ---------------- Support ---------------- */
export async function staffReply(_: Prev, fd: FormData) {
  return run(fd, z.object({ conversationId: f.uuid(), body: f.req("Message", 4000), internal: f.bool().optional() }), async (i) => {
    const u = await can("support.manage");
    await sendMessage({ conversationId: i.conversationId, user: u, body: i.body, internal: i.internal, staff: true });
  });
}

export async function updateTicket(_: Prev, fd: FormData) {
  return run(fd, z.object({ ticketId: f.uuid(), status: z.enum(["open", "pending", "resolved", "closed"]), priority: z.enum(["low", "normal", "high", "urgent"]), assignedTo: f.optUuid(), resolution: f.text(1000).optional() }), async (i) => {
    const u = await can("support.manage");
    await db.update(schema.supportTickets).set({ status: i.status, priority: i.priority, assignedTo: i.assignedTo ?? null, resolution: i.resolution || null, updatedAt: new Date() }).where(eq(schema.supportTickets.id, i.ticketId));
    await audit({ actorId: u.id, action: "ticket.update", entityType: "settings", entityId: i.ticketId, meta: { status: i.status } });
    return { ok: true, message: "Ticket updated." };
  });
}

export async function markEnquiry(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.uuid() }), async (i) => {
    await can("support.manage");
    await db.update(schema.contactEnquiries).set({ status: "handled" }).where(eq(schema.contactEnquiries.id, i.id));
  });
}

/* ---------------- Locations, currencies & taxes ---------------- */
export async function saveCountry(_: Prev, fd: FormData) {
  return run(fd, z.object({ code: z.string().length(2).transform((s) => s.toUpperCase()), name: f.req("Name", 80), currency: z.string().length(3), phoneCode: f.req("Phone code", 6), timezone: f.req("Time zone", 60), regionLabel: f.text(30).optional(), postalLabel: f.text(30).optional(), postalCodeRequired: f.bool(), providers: z.array(z.string()).optional(), servicesEnabled: f.bool(), shippingEnabled: f.bool(), active: f.bool() }), async (i) => {
    const u = await can("locations.manage");
    try { new Intl.DateTimeFormat("en", { timeZone: i.timezone }); } catch { throw new UserError("Unknown time zone. Use an IANA name such as Africa/Accra.", "timezone"); }
    const v = { name: i.name, currency: i.currency, phoneCode: i.phoneCode, timezone: i.timezone, addressFormat: { postalCodeRequired: i.postalCodeRequired, regionLabel: i.regionLabel || "Region", postalLabel: i.postalLabel || undefined }, paymentProviders: i.providers ?? [], servicesEnabled: i.servicesEnabled, shippingEnabled: i.shippingEnabled, active: i.active };
    await db.insert(schema.countries).values({ code: i.code, ...v }).onConflictDoUpdate({ target: schema.countries.code, set: v });
    await audit({ actorId: u.id, action: "country.save", entityType: "settings", entityId: i.code });
    return { ok: true, message: `${i.name} saved.` };
  });
}

export async function saveCity(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.optInt(1), name: f.req("City", 80), countryCode: z.string().length(2), regionName: f.text(80).optional(), serviceAvailable: f.bool(), active: f.bool() }), async (i) => {
    await can("locations.manage");
    let regionId: number | null = null;
    if (i.regionName) {
      const [r] = await db.insert(schema.regions).values({ countryCode: i.countryCode, name: i.regionName }).onConflictDoUpdate({ target: [schema.regions.countryCode, schema.regions.name], set: { name: i.regionName } }).returning();
      regionId = r!.id;
    }
    const v = { name: i.name, countryCode: i.countryCode, regionId, serviceAvailable: i.serviceAvailable, active: i.active };
    if (i.id) await db.update(schema.cities).set(v).where(eq(schema.cities.id, i.id));
    else await db.insert(schema.cities).values({ ...v, slug: slugify(i.name) });
    return { ok: true, message: "City saved." };
  });
}

export async function saveRate(_: Prev, fd: FormData) {
  return run(fd, z.object({ base: z.string().length(3), quote: z.string().length(3), rate: z.coerce.number().positive("Enter a positive rate") }), async (i) => {
    const u = await can("locations.manage");
    if (i.base === i.quote) throw new UserError("Choose two different currencies.");
    await db.insert(schema.exchangeRates).values({ base: i.base, quote: i.quote, rate: i.rate.toFixed(8), source: `manual:${u.email}` });
    await audit({ actorId: u.id, action: "exchange_rate.set", entityType: "settings", entityId: `${i.base}/${i.quote}`, meta: { rate: i.rate } });
    return { ok: true, message: `1 ${i.base} = ${i.rate} ${i.quote} saved.` };
  });
}

export async function toggleCurrency(_: Prev, fd: FormData) {
  return run(fd, z.object({ code: z.string().length(3), active: z.enum(["1", "0"]) }), async (i) => {
    await can("locations.manage");
    if (i.code === (await getSettings()).finance.baseCurrency && i.active === "0") throw new UserError("You can't disable the base currency.");
    await db.update(schema.currencies).set({ active: i.active === "1" }).where(eq(schema.currencies.code, i.code));
  });
}

export async function saveTax(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.optInt(1), countryCode: z.string().length(2), name: f.req("Name", 60), rate: z.coerce.number().min(0).max(100), scope: z.enum(["all", "products", "services", "activities"]), inclusive: f.bool(), active: f.bool() }), async (i) => {
    const u = await can("locations.manage");
    const v = { countryCode: i.countryCode, name: i.name, rateBps: Math.round(i.rate * 100), scope: i.scope, inclusive: i.inclusive, active: i.active };
    if (i.id) await db.update(schema.taxConfigurations).set(v).where(eq(schema.taxConfigurations.id, i.id));
    else await db.insert(schema.taxConfigurations).values(v);
    await audit({ actorId: u.id, action: "tax.save", entityType: "settings", entityId: String(i.id ?? "new"), meta: v });
    return { ok: true, message: "Tax saved." };
  });
}

/* ---------------- Settings ---------------- */
const SETTINGS_SCHEMAS = {
  company: z.object({ name: f.req("Name", 80), legalName: f.req("Legal name", 120), email: f.email(), phone: f.req("Phone", 30), whatsapp: f.text(30), address: f.req("Address", 200), tagline: f.text(120) }),
  booking: z.object({ autoAssign: f.bool(), minLeadHours: f.int(0, 240), maxAdvanceDays: f.int(1, 365), freeCancellationHours: f.int(0, 240), lateCancellationFeePercent: f.int(0, 100), maxReschedules: f.int(0, 10), autoCompleteHours: f.int(1, 720), gardenerResponseHours: f.int(1, 168), slotMinutes: f.int(15, 240) }),
  commerce: z.object({ allowBackorders: f.bool(), vendorMarketplace: f.bool(), returnWindowDays: f.int(0, 90), defaultWarehouseCode: f.req("Warehouse", 20) }),
  finance: z.object({ baseCurrency: z.string().length(3), payoutHoldDays: f.int(0, 60), minimumPayout: f.amount(), defaultCommissionPercent: z.coerce.number().min(0).max(100) }),
  social: z.object({ facebook: f.text(200), instagram: f.text(200), x: f.text(200), youtube: f.text(200) }),
};

export async function saveSettingsGroup(_: Prev, fd: FormData) {
  const group = String(fd.get("group")) as keyof typeof SETTINGS_SCHEMAS;
  const sch = SETTINGS_SCHEMAS[group];
  if (!sch) return { ok: false as const, error: "Unknown settings group." };
  return run(fd, sch, async (i) => {
    const u = await can("settings.manage");
    let value: unknown = i;
    if (group === "finance") {
      const fi = i as z.infer<typeof SETTINGS_SCHEMAS.finance>;
      value = { baseCurrency: fi.baseCurrency, payoutHoldDays: fi.payoutHoldDays, minimumPayout: toMinor(fi.minimumPayout, fi.baseCurrency), defaultCommissionBps: Math.round(fi.defaultCommissionPercent * 100) };
    }
    if (group === "social") {
      for (const url of Object.values(i as Record<string, string>)) if (url && !/^https:\/\//.test(url)) throw new UserError("Social links must start with https://");
    }
    await saveSetting(group, value as Settings[typeof group], u.id);
    await audit({ actorId: u.id, action: "settings.update", entityType: "settings", entityId: group, meta: value as Record<string, unknown> });
    return { ok: true, message: "Settings saved." };
  });
}
