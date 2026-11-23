import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { loadConversation } from "@/server/messaging";
import { Breadcrumbs, Card, CardHeader, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { Thread } from "@/components/portal/thread";
import { titleCase } from "@/lib/utils";
import { staffReply } from "../../_actions/system";
import { TicketForm } from "./forms";

export const metadata = { title: "Ticket" };

export default async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePermission("support.manage");
  const { id } = await params;
  const [t] = await db.select({ t: schema.supportTickets, user: schema.users }).from(schema.supportTickets).innerJoin(schema.users, eq(schema.users.id, schema.supportTickets.userId)).where(eq(schema.supportTickets.id, id));
  if (!t) notFound();
  const conv = await loadConversation(t.t.conversationId, u, { staffView: true });
  const staff = await db.execute<{ id: string; name: string }>(sql`select distinct u.id, u.full_name as name from users u join user_roles ur on ur.user_id = u.id join role_permissions rp on rp.role_id = ur.role_id join permissions p on p.id = rp.permission_id where p.key = 'support.manage' and u.status = 'active'`);
  return (
    <>
      <Breadcrumbs items={[{ label: "Support", href: "/admin/support" }, { label: t.t.reference }]} />
      <PageHeader className="mt-2" title={t.t.subject} description={`${t.t.reference} · ${titleCase(t.t.category)} · from ${t.user.fullName} (${t.user.email})`} actions={<StatusBadge status={t.t.status} />} />
      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <Thread conversationId={t.t.conversationId} meId={u.id} action={staffReply} canInternal messages={conv.messages.map((m) => ({ id: m.m.id, body: m.m.body, senderId: m.m.senderId, sender: m.sender, avatar: m.avatar, createdAt: m.m.createdAt.toISOString(), internal: m.m.internal, attachments: m.m.attachments }))} />
        <div className="space-y-4">
          <Card><CardHeader title="Ticket" /><div className="p-5"><TicketForm t={t.t} staff={[...staff]} /></div></Card>
          {(t.t.bookingId || t.t.orderId) && <Card className="p-5 text-sm">{t.t.bookingId && <Link href={`/admin/bookings/${t.t.bookingId}`} className="block link">Open linked booking{t.t.category === "dispute" ? " (resolve dispute there)" : ""}</Link>}{t.t.orderId && <Link href={`/admin/orders/${t.t.orderId}`} className="block link">Open linked order</Link>}</Card>}
        </div>
      </div>
    </>
  );
}
