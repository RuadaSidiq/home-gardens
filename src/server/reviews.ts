import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { UserError } from "./errors";
import { notify } from "./notify";

async function recomputeGardener(gardenerId: string) {
  await db.execute(sql`update gardener_profiles g set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from reviews r where r.gardener_id = g.id and r.status = 'published'), 0),
    rating_count = (select count(*) from reviews r where r.gardener_id = g.id and r.status = 'published')
    where g.id = ${gardenerId}`);
}
async function recomputeProduct(productId: string) {
  await db.execute(sql`update products p set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from reviews r where r.product_id = p.id and r.status = 'published'), 0),
    rating_count = (select count(*) from reviews r where r.product_id = p.id and r.status = 'published')
    where p.id = ${productId}`);
}

export async function reviewGardener(opts: { userId: string; bookingId: string; rating: number; title?: string; body: string }) {
  const [b] = await db.select().from(schema.bookings).where(and(eq(schema.bookings.id, opts.bookingId), eq(schema.bookings.customerId, opts.userId)));
  if (!b || b.status !== "completed" || !b.gardenerId) throw new UserError("You can review a gardener after the booking is completed.");
  const exists = await db.select({ id: schema.reviews.id }).from(schema.reviews).where(and(eq(schema.reviews.authorId, opts.userId), eq(schema.reviews.bookingId, b.id)));
  if (exists.length) throw new UserError("You've already reviewed this booking.");
  await db.insert(schema.reviews).values({ authorId: opts.userId, subjectType: "gardener", gardenerId: b.gardenerId, bookingId: b.id, rating: opts.rating, title: opts.title || null, body: opts.body });
  await recomputeGardener(b.gardenerId);
  const [g] = await db.select({ userId: schema.gardenerProfiles.userId }).from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, b.gardenerId));
  const [u] = await db.select({ name: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, opts.userId));
  if (g) await notify(g.userId, "new_review", { rating: opts.rating, author: u?.name.split(" ")[0] }, "/gardener/reviews");
}

export async function reviewProduct(opts: { userId: string; orderId: string; productId: string; rating: number; title?: string; body: string }) {
  const [o] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, opts.orderId), eq(schema.orders.userId, opts.userId)));
  if (!o || !["delivered", "partially_refunded"].includes(o.status)) throw new UserError("You can review products once your order is delivered.");
  const [item] = await db.select().from(schema.orderItems).where(and(eq(schema.orderItems.orderId, o.id), eq(schema.orderItems.productId, opts.productId)));
  if (!item) throw new UserError("This product isn't in the order.");
  const exists = await db.select({ id: schema.reviews.id }).from(schema.reviews).where(and(eq(schema.reviews.authorId, opts.userId), eq(schema.reviews.productId, opts.productId)));
  if (exists.length) throw new UserError("You've already reviewed this product.");
  await db.insert(schema.reviews).values({ authorId: opts.userId, subjectType: "product", productId: opts.productId, orderId: o.id, rating: opts.rating, title: opts.title || null, body: opts.body });
  await recomputeProduct(opts.productId);
}

export async function moderateReview(reviewId: string, status: "published" | "hidden", response?: string | null) {
  const [r] = await db.update(schema.reviews).set({ status, ...(response !== undefined ? { response } : {}) }).where(eq(schema.reviews.id, reviewId)).returning();
  if (!r) throw new UserError("Review not found.");
  if (r.gardenerId) await recomputeGardener(r.gardenerId);
  if (r.productId) await recomputeProduct(r.productId);
}
