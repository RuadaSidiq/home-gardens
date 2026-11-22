import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import { getRate } from "../currency";
import { convert } from "@/lib/money";
import { unitPrice } from "../commerce/cart";
import { stockFor } from "../commerce/inventory";

/* ------------------------------------------------------------------ */
/* Services                                                            */
/* ------------------------------------------------------------------ */
export type ServicePriceLabel = { label: string; amount: number | null; suffix: string; prefix: string };

/** Human price label in the display currency, e.g. "From GH₵450", "GH₵1.50 / m²", "Quote on request". */
export async function servicePriceLabel(s: Pick<typeof schema.services.$inferSelect, "pricingModel" | "basePrice" | "minimumCharge" | "currency">, currency: string): Promise<ServicePriceLabel> {
  const rate = await getRate(s.currency, currency);
  const amt = (n: number) => convert(n, rate);
  switch (s.pricingModel) {
    case "fixed": return { label: "", amount: amt(s.basePrice), prefix: "", suffix: "" };
    case "starting": return { label: "", amount: amt(s.basePrice), prefix: "From ", suffix: "" };
    case "hourly": return { label: "", amount: amt(s.basePrice), prefix: "", suffix: " / hour" };
    case "per_sqm": return { label: "", amount: amt(s.basePrice), prefix: "", suffix: " / m²" };
    case "quote": return { label: "Priced by quote", amount: null, prefix: "", suffix: "" };
    case "inspection": return { label: "Priced after inspection", amount: null, prefix: "", suffix: "" };
  }
}

export const listServiceCategories = cache(async () =>
  db.select().from(schema.serviceCategories).where(eq(schema.serviceCategories.active, true)).orderBy(asc(schema.serviceCategories.sort)),
);

export async function listServices(opts: { categorySlug?: string; q?: string; featured?: boolean; cityId?: number } = {}) {
  const where: (SQL | undefined)[] = [eq(schema.services.active, true)];
  if (opts.categorySlug) where.push(eq(schema.serviceCategories.slug, opts.categorySlug));
  if (opts.featured) where.push(eq(schema.services.featured, true));
  if (opts.q) where.push(or(ilike(schema.services.name, `%${opts.q}%`), ilike(schema.services.summary, `%${opts.q}%`)));
  if (opts.cityId) where.push(sql`exists (select 1 from service_areas sa where sa.service_id = ${schema.services.id} and sa.city_id = ${opts.cityId})`);
  return db
    .select({ s: schema.services, category: schema.serviceCategories })
    .from(schema.services)
    .innerJoin(schema.serviceCategories, eq(schema.serviceCategories.id, schema.services.categoryId))
    .where(and(...where))
    .orderBy(asc(schema.serviceCategories.sort), desc(schema.services.featured), asc(schema.services.name));
}

export async function getServiceBySlug(slug: string) {
  const [row] = await db
    .select({ s: schema.services, category: schema.serviceCategories })
    .from(schema.services)
    .innerJoin(schema.serviceCategories, eq(schema.serviceCategories.id, schema.services.categoryId))
    .where(and(eq(schema.services.slug, slug), eq(schema.services.active, true)));
  if (!row) return null;
  const areas = await db
    .select({ id: schema.cities.id, name: schema.cities.name, countryCode: schema.cities.countryCode })
    .from(schema.serviceAreas)
    .innerJoin(schema.cities, eq(schema.cities.id, schema.serviceAreas.cityId))
    .where(and(eq(schema.serviceAreas.serviceId, row.s.id), eq(schema.cities.serviceAvailable, true)))
    .orderBy(asc(schema.cities.name));
  return { ...row, areas };
}

export async function serviceCities() {
  return db
    .select({ id: schema.cities.id, name: schema.cities.name, countryCode: schema.cities.countryCode, region: schema.regions.name })
    .from(schema.cities)
    .leftJoin(schema.regions, eq(schema.regions.id, schema.cities.regionId))
    .innerJoin(schema.countries, eq(schema.countries.code, schema.cities.countryCode))
    .where(and(eq(schema.cities.serviceAvailable, true), eq(schema.cities.active, true), eq(schema.countries.servicesEnabled, true)))
    .orderBy(asc(schema.regions.name), asc(schema.cities.name));
}

/* ------------------------------------------------------------------ */
/* Gardeners                                                           */
/* ------------------------------------------------------------------ */
export type GardenerFilters = { cityId?: number; categorySlug?: string; serviceId?: string; minRating?: number; minYears?: number; maxRate?: number; verified?: boolean; type?: "company" | "independent"; q?: string; availableOn?: number; sort?: string };

/** Public directory: approved, active and public profiles only. */
export async function listGardeners(f: GardenerFilters = {}, limit = 24) {
  const where: (SQL | undefined)[] = [
    eq(schema.gardenerProfiles.status, "approved"),
    eq(schema.gardenerProfiles.isPublic, true),
    eq(schema.users.status, "active"),
  ];
  if (f.cityId) where.push(sql`(${schema.gardenerProfiles.baseCityId} = ${f.cityId} or exists (select 1 from gardener_service_areas a where a.gardener_id = ${schema.gardenerProfiles.id} and a.city_id = ${f.cityId}))`);
  if (f.serviceId) where.push(sql`exists (select 1 from gardener_services gs where gs.gardener_id = ${schema.gardenerProfiles.id} and gs.service_id = ${f.serviceId} and gs.active)`);
  if (f.categorySlug) where.push(sql`exists (select 1 from gardener_services gs join services s on s.id = gs.service_id join service_categories c on c.id = s.category_id where gs.gardener_id = ${schema.gardenerProfiles.id} and gs.active and c.slug = ${f.categorySlug})`);
  if (f.minRating) where.push(gte(schema.gardenerProfiles.ratingAvg, String(f.minRating)));
  if (f.minYears) where.push(gte(schema.gardenerProfiles.yearsExperience, f.minYears));
  if (f.maxRate) where.push(or(lte(schema.gardenerProfiles.hourlyRate, f.maxRate), eq(schema.gardenerProfiles.type, "company")));
  if (f.verified) where.push(isNotNull(schema.gardenerProfiles.verifiedAt));
  if (f.type) where.push(eq(schema.gardenerProfiles.type, f.type));
  if (f.q) where.push(or(ilike(schema.users.fullName, `%${f.q}%`), ilike(schema.gardenerProfiles.headline, `%${f.q}%`)));
  if (f.availableOn != null) where.push(sql`exists (select 1 from gardener_availability av where av.gardener_id = ${schema.gardenerProfiles.id} and av.weekday = ${f.availableOn})`);
  const order =
    f.sort === "experience" ? [desc(schema.gardenerProfiles.yearsExperience)]
    : f.sort === "price" ? [sql`${schema.gardenerProfiles.hourlyRate} asc nulls last`]
    : f.sort === "jobs" ? [desc(schema.gardenerProfiles.jobsCompleted)]
    : [desc(schema.gardenerProfiles.ratingAvg), desc(schema.gardenerProfiles.ratingCount), desc(schema.gardenerProfiles.yearsExperience)];
  const rows = await db
    .select({ g: schema.gardenerProfiles, name: schema.users.fullName, avatar: schema.users.avatarUrl, city: schema.cities.name })
    .from(schema.gardenerProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId))
    .leftJoin(schema.cities, eq(schema.cities.id, schema.gardenerProfiles.baseCityId))
    .where(and(...where))
    .orderBy(...order)
    .limit(limit);
  if (!rows.length) return [];
  const svcRows = await db
    .select({ gardenerId: schema.gardenerServices.gardenerId, name: schema.serviceCategories.name })
    .from(schema.gardenerServices)
    .innerJoin(schema.services, eq(schema.services.id, schema.gardenerServices.serviceId))
    .innerJoin(schema.serviceCategories, eq(schema.serviceCategories.id, schema.services.categoryId))
    .where(and(inArray(schema.gardenerServices.gardenerId, rows.map((r) => r.g.id)), eq(schema.gardenerServices.active, true)));
  return rows.map((r) => ({ ...r, specialties: [...new Set(svcRows.filter((s) => s.gardenerId === r.g.id).map((s) => s.name))] }));
}

export async function getGardenerBySlug(slug: string) {
  const [row] = await db
    .select({ g: schema.gardenerProfiles, name: schema.users.fullName, avatar: schema.users.avatarUrl, city: schema.cities.name, userStatus: schema.users.status })
    .from(schema.gardenerProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId))
    .leftJoin(schema.cities, eq(schema.cities.id, schema.gardenerProfiles.baseCityId))
    .where(eq(schema.gardenerProfiles.slug, slug));
  if (!row || row.g.status !== "approved" || !row.g.isPublic || row.userStatus !== "active") return null;
  const [services, areas, portfolio, availability, reviews] = await Promise.all([
    db
      .select({ s: schema.services, customPrice: schema.gardenerServices.customPrice, category: schema.serviceCategories.name })
      .from(schema.gardenerServices)
      .innerJoin(schema.services, eq(schema.services.id, schema.gardenerServices.serviceId))
      .innerJoin(schema.serviceCategories, eq(schema.serviceCategories.id, schema.services.categoryId))
      .where(and(eq(schema.gardenerServices.gardenerId, row.g.id), eq(schema.gardenerServices.active, true), eq(schema.services.active, true))),
    db
      .select({ name: schema.cities.name })
      .from(schema.gardenerServiceAreas)
      .innerJoin(schema.cities, eq(schema.cities.id, schema.gardenerServiceAreas.cityId))
      .where(eq(schema.gardenerServiceAreas.gardenerId, row.g.id)),
    db.select().from(schema.gardenerPortfolio).where(eq(schema.gardenerPortfolio.gardenerId, row.g.id)).orderBy(asc(schema.gardenerPortfolio.sort)),
    db.select().from(schema.gardenerAvailability).where(eq(schema.gardenerAvailability.gardenerId, row.g.id)).orderBy(asc(schema.gardenerAvailability.weekday)),
    db
      .select({ r: schema.reviews, author: schema.users.fullName })
      .from(schema.reviews)
      .innerJoin(schema.users, eq(schema.users.id, schema.reviews.authorId))
      .where(and(eq(schema.reviews.gardenerId, row.g.id), eq(schema.reviews.status, "published")))
      .orderBy(desc(schema.reviews.createdAt))
      .limit(20),
  ]);
  return { ...row, services, areas: [row.city, ...areas.map((a) => a.name)].filter((x, i, arr): x is string => !!x && arr.indexOf(x) === i), portfolio, availability, reviews };
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */
export type ProductFilters = { categorySlug?: string; brand?: string; q?: string; min?: number; max?: number; inStock?: boolean; onSale?: boolean; sort?: string; page?: number; featured?: boolean };

export async function listProducts(f: ProductFilters, currency: string, pageSize = 12) {
  const where: (SQL | undefined)[] = [eq(schema.products.active, true)];
  if (f.categorySlug) where.push(eq(schema.productCategories.slug, f.categorySlug));
  if (f.brand) where.push(eq(schema.brands.slug, f.brand));
  if (f.featured) where.push(eq(schema.products.featured, true));
  if (f.onSale) where.push(isNotNull(schema.products.salePrice));
  if (f.q) where.push(or(ilike(schema.products.name, `%${f.q}%`), ilike(schema.products.summary, `%${f.q}%`), ilike(schema.products.sku, `%${f.q}%`)));
  // price filters are entered in the display currency; convert to the catalogue base (GHS)
  const toBase = await getRate(currency, "GHS");
  const eff = sql`coalesce(${schema.products.salePrice}, ${schema.products.price})`;
  if (f.min != null) where.push(sql`${eff} >= ${convert(f.min, toBase)}`);
  if (f.max != null) where.push(sql`${eff} <= ${convert(f.max, toBase)}`);
  const stockExpr = sql<number>`(select coalesce(sum(i.on_hand),0) from inventory i join product_variants pv on pv.id = i.variant_id where pv.product_id = ${schema.products.id} and pv.active)`;
  if (f.inStock) where.push(sql`${stockExpr} > 0`);
  const order =
    f.sort === "price_asc" ? [asc(eff)]
    : f.sort === "price_desc" ? [desc(eff)]
    : f.sort === "newest" ? [desc(schema.products.createdAt)]
    : f.sort === "rating" ? [desc(schema.products.ratingAvg)]
    : [desc(schema.products.featured), asc(schema.products.name)];
  const page = Math.max(1, f.page ?? 1);
  const base = db
    .select({ p: schema.products, category: schema.productCategories, brand: schema.brands.name, stock: stockExpr.mapWith(Number) })
    .from(schema.products)
    .innerJoin(schema.productCategories, eq(schema.productCategories.id, schema.products.categoryId))
    .leftJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
    .where(and(...where));
  const [rows, [count]] = await Promise.all([
    base.orderBy(...order).limit(pageSize).offset((page - 1) * pageSize),
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.products)
      .innerJoin(schema.productCategories, eq(schema.productCategories.id, schema.products.categoryId))
      .leftJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
      .where(and(...where)),
  ]);
  const rate = await getRate("GHS", currency);
  const items = await Promise.all(
    rows.map(async (r) => {
      const rr = r.p.currency === "GHS" ? rate : await getRate(r.p.currency, currency);
      return { ...r, price: convert(r.p.price, rr), salePrice: r.p.salePrice != null ? convert(r.p.salePrice, rr) : null };
    }),
  );
  return { items, total: count?.n ?? 0, page, pageCount: Math.ceil((count?.n ?? 0) / pageSize) };
}

export async function getProductBySlug(slug: string, currency: string) {
  const [row] = await db
    .select({ p: schema.products, category: schema.productCategories, brand: schema.brands.name, vendor: schema.vendors })
    .from(schema.products)
    .innerJoin(schema.productCategories, eq(schema.productCategories.id, schema.products.categoryId))
    .innerJoin(schema.vendors, eq(schema.vendors.id, schema.products.vendorId))
    .leftJoin(schema.brands, eq(schema.brands.id, schema.products.brandId))
    .where(and(eq(schema.products.slug, slug), eq(schema.products.active, true)));
  if (!row) return null;
  const variants = await db.select().from(schema.productVariants).where(and(eq(schema.productVariants.productId, row.p.id), eq(schema.productVariants.active, true))).orderBy(desc(schema.productVariants.isDefault), asc(schema.productVariants.name));
  const stock = await stockFor(variants.map((v) => v.id));
  const rate = await getRate(row.p.currency, currency);
  const vs = variants.map((v) => {
    const pr = unitPrice(row.p, v);
    return { ...v, stock: stock.get(v.id) ?? 0, price: convert(pr.regular, rate), salePrice: pr.sale != null ? convert(pr.sale, rate) : null };
  });
  const reviews = await db
    .select({ r: schema.reviews, author: schema.users.fullName })
    .from(schema.reviews)
    .innerJoin(schema.users, eq(schema.users.id, schema.reviews.authorId))
    .where(and(eq(schema.reviews.productId, row.p.id), eq(schema.reviews.status, "published")))
    .orderBy(desc(schema.reviews.createdAt))
    .limit(20);
  const related = await db
    .select({ p: schema.products })
    .from(schema.products)
    .where(and(eq(schema.products.categoryId, row.p.categoryId), eq(schema.products.active, true), sql`${schema.products.id} <> ${row.p.id}`))
    .limit(4);
  return {
    ...row,
    variants: vs,
    reviews,
    related: related.map((r) => ({ ...r.p, price: convert(r.p.price, rate), salePrice: r.p.salePrice != null ? convert(r.p.salePrice, rate) : null })),
  };
}

export async function listBrands() {
  return db.select().from(schema.brands).orderBy(asc(schema.brands.name));
}

/* ------------------------------------------------------------------ */
/* Activities                                                          */
/* ------------------------------------------------------------------ */
export async function listActivities(opts: { type?: string; featured?: boolean; limit?: number } = {}) {
  const now = new Date();
  const acts = await db
    .select({ a: schema.activities, city: schema.cities.name })
    .from(schema.activities)
    .leftJoin(schema.cities, eq(schema.cities.id, schema.activities.cityId))
    .where(and(eq(schema.activities.active, true), opts.type ? eq(schema.activities.type, opts.type) : undefined, opts.featured ? eq(schema.activities.featured, true) : undefined));
  if (!acts.length) return [];
  const sessions = await db
    .select()
    .from(schema.activitySessions)
    .where(and(inArray(schema.activitySessions.activityId, acts.map((a) => a.a.id)), gte(schema.activitySessions.startsAt, now), eq(schema.activitySessions.status, "scheduled")))
    .orderBy(asc(schema.activitySessions.startsAt));
  return acts
    .map((a) => ({ ...a, sessions: sessions.filter((s) => s.activityId === a.a.id) }))
    .filter((a) => a.sessions.length)
    .sort((x, y) => x.sessions[0]!.startsAt.getTime() - y.sessions[0]!.startsAt.getTime())
    .slice(0, opts.limit ?? 100);
}

export async function getActivityBySlug(slug: string) {
  const [row] = await db
    .select({ a: schema.activities, city: schema.cities.name })
    .from(schema.activities)
    .leftJoin(schema.cities, eq(schema.cities.id, schema.activities.cityId))
    .where(and(eq(schema.activities.slug, slug), eq(schema.activities.active, true)));
  if (!row) return null;
  const sessions = await db
    .select()
    .from(schema.activitySessions)
    .where(and(eq(schema.activitySessions.activityId, row.a.id), gte(schema.activitySessions.startsAt, new Date()), eq(schema.activitySessions.status, "scheduled")))
    .orderBy(asc(schema.activitySessions.startsAt));
  return { ...row, sessions };
}

/* ------------------------------------------------------------------ */
/* Home page & trust                                                   */
/* ------------------------------------------------------------------ */
/** Trust figures computed from real data only. */
export const trustStats = cache(async () => {
  const [g] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.gardenerProfiles)
    .where(and(eq(schema.gardenerProfiles.status, "approved"), isNotNull(schema.gardenerProfiles.verifiedAt)));
  const [c] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.cities).where(eq(schema.cities.serviceAvailable, true));
  const [j] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.bookings).where(eq(schema.bookings.status, "completed"));
  const [r] = await db
    .select({ avg: sql<number>`coalesce(avg(${schema.reviews.rating}),0)`.mapWith(Number), n: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.reviews)
    .where(and(eq(schema.reviews.subjectType, "gardener"), eq(schema.reviews.status, "published")));
  return { verifiedGardeners: g?.n ?? 0, cities: c?.n ?? 0, jobsCompleted: j?.n ?? 0, reviewAvg: r?.avg ?? 0, reviewCount: r?.n ?? 0 };
});

export async function homeContent() {
  const [testimonials, projects] = await Promise.all([
    db.select().from(schema.testimonials).where(eq(schema.testimonials.active, true)).orderBy(asc(schema.testimonials.sort)),
    db
      .select({ p: schema.gardenProjects, category: schema.serviceCategories.name })
      .from(schema.gardenProjects)
      .leftJoin(schema.serviceCategories, eq(schema.serviceCategories.id, schema.gardenProjects.serviceCategoryId))
      .where(eq(schema.gardenProjects.featured, true))
      .orderBy(asc(schema.gardenProjects.sort)),
  ]);
  return { testimonials, projects };
}

export async function faqs() {
  return db.select().from(schema.faqs).where(eq(schema.faqs.active, true)).orderBy(asc(schema.faqs.sort));
}
