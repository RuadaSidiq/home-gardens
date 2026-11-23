import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { Breadcrumbs, Card, CardHeader, DescriptionList, StatusBadge, staffStatusLabel, Stat } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";
import { setUserStatus } from "../../_actions/access";

export const metadata = { title: "Customer" };

export default async function Customer({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePermission("customers.view");
  const { id } = await params;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) notFound();
  const [bookings, orders, tickets, addresses, payments] = await Promise.all([
    db.select({ b: schema.bookings, service: schema.services.name }).from(schema.bookings).innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId)).where(eq(schema.bookings.customerId, id)).orderBy(desc(schema.bookings.createdAt)),
    db.select().from(schema.orders).where(eq(schema.orders.userId, id)).orderBy(desc(schema.orders.createdAt)),
    db.select().from(schema.supportTickets).where(eq(schema.supportTickets.userId, id)).orderBy(desc(schema.supportTickets.createdAt)),
    db.select().from(schema.addresses).where(eq(schema.addresses.userId, id)),
    db.select().from(schema.payments).where(eq(schema.payments.userId, id)),
  ]);
  const spent = payments.filter((p) => p.status === "succeeded" || p.status === "partially_refunded").reduce((acc, p) => ((acc[p.currency] = (acc[p.currency] ?? 0) + p.amount - p.amountRefunded), acc), {} as Record<string, number>);
  const canManage = me.permissions.has("customers.manage") && me.id !== u.id;
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Customers", href: "/admin/customers" }, { label: u.fullName }]} />
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{u.fullName}</h1><p className="text-ink-muted">{u.email} · {u.phone}</p></div><div className="flex items-center gap-2"><StatusBadge status={u.status} />{canManage && (u.status === "active" ? <ActionButton action={setUserStatus} fields={{ userId: u.id, status: "suspended" }} variant="danger-outline" confirm="Suspend this customer and sign them out?">Suspend</ActionButton> : <ActionButton action={setUserStatus} fields={{ userId: u.id, status: "active" }} variant="primary">Reactivate</ActionButton>)}</div></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Bookings" value={bookings.length} /><Stat label="Orders" value={orders.length} /><Stat label="Net spend" value={Object.entries(spent).map(([c, a]) => formatMoney(a, c, { noDecimals: true })).join(" + ") || "0"} /><Stat label="Support tickets" value={tickets.length} /></div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader title="Bookings" /><ul className="divide-y divide-sand-100 text-sm">{bookings.map(({ b, service }) => <li key={b.id}><Link href={`/admin/bookings/${b.id}`} className="flex justify-between px-5 py-2.5 hover:bg-sand-50"><span>{b.reference} · {service} <span className="text-ink-muted">{formatDate(b.scheduledStart)}</span></span><StatusBadge status={b.status} label={staffStatusLabel(b.status)} /></Link></li>)}{!bookings.length && <li className="px-5 py-3 text-ink-muted">None</li>}</ul></Card>
        <Card><CardHeader title="Orders" /><ul className="divide-y divide-sand-100 text-sm">{orders.map((o) => <li key={o.id}><Link href={`/admin/orders/${o.id}`} className="flex justify-between px-5 py-2.5 hover:bg-sand-50"><span>{o.reference} <span className="text-ink-muted">{formatMoney(o.total, o.currency)} · {formatDate(o.createdAt)}</span></span><StatusBadge status={o.status} /></Link></li>)}{!orders.length && <li className="px-5 py-3 text-ink-muted">None</li>}</ul></Card>
        <Card><CardHeader title="Support" /><ul className="divide-y divide-sand-100 text-sm">{tickets.map((t) => <li key={t.id}><Link href={`/admin/support/${t.id}`} className="flex justify-between px-5 py-2.5 hover:bg-sand-50"><span>{t.reference} · {t.subject}</span><StatusBadge status={t.status} /></Link></li>)}{!tickets.length && <li className="px-5 py-3 text-ink-muted">None</li>}</ul></Card>
        <Card><CardHeader title="Account" /><div className="px-5 py-2"><DescriptionList items={[["Joined", formatDate(u.createdAt)], ["Last sign-in", formatDateTime(u.lastLoginAt)], ["Email verified", u.emailVerifiedAt ? "Yes" : "No"], ["Preferred currency", u.preferredCurrency ?? "—"], ["Addresses", addresses.map((a) => `${a.label}: ${a.line1}, ${a.city}`).join(" · ") || "—"]]} /></div></Card>
      </div>
    </div>
  );
}
