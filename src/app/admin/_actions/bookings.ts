"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { getCurrentUser, assertPermission } from "@/server/auth/session";
import { UserError } from "@/server/errors";
import { assignGardener, autoAssign, cancelBooking, createBooking, issueQuote, rescheduleBooking, resolveDispute, confirmCompletion } from "@/server/bookings/engine";
import { getSettings } from "@/server/settings";
import { audit } from "@/server/audit";
import { toMinor } from "@/lib/money";

async function staff(p: "bookings.manage" | "bookings.view" = "bookings.manage") {
  const u = await getCurrentUser();
  assertPermission(u, p);
  return u;
}

export async function adminAssign(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), gardenerId: f.uuid() }), async (i) => {
    const u = await staff();
    await assignGardener(i.bookingId, i.gardenerId, u.id);
    return { ok: true, message: "Gardener assigned." };
  });
}

export async function adminAutoAssign(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid() }), async (i) => {
    const u = await staff();
    const r = await autoAssign(i.bookingId, u.id, { ...(await getSettings()), booking: { ...(await getSettings()).booking, autoAssign: true } });
    if (!r) throw new UserError("No eligible gardener is available for this time. Reschedule or assign manually.");
    await audit({ actorId: u.id, action: "booking.auto_assign", entityType: "booking", entityId: i.bookingId });
    return { ok: true, message: "Assigned to the best available gardener." };
  });
}

export async function adminQuote(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), amount: f.amount().refine((n) => n > 0, "Enter an amount"), hours: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().min(0.5).max(200).optional()), note: f.text(2000).optional(), validDays: f.int(1, 60) }), async (i) => {
    const u = await staff();
    const [b] = await db.select({ currency: schema.bookings.currency }).from(schema.bookings).where(eq(schema.bookings.id, i.bookingId));
    if (!b) throw new UserError("Booking not found.");
    await issueQuote({ bookingId: i.bookingId, actorId: u.id, amount: toMinor(i.amount, b.currency), estimatedHours: i.hours ?? null, note: i.note || null, validDays: i.validDays });
    await audit({ actorId: u.id, action: "booking.quote", entityType: "booking", entityId: i.bookingId, meta: { amount: i.amount } });
    return { ok: true, message: "Quote sent to the customer." };
  });
}

export async function adminCancel(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), reason: f.req("Reason", 500), refund: f.optAmount() }), async (i) => {
    const u = await staff();
    const [b] = await db.select({ currency: schema.bookings.currency }).from(schema.bookings).where(eq(schema.bookings.id, i.bookingId));
    const { refund } = await cancelBooking({ bookingId: i.bookingId, actorId: u.id, reason: i.reason, byCustomer: false, refundOverride: i.refund != null ? toMinor(i.refund, b!.currency) : undefined });
    await audit({ actorId: u.id, action: "booking.cancel", entityType: "booking", entityId: i.bookingId, meta: { reason: i.reason, refund } });
    return { ok: true, message: `Booking cancelled${refund ? `; ${refund / 100} ${b!.currency} refunded` : ""}.` };
  });
}

export async function adminReschedule(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) }), async (i) => {
    const u = await staff();
    await rescheduleBooking({ bookingId: i.bookingId, actorId: u.id, date: i.date, time: i.time, byCustomer: false });
    await audit({ actorId: u.id, action: "booking.reschedule", entityType: "booking", entityId: i.bookingId, meta: i });
    return { ok: true, message: "Booking rescheduled." };
  });
}

export async function adminResolveDispute(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), outcome: z.enum(["release", "refund"]), refund: f.optAmount(), note: f.req("Resolution note", 1000) }), async (i) => {
    const u = await staff();
    const [b] = await db.select({ currency: schema.bookings.currency }).from(schema.bookings).where(eq(schema.bookings.id, i.bookingId));
    await resolveDispute({ bookingId: i.bookingId, actorId: u.id, outcome: i.outcome, refundAmount: i.refund != null ? toMinor(i.refund, b!.currency) : undefined, note: i.note });
    await db.update(schema.supportTickets).set({ status: "resolved", resolution: i.note, updatedAt: new Date() }).where(sql`${schema.supportTickets.bookingId} = ${i.bookingId} and ${schema.supportTickets.category} = 'dispute' and ${schema.supportTickets.status} <> 'closed'`);
    return { ok: true, message: "Dispute resolved." };
  });
}

export async function adminComplete(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid() }), async (i) => {
    const u = await staff();
    await confirmCompletion(i.bookingId, { userId: u.id });
    await audit({ actorId: u.id, action: "booking.complete_by_staff", entityType: "booking", entityId: i.bookingId });
    return { ok: true, message: "Booking marked completed." };
  });
}

export async function adminNote(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), internalNotes: f.text(4000) }), async (i) => {
    const u = await staff("bookings.view");
    await db.update(schema.bookings).set({ internalNotes: i.internalNotes || null, updatedAt: new Date() }).where(eq(schema.bookings.id, i.bookingId));
    await audit({ actorId: u.id, action: "booking.note", entityType: "booking", entityId: i.bookingId });
    return { ok: true, message: "Note saved." };
  });
}

export async function adminCreateBooking(_: Prev, fd: FormData) {
  return run(
    fd,
    z.object({ customerEmail: f.email(), serviceId: f.uuid(), cityId: f.int(1), line1: f.req("Address", 200), contactPhone: f.phone(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/), gardenSizeSqm: f.optInt(1), hours: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().min(1).max(12).optional()), details: f.req("Details", 3000) }),
    async (i) => {
      const u = await staff();
      const [c] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${i.customerEmail}`);
      if (!c) throw new UserError("No customer with that email. Ask them to register first, or create their account in Users.", "customerEmail");
      const [city] = await db.select().from(schema.cities).where(eq(schema.cities.id, i.cityId));
      const b = await createBooking({ customerId: c.id, serviceId: i.serviceId, countryCode: city!.countryCode, cityId: i.cityId, address: { line1: i.line1 }, contactPhone: i.contactPhone, date: i.date, time: i.time, gardenSizeSqm: i.gardenSizeSqm ?? null, hours: i.hours ?? null, details: i.details, createdBy: u.id });
      redirect(`/admin/bookings/${b.id}`);
    },
  );
}
