"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { requireUser, hashToken, SESSION_COOKIE } from "@/server/auth/session";
import { UserError } from "@/server/errors";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { generateTotpSecret, verifyTotp } from "@/server/auth/totp";
import { initiatePayment } from "@/server/payments/service";
import { cancelBooking, confirmCompletion, raiseDispute, rescheduleBooking, respondToQuote } from "@/server/bookings/engine";
import { cancelOrder, requestReturn } from "@/server/commerce/orders";
import { cancelRegistration } from "@/server/activities";
import { reviewGardener, reviewProduct } from "@/server/reviews";
import { createTicket } from "@/server/support";
import { bookingConversation, sendMessage } from "@/server/messaging";
import { markRead } from "@/server/notify";
import { storeImages } from "@/server/storage";
import { audit } from "@/server/audit";

/* ---------------- Payments ---------------- */
export async function payNow(_: Prev, fd: FormData) {
  return run(fd, z.object({ purpose: z.enum(["booking", "order", "activity"]), subjectId: f.uuid(), provider: f.req("Payment method", 20), kind: z.enum(["deposit", "full", "balance"]).optional() }), async (i) => {
    const u = await requireUser();
    const { url } = await initiatePayment({ purpose: i.purpose, subjectId: i.subjectId, userId: u.id, email: u.email, provider: i.provider, kind: i.kind === "deposit" ? "deposit" : "full" });
    redirect(url);
  });
}

/* ---------------- Bookings ---------------- */
export async function quoteResponse(_: Prev, fd: FormData) {
  return run(fd, z.object({ quoteId: f.uuid(), accept: z.enum(["1", "0"]) }), async (i) => {
    const u = await requireUser();
    await respondToQuote({ quoteId: i.quoteId, customerId: u.id, accept: i.accept === "1" });
    return { ok: true, message: i.accept === "1" ? "Quote accepted." : "Quote declined. We'll be in touch." };
  });
}

export async function cancelMyBooking(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), reason: f.req("Reason", 500) }), async (i) => {
    const u = await requireUser();
    const { refund, booking } = await cancelBooking({ bookingId: i.bookingId, actorId: u.id, reason: i.reason, byCustomer: true });
    return { ok: true, message: refund > 0 ? `Booking cancelled. A refund of ${(refund / 100).toFixed(2)} ${booking.currency} is on its way.` : "Booking cancelled." };
  });
}

export async function rescheduleMyBooking(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"), time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a time") }), async (i) => {
    const u = await requireUser();
    await rescheduleBooking({ bookingId: i.bookingId, actorId: u.id, date: i.date, time: i.time, byCustomer: true });
    return { ok: true, message: "Booking rescheduled." };
  });
}

export async function confirmMyBooking(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid() }), async (i) => {
    const u = await requireUser();
    await confirmCompletion(i.bookingId, { userId: u.id, customerId: u.id });
    return { ok: true, message: "Thanks for confirming. Please leave a review for your gardener." };
  });
}

export async function disputeMyBooking(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), reason: f.req("Description", 2000).refine((s) => s.length >= 15, "Please describe the problem") }), async (i) => {
    const u = await requireUser();
    const { ticket } = await raiseDispute({ bookingId: i.bookingId, customerId: u.id, reason: i.reason });
    redirect(`/account/support/${ticket.id}`);
  });
}

export async function reviewMyGardener(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), rating: f.int(1, 5), title: f.text(120).optional(), body: f.req("Review", 2000) }), async (i) => {
    const u = await requireUser();
    await reviewGardener({ userId: u.id, bookingId: i.bookingId, rating: i.rating, title: i.title, body: i.body });
    return { ok: true, message: "Thanks for your review." };
  });
}

export async function messageGardener(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid() }), async (i) => {
    const u = await requireUser();
    const c = await bookingConversation(i.bookingId, u);
    redirect(`${u.gardenerId ? "/gardener" : "/account"}/messages/${c.id}`);
  });
}

/* ---------------- Orders ---------------- */
export async function cancelMyOrder(_: Prev, fd: FormData) {
  return run(fd, z.object({ orderId: f.uuid(), reason: f.text(500).optional() }), async (i) => {
    const u = await requireUser();
    await cancelOrder({ orderId: i.orderId, actorId: u.id, reason: i.reason || "Cancelled by customer", byCustomer: true });
    return { ok: true, message: "Order cancelled." };
  });
}

export async function requestMyReturn(_: Prev, fd: FormData) {
  return run(fd, z.object({ orderId: f.uuid(), reason: f.req("Reason", 1000) }), async (i) => {
    const u = await requireUser();
    const items: { orderItemId: string; quantity: number }[] = [];
    for (const [k, v] of fd.entries()) if (k.startsWith("qty_") && Number(v) > 0) items.push({ orderItemId: k.slice(4), quantity: Number(v) });
    await requestReturn({ orderId: i.orderId, userId: u.id, items, reason: i.reason });
    return { ok: true, message: "Return requested. We'll contact you to arrange collection." };
  });
}

export async function reviewMyProduct(_: Prev, fd: FormData) {
  return run(fd, z.object({ orderId: f.uuid(), productId: f.uuid(), rating: f.int(1, 5), title: f.text(120).optional(), body: f.req("Review", 2000) }), async (i) => {
    const u = await requireUser();
    await reviewProduct({ userId: u.id, ...i });
    return { ok: true, message: "Thanks for your review." };
  });
}

/* ---------------- Activities ---------------- */
export async function cancelMyRegistration(_: Prev, fd: FormData) {
  return run(fd, z.object({ registrationId: f.uuid() }), async (i) => {
    const u = await requireUser();
    await cancelRegistration({ registrationId: i.registrationId, actorId: u.id, byCustomer: true });
    return { ok: true, message: "Registration cancelled." };
  });
}

/* ---------------- Wishlist & saved ---------------- */
export async function removeWishlist(_: Prev, fd: FormData) {
  return run(fd, z.object({ productId: f.uuid() }), async (i) => {
    const u = await requireUser();
    await db.delete(schema.wishlistItems).where(and(eq(schema.wishlistItems.userId, u.id), eq(schema.wishlistItems.productId, i.productId)));
  });
}
export async function removeSavedGardener(_: Prev, fd: FormData) {
  return run(fd, z.object({ gardenerId: f.uuid() }), async (i) => {
    const u = await requireUser();
    await db.delete(schema.savedGardeners).where(and(eq(schema.savedGardeners.userId, u.id), eq(schema.savedGardeners.gardenerId, i.gardenerId)));
  });
}

/* ---------------- Addresses ---------------- */
const addressSchema = z.object({
  id: f.optUuid(),
  label: f.req("Label", 40),
  recipient: f.req("Recipient", 120),
  phone: f.phone(),
  line1: f.req("Street address", 200),
  line2: f.text(200).optional(),
  cityId: f.int(1),
  digitalAddress: f.text(30).optional(),
  postalCode: f.text(20).optional(),
  isDefault: f.bool().optional(),
});
export async function saveAddress(_: Prev, fd: FormData) {
  return run(fd, addressSchema, async (i) => {
    const u = await requireUser();
    const [city] = await db.select({ c: schema.cities, region: schema.regions.name }).from(schema.cities).leftJoin(schema.regions, eq(schema.regions.id, schema.cities.regionId)).where(eq(schema.cities.id, i.cityId));
    if (!city) throw new UserError("Choose a city.", "cityId");
    const [country] = await db.select().from(schema.countries).where(eq(schema.countries.code, city.c.countryCode));
    if (country?.addressFormat.postalCodeRequired && !i.postalCode) throw new UserError(`${country.addressFormat.postalLabel ?? "Postal code"} is required.`, "postalCode");
    const values = { label: i.label, recipient: i.recipient, phone: i.phone, line1: i.line1, line2: i.line2 || null, city: city.c.name, cityId: city.c.id, region: city.region, countryCode: city.c.countryCode, digitalAddress: i.digitalAddress || null, postalCode: i.postalCode || null, isDefault: !!i.isDefault };
    await db.transaction(async (tx) => {
      if (i.isDefault) await tx.update(schema.addresses).set({ isDefault: false }).where(eq(schema.addresses.userId, u.id));
      if (i.id) {
        const [r] = await tx.update(schema.addresses).set(values).where(and(eq(schema.addresses.id, i.id), eq(schema.addresses.userId, u.id))).returning();
        if (!r) throw new UserError("Address not found.");
      } else await tx.insert(schema.addresses).values({ ...values, userId: u.id });
    });
    return { ok: true, message: "Address saved." };
  });
}
export async function deleteAddress(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.uuid() }), async (i) => {
    const u = await requireUser();
    await db.delete(schema.addresses).where(and(eq(schema.addresses.id, i.id), eq(schema.addresses.userId, u.id)));
  });
}

/* ---------------- Notifications ---------------- */
export async function markAllRead(_: Prev, fd: FormData) {
  return run(fd, z.object({}), async () => {
    const u = await requireUser();
    await markRead(u.id);
  });
}

/* ---------------- Support & messages ---------------- */
export async function openTicket(_: Prev, fd: FormData) {
  return run(
    fd,
    z.object({ category: z.enum(["general", "booking", "order", "payment", "account", "gardener"]), subject: f.req("Subject", 150), body: f.req("Message", 4000), bookingId: f.optUuid(), orderId: f.optUuid() }),
    async (i) => {
      const u = await requireUser();
      const t = await createTicket({ userId: u.id, category: i.category, subject: i.subject, body: i.body, bookingId: i.bookingId, orderId: i.orderId });
      redirect(`${u.gardenerId ? "/gardener" : "/account"}/support/${t.id}`);
    },
  );
}

export async function postMessage(_: Prev, fd: FormData) {
  return run(fd, z.object({ conversationId: f.uuid(), body: f.req("Message", 4000) }), async (i) => {
    const u = await requireUser();
    const files = await storeImages(fd.getAll("attachments") as File[], "message-attachments", u.id, 3);
    await sendMessage({ conversationId: i.conversationId, user: u, body: i.body, attachments: files.map((url) => ({ url, name: "Photo", mime: "image" })) });
  });
}

/* ---------------- Settings ---------------- */
export async function updateProfile(_: Prev, fd: FormData) {
  return run(fd, z.object({ fullName: f.req("Name", 120), phone: f.phone(), countryCode: z.string().length(2), preferredCurrency: z.enum(["GHS", "USD", "GBP", "EUR", "NGN"]) }), async (i) => {
    const u = await requireUser();
    const avatar = await storeImages([fd.get("avatar") as File].filter(Boolean), "avatars", u.id, 1);
    await db.update(schema.users).set({ fullName: i.fullName, phone: i.phone, countryCode: i.countryCode, preferredCurrency: i.preferredCurrency, ...(avatar[0] ? { avatarUrl: avatar[0] } : {}), updatedAt: new Date() }).where(eq(schema.users.id, u.id));
    return { ok: true, message: "Profile updated." };
  });
}

export async function updatePrefs(_: Prev, fd: FormData) {
  return run(fd, z.object({ email: f.bool(), sms: f.bool(), whatsapp: f.bool(), marketing: f.bool() }), async (i) => {
    const u = await requireUser();
    await db.update(schema.users).set({ notificationPrefs: i }).where(eq(schema.users.id, u.id));
    return { ok: true, message: "Preferences saved." };
  });
}

export async function changePassword(_: Prev, fd: FormData) {
  return run(fd, z.object({ current: z.string().min(1, "Enter your current password").max(200), password: z.string().max(200), confirm: z.string().max(200) }), async (i) => {
    const u = await requireUser();
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    if (!(await verifyPassword(i.current, row!.passwordHash))) throw new UserError("Current password is incorrect.", "current");
    const p = passwordProblem(i.password);
    if (p) throw new UserError(p, "password");
    if (i.password !== i.confirm) throw new UserError("Passwords do not match.", "confirm");
    await db.update(schema.users).set({ passwordHash: await hashPassword(i.password) }).where(eq(schema.users.id, u.id));
    await audit({ actorId: u.id, action: "auth.password_change", entityType: "user", entityId: u.id });
    return { ok: true, message: "Password changed." };
  });
}

export async function beginMfa(_: Prev, fd: FormData) {
  return run(fd, z.object({}), async () => {
    const u = await requireUser();
    if (u.mfaEnabled) throw new UserError("Two-step verification is already on.");
    await db.update(schema.users).set({ mfaSecret: generateTotpSecret() }).where(eq(schema.users.id, u.id));
  });
}

export async function enableMfa(_: Prev, fd: FormData) {
  return run(fd, z.object({ code: z.string().trim().min(6).max(8) }), async (i) => {
    const u = await requireUser();
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    if (!row?.mfaSecret || !verifyTotp(row.mfaSecret, i.code)) throw new UserError("That code is not valid. Check the time on your phone and try again.", "code");
    await db.update(schema.users).set({ mfaEnabled: true }).where(eq(schema.users.id, u.id));
    await audit({ actorId: u.id, action: "auth.mfa_enabled", entityType: "user", entityId: u.id });
    return { ok: true, message: "Two-step verification is on." };
  });
}

export async function disableMfa(_: Prev, fd: FormData) {
  return run(fd, z.object({ code: z.string().trim().min(6).max(8) }), async (i) => {
    const u = await requireUser();
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
    if (!row?.mfaSecret || !verifyTotp(row.mfaSecret, i.code)) throw new UserError("That code is not valid.", "code");
    await db.update(schema.users).set({ mfaEnabled: false, mfaSecret: null }).where(eq(schema.users.id, u.id));
    await audit({ actorId: u.id, action: "auth.mfa_disabled", entityType: "user", entityId: u.id });
    return { ok: true, message: "Two-step verification is off." };
  });
}

export async function signOutOtherSessions(_: Prev, fd: FormData) {
  return run(fd, z.object({}), async () => {
    const u = await requireUser();
    const raw = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, u.id), ne(schema.sessions.id, hashToken(raw))));
    return { ok: true, message: "Signed out of all other devices." };
  });
}

