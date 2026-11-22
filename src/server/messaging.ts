import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { UserError } from "./errors";
import { notify } from "./notify";
import { audit } from "./audit";
import type { CurrentUser } from "./auth/session";

/** Opens (or reuses) the conversation between a booking's customer and its assigned gardener. */
export async function bookingConversation(bookingId: string, user: CurrentUser) {
  const [b] = await db
    .select({ b: schema.bookings, gardenerUserId: schema.gardenerProfiles.userId })
    .from(schema.bookings)
    .leftJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.bookings.gardenerId))
    .where(eq(schema.bookings.id, bookingId));
  if (!b) throw new UserError("Booking not found.");
  const isCustomer = b.b.customerId === user.id;
  const isGardener = b.gardenerUserId === user.id;
  if (!isCustomer && !isGardener) throw new UserError("Booking not found.");
  if (!b.gardenerUserId) throw new UserError("Messaging opens once a gardener is assigned.");
  const [existing] = await db.select().from(schema.conversations).where(and(eq(schema.conversations.bookingId, bookingId), eq(schema.conversations.type, "booking")));
  if (existing) {
    // a reassigned gardener joins the thread
    await db.insert(schema.conversationParticipants).values({ conversationId: existing.id, userId: b.gardenerUserId }).onConflictDoNothing();
    return existing;
  }
  const [c] = await db.insert(schema.conversations).values({ type: "booking", subject: `Booking ${b.b.reference}`, bookingId, createdBy: user.id }).returning();
  await db.insert(schema.conversationParticipants).values([{ conversationId: c!.id, userId: b.b.customerId }, { conversationId: c!.id, userId: b.gardenerUserId }]);
  return c!;
}

export async function listConversations(userId: string) {
  const rows = await db
    .select({ c: schema.conversations, lastReadAt: schema.conversationParticipants.lastReadAt })
    .from(schema.conversationParticipants)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.conversationParticipants.conversationId))
    .where(eq(schema.conversationParticipants.userId, userId))
    .orderBy(desc(schema.conversations.lastMessageAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.c.id);
  const last = await db.execute<{ conversation_id: string; body: string; sender: string }>(sql`
    select distinct on (m.conversation_id) m.conversation_id, m.body, u.full_name as sender
    from messages m join users u on u.id = m.sender_id
    where m.conversation_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) and not m.internal
    order by m.conversation_id, m.created_at desc`);
  const others = await db
    .select({ conversationId: schema.conversationParticipants.conversationId, name: schema.users.fullName, avatar: schema.users.avatarUrl })
    .from(schema.conversationParticipants)
    .innerJoin(schema.users, eq(schema.users.id, schema.conversationParticipants.userId))
    .where(and(inArray(schema.conversationParticipants.conversationId, ids), sql`${schema.conversationParticipants.userId} <> ${userId}`));
  return rows.map((r) => ({
    ...r.c,
    unread: !r.lastReadAt || r.lastReadAt < r.c.lastMessageAt,
    preview: last.find((l) => l.conversation_id === r.c.id),
    with: others.filter((o) => o.conversationId === r.c.id),
  }));
}

/** Access: participants; staff with support.manage may read support threads (audited). */
export async function loadConversation(id: string, user: CurrentUser, opts: { staffView?: boolean } = {}) {
  const [c] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, id));
  if (!c) throw new UserError("Conversation not found.");
  const [p] = await db.select().from(schema.conversationParticipants).where(and(eq(schema.conversationParticipants.conversationId, id), eq(schema.conversationParticipants.userId, user.id)));
  const staff = !p && opts.staffView && user.permissions.has("support.manage");
  if (!p && !staff) throw new UserError("Conversation not found.");
  if (staff) await audit({ actorId: user.id, action: "conversation.staff_view", entityType: "conversation", entityId: id });
  const msgs = await db
    .select({ m: schema.messages, sender: schema.users.fullName, avatar: schema.users.avatarUrl })
    .from(schema.messages)
    .innerJoin(schema.users, eq(schema.users.id, schema.messages.senderId))
    .where(and(eq(schema.messages.conversationId, id), staff || user.isStaff ? undefined : eq(schema.messages.internal, false)))
    .orderBy(schema.messages.createdAt);
  if (p) await db.update(schema.conversationParticipants).set({ lastReadAt: new Date() }).where(and(eq(schema.conversationParticipants.conversationId, id), eq(schema.conversationParticipants.userId, user.id)));
  return { c, messages: msgs, isParticipant: !!p };
}

export async function sendMessage(opts: { conversationId: string; user: CurrentUser; body: string; attachments?: { url: string; name: string; mime: string }[]; internal?: boolean; staff?: boolean }) {
  const { c, isParticipant } = await loadConversation(opts.conversationId, opts.user, { staffView: opts.staff });
  if (!isParticipant) {
    // staff replying to a support thread join it
    await db.insert(schema.conversationParticipants).values({ conversationId: c.id, userId: opts.user.id, lastReadAt: new Date() }).onConflictDoNothing();
  }
  const internal = !!opts.internal && opts.user.permissions.has("support.manage");
  await db.insert(schema.messages).values({ conversationId: c.id, senderId: opts.user.id, body: opts.body, attachments: opts.attachments ?? [], internal });
  await db.update(schema.conversations).set({ lastMessageAt: new Date() }).where(eq(schema.conversations.id, c.id));
  if (internal) return;
  const recipients = await db.select({ userId: schema.conversationParticipants.userId }).from(schema.conversationParticipants).where(and(eq(schema.conversationParticipants.conversationId, c.id), sql`${schema.conversationParticipants.userId} <> ${opts.user.id}`));
  const [ticket] = await db.select().from(schema.supportTickets).where(eq(schema.supportTickets.conversationId, c.id));
  for (const r of recipients) {
    const [ru] = await db.select({ isGardener: sql<boolean>`exists(select 1 from gardener_profiles g where g.user_id = ${r.userId})` }).from(schema.users).where(eq(schema.users.id, r.userId));
    const base = ru?.isGardener ? "/gardener/messages" : "/account/messages";
    if (ticket && opts.user.isStaff) await notify(r.userId, "support_response", { reference: ticket.reference }, `${ru?.isGardener ? "/gardener" : "/account"}/support/${ticket.id}`);
    else await notify(r.userId, "new_message", { sender: opts.user.fullName.split(" ")[0], preview: opts.body.slice(0, 80) }, `${base}/${c.id}`);
  }
  if (ticket && !opts.user.isStaff && ticket.status !== "open") await db.update(schema.supportTickets).set({ status: "open", updatedAt: new Date() }).where(eq(schema.supportTickets.id, ticket.id));
  if (ticket && opts.user.isStaff && ticket.status === "open") await db.update(schema.supportTickets).set({ status: "pending", updatedAt: new Date() }).where(eq(schema.supportTickets.id, ticket.id));
}
