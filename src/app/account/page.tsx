import Link from "next/link";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { CalendarDays, ShoppingBag, CalendarCheck } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { Alert, Card, CardHeader, EmptyState, StatusBadge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ResendVerification } from "@/app/(auth)/forms";

export const metadata = { title: "My account" };

export default async function AccountHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const u = await requireUser();
  const { welcome } = await searchParams;
  const [bookings, orders, regs, [counts]] = await Promise.all([
    db.select({ b: schema.bookings, service: schema.services.name }).from(schema.bookings).innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
      .where(and(eq(schema.bookings.customerId, u.id), inArray(schema.bookings.status, ["awaiting_quote", "quoted", "awaiting_payment", "pending_assignment", "assigned", "accepted", "in_progress", "awaiting_confirmation", "disputed"])))
      .orderBy(schema.bookings.scheduledStart).limit(4),
    db.select().from(schema.orders).where(eq(schema.orders.userId, u.id)).orderBy(desc(schema.orders.createdAt)).limit(3),
    db.select({ r: schema.activityRegistrations, s: schema.activitySessions, title: schema.activities.title }).from(schema.activityRegistrations)
      .innerJoin(schema.activitySessions, eq(schema.activitySessions.id, schema.activityRegistrations.sessionId))
      .innerJoin(schema.activities, eq(schema.activities.id, schema.activitySessions.activityId))
      .where(and(eq(schema.activityRegistrations.userId, u.id), gte(schema.activitySessions.startsAt, new Date()), inArray(schema.activityRegistrations.status, ["confirmed", "pending_payment"])))
      .orderBy(schema.activitySessions.startsAt).limit(3),
    db.select({
      bookings: sql<number>`(select count(*) from bookings where customer_id = ${u.id})`.mapWith(Number),
      completed: sql<number>`(select count(*) from bookings where customer_id = ${u.id} and status = 'completed')`.mapWith(Number),
      orders: sql<number>`(select count(*) from orders where user_id = ${u.id})`.mapWith(Number),
    }).from(sql`(select 1) x`),
  ]);
  const actionNeeded = bookings.filter((b) => ["quoted", "awaiting_payment", "awaiting_confirmation"].includes(b.b.status));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hello, {u.fullName.split(" ")[0]}</h1>
        <p className="mt-1 text-ink-muted">{counts?.bookings ?? 0} bookings · {counts?.completed ?? 0} completed · {counts?.orders ?? 0} shop orders</p>
      </div>
      {welcome && <Alert tone="success" title="Your account is ready">Book a service, shop supplies or join a workshop – everything is tracked here.</Alert>}
      {!u.emailVerified && (
        <Alert tone="warning" title="Please confirm your email">
          <div className="flex flex-wrap items-center justify-between gap-3"><span>We sent you a link. Confirming makes sure you receive booking updates.</span><ResendVerification /></div>
        </Alert>
      )}
      {actionNeeded.length > 0 && (
        <Alert tone="info" title="Needs your attention">
          <ul className="mt-1 space-y-1">{actionNeeded.map((b) => <li key={b.b.id}><Link href={`/account/bookings/${b.b.id}`} className="link">{b.service} ({b.b.reference})</Link> – {b.b.status === "quoted" ? "review the quote" : b.b.status === "awaiting_payment" ? "complete payment" : "confirm the job is done"}</li>)}</ul>
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming bookings" action={<Link href="/account/bookings" className="text-sm link">All bookings</Link>} />
          {bookings.length === 0 ? <div className="p-5"><EmptyState icon={<CalendarDays className="h-7 w-7" />} title="No upcoming bookings" action={<ButtonLink href="/services" size="sm">Book a service</ButtonLink>} /></div> : (
            <ul className="divide-y divide-sand-100">
              {bookings.map(({ b, service }) => (
                <li key={b.id}><Link href={`/account/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-sand-50">
                  <span className="min-w-0"><span className="block truncate font-medium">{service}</span><span className="text-sm text-ink-muted">{formatDateTime(b.scheduledStart)}</span></span>
                  <StatusBadge status={b.status} />
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent orders" action={<Link href="/account/orders" className="text-sm link">All orders</Link>} />
          {orders.length === 0 ? <div className="p-5"><EmptyState icon={<ShoppingBag className="h-7 w-7" />} title="No orders yet" action={<ButtonLink href="/shop" size="sm" variant="outline">Visit the shop</ButtonLink>} /></div> : (
            <ul className="divide-y divide-sand-100">
              {orders.map((o) => (
                <li key={o.id}><Link href={`/account/orders/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-sand-50">
                  <span><span className="block font-medium">{o.reference}</span><span className="text-sm text-ink-muted">{formatDate(o.createdAt)} · {formatMoney(o.total, o.currency)}</span></span>
                  <StatusBadge status={o.status} />
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Upcoming activities" action={<Link href="/account/activities" className="text-sm link">All registrations</Link>} />
          {regs.length === 0 ? <div className="p-5"><EmptyState icon={<CalendarCheck className="h-7 w-7" />} title="No upcoming activities" action={<ButtonLink href="/activities" size="sm" variant="outline">Browse activities</ButtonLink>} /></div> : (
            <ul className="divide-y divide-sand-100">{regs.map((r) => <li key={r.r.id} className="flex items-center justify-between px-5 py-3.5"><span><span className="block font-medium">{r.title}</span><span className="text-sm text-ink-muted">{formatDateTime(r.s.startsAt)} · {r.r.quantity} seat(s)</span></span><StatusBadge status={r.r.status} /></li>)}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
