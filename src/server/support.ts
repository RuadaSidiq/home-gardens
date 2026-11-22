import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { reference } from "@/lib/ids";
import { UserError } from "./errors";
import { notifyStaff } from "./notify";

type Category = (typeof schema.ticketCategory.enumValues)[number];

export async function createTicket(opts: { userId: string; category: Category; subject: string; body: string; bookingId?: string | null; orderId?: string | null }) {
  if (opts.bookingId) {
    const [b] = await db.select({ id: schema.bookings.id }).from(schema.bookings).where(and(eq(schema.bookings.id, opts.bookingId), eq(schema.bookings.customerId, opts.userId)));
    const [g] = b ? [b] : await db.select({ id: schema.bookings.id }).from(schema.bookings).innerJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.bookings.gardenerId)).where(and(eq(schema.bookings.id, opts.bookingId), eq(schema.gardenerProfiles.userId, opts.userId)));
    if (!g) throw new UserError("Booking not found.");
  }
  if (opts.orderId) {
    const [o] = await db.select({ id: schema.orders.id }).from(schema.orders).where(and(eq(schema.orders.id, opts.orderId), eq(schema.orders.userId, opts.userId)));
    if (!o) throw new UserError("Order not found.");
  }
  const t = await db.transaction(async (tx) => {
    const [c] = await tx.insert(schema.conversations).values({ type: "support", subject: opts.subject, bookingId: opts.bookingId ?? null, createdBy: opts.userId }).returning();
    await tx.insert(schema.conversationParticipants).values({ conversationId: c!.id, userId: opts.userId, lastReadAt: new Date() });
    await tx.insert(schema.messages).values({ conversationId: c!.id, senderId: opts.userId, body: opts.body });
    const [t] = await tx
      .insert(schema.supportTickets)
      .values({ reference: reference("TK"), userId: opts.userId, category: opts.category, subject: opts.subject, bookingId: opts.bookingId ?? null, orderId: opts.orderId ?? null, conversationId: c!.id, priority: opts.category === "dispute" || opts.category === "payment" ? "high" : "normal" })
      .returning();
    return t!;
  });
  await notifyStaff("support.manage", `New ticket ${t.reference}`, opts.subject, `/admin/support/${t.id}`);
  return t;
}
