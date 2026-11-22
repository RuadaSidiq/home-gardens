"use server";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { rateLimit } from "@/server/rate-limit";
import { UserError } from "@/server/errors";
import { CURRENCY_COOKIE } from "@/server/site";
import { getCurrentUser, clientIp } from "@/server/auth/session";
import { setCartQuantity } from "@/server/commerce/cart";
import { cartOwnerForWrite } from "@/server/cart-owner";
import { notifyStaff } from "@/server/notify";

export async function setCurrency(_: Prev, fd: FormData) {
  return run(fd, z.object({ currency: z.enum(["GHS", "USD", "GBP", "EUR", "NGN"]) }), async ({ currency }) => {
    (await cookies()).set(CURRENCY_COOKIE, currency, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
    const u = await getCurrentUser();
    if (u) await db.update(schema.users).set({ preferredCurrency: currency }).where(eq(schema.users.id, u.id));
  });
}

export async function subscribeNewsletter(_: Prev, fd: FormData) {
  return run(fd, z.object({ email: f.email() }), async ({ email }) => {
    const ip = clientIp(await headers());
    if (!(await rateLimit(`newsletter:${ip}`, 5, 3600))) throw new UserError("Too many attempts. Please try again later.");
    await db.insert(schema.newsletterSubscribers).values({ email }).onConflictDoUpdate({ target: schema.newsletterSubscribers.email, set: { unsubscribedAt: null } });
    return { ok: true, message: "Thanks – you're on the list. Expect one useful email a month." };
  });
}

export async function addToCart(_: Prev, fd: FormData) {
  return run(fd, z.object({ variantId: f.uuid(), quantity: f.int(1, 99) }), async ({ variantId, quantity }) => {
    await setCartQuantity(await cartOwnerForWrite(), variantId, quantity, "add");
    return { ok: true, message: "Added to your cart." };
  });
}

export async function updateCartItem(_: Prev, fd: FormData) {
  return run(fd, z.object({ variantId: f.uuid(), quantity: f.int(0, 99) }), async ({ variantId, quantity }) => {
    await setCartQuantity(await cartOwnerForWrite(), variantId, quantity, "set");
  });
}

const contactSchema = z.object({
  name: f.req("Name", 120),
  email: f.email(),
  phone: f.text(30).optional(),
  topic: f.req("Topic", 60),
  message: f.req("Message", 4000).refine((m) => m.length >= 10, "Please add a little more detail"),
});

export async function sendContact(_: Prev, fd: FormData) {
  return run(fd, contactSchema, async (i) => {
    const ip = clientIp(await headers());
    if (!(await rateLimit(`contact:${ip}`, 5, 3600))) throw new UserError("Too many messages. Please try again later.");
    await db.insert(schema.contactEnquiries).values({ name: i.name, email: i.email, phone: i.phone || null, topic: i.topic, message: i.message });
    await notifyStaff("support.manage", `New enquiry: ${i.topic}`, `${i.name} (${i.email})`, "/admin/support?tab=enquiries");
    return { ok: true, message: "Thanks, we've received your message and will reply within one working day." };
  });
}
