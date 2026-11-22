import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { EmptyState, PageHeader, StatusBadge, Card, CardHeader } from "@/components/ui/primitives";
import { ConversationView } from "@/components/portal/conversations";
import { formatDate, titleCase } from "@/lib/utils";
import { NewTicketForm } from "./new-ticket";

export async function SupportHome({ base, bookingId }: { base: string; bookingId?: string }) {
  const u = await requireUser();
  const [tickets, bookings, orders] = await Promise.all([
    db.select().from(schema.supportTickets).where(eq(schema.supportTickets.userId, u.id)).orderBy(desc(schema.supportTickets.updatedAt)),
    u.gardenerId
      ? db.select({ id: schema.bookings.id, reference: schema.bookings.reference }).from(schema.bookings).where(eq(schema.bookings.gardenerId, u.gardenerId)).orderBy(desc(schema.bookings.createdAt)).limit(30)
      : db.select({ id: schema.bookings.id, reference: schema.bookings.reference }).from(schema.bookings).where(eq(schema.bookings.customerId, u.id)).orderBy(desc(schema.bookings.createdAt)).limit(30),
    db.select({ id: schema.orders.id, reference: schema.orders.reference }).from(schema.orders).where(eq(schema.orders.userId, u.id)).orderBy(desc(schema.orders.createdAt)).limit(30),
  ]);
  return (
    <>
      <PageHeader title="Support" description="Our team replies within one working day." />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div>
          {tickets.length === 0 ? <EmptyState title="No support requests" description="Open a request and we'll get back to you here." /> : (
            <ul className="divide-y divide-sand-100 rounded-lg border border-sand-200 bg-white">
              {tickets.map((t) => (
                <li key={t.id}><Link href={`${base}/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-sand-50">
                  <span className="min-w-0"><span className="block truncate font-medium">{t.subject}</span><span className="text-sm text-ink-muted">{t.reference} · {titleCase(t.category)} · {formatDate(t.updatedAt)}</span></span>
                  <StatusBadge status={t.status} label={t.status === "pending" ? "Awaiting you" : undefined} />
                </Link></li>
              ))}
            </ul>
          )}
        </div>
        <Card><CardHeader title="New request" /><div className="p-5"><NewTicketForm bookings={bookings} orders={orders} defaultBooking={bookingId} /></div></Card>
      </div>
    </>
  );
}

export async function TicketView({ id, base }: { id: string; base: string }) {
  const u = await requireUser();
  const [t] = await db.select().from(schema.supportTickets).where(and(eq(schema.supportTickets.id, id), eq(schema.supportTickets.userId, u.id)));
  if (!t) notFound();
  return (
    <ConversationView id={t.conversationId} base={base} backLabel="Support">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted"><span>{t.reference}</span>·<span>{titleCase(t.category)}</span>·<StatusBadge status={t.status} />{t.resolution && <span className="w-full rounded bg-forest-50 p-2 text-forest-800">Resolution: {t.resolution}</span>}</div>
    </ConversationView>
  );
}
