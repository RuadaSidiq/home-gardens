import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { bookingHistory, recommendGardeners } from "@/server/bookings/engine";
import { Alert, Breadcrumbs, Card, CardHeader, DescriptionList, StatusBadge, staffStatusLabel } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { formatDateTime, titleCase } from "@/lib/utils";
import { adminComplete } from "../../_actions/bookings";
import { AssignPanel, DisputeForm, NotesForm, QuoteForm, StaffActions } from "./forms";

export const metadata = { title: "Booking" };

export default async function AdminBooking({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePermission("bookings.view");
  const manage = u.permissions.has("bookings.manage");
  const { id } = await params;
  const gu = alias(schema.users, "gu");
  const [row] = await db
    .select({ b: schema.bookings, svc: schema.services, customer: schema.users, gardener: schema.gardenerProfiles, gName: gu.fullName })
    .from(schema.bookings)
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .innerJoin(schema.users, eq(schema.users.id, schema.bookings.customerId))
    .leftJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.bookings.gardenerId))
    .leftJoin(gu, eq(gu.id, schema.gardenerProfiles.userId))
    .where(eq(schema.bookings.id, id));
  if (!row) notFound();
  const { b, svc } = row;
  const [history, assignments, quotes, payments, media, recs, tickets] = await Promise.all([
    bookingHistory(b.id),
    db.select({ a: schema.bookingAssignments, name: gu.fullName }).from(schema.bookingAssignments).innerJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.bookingAssignments.gardenerId)).innerJoin(gu, eq(gu.id, schema.gardenerProfiles.userId)).where(eq(schema.bookingAssignments.bookingId, b.id)).orderBy(desc(schema.bookingAssignments.createdAt)),
    db.select().from(schema.bookingQuotes).where(eq(schema.bookingQuotes.bookingId, b.id)).orderBy(desc(schema.bookingQuotes.createdAt)),
    db.select().from(schema.payments).where(eq(schema.payments.bookingId, b.id)).orderBy(desc(schema.payments.createdAt)),
    db.select().from(schema.bookingMedia).where(eq(schema.bookingMedia.bookingId, b.id)),
    ["pending_assignment", "assigned", "accepted"].includes(b.status) ? recommendGardeners(b.id) : Promise.resolve([]),
    db.select().from(schema.supportTickets).where(eq(schema.supportTickets.bookingId, b.id)),
  ]);
  const refundable = b.amountPaid - b.amountRefunded;
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Bookings", href: "/admin/bookings" }, { label: b.reference }]} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold">{b.reference} · {svc.name}</h1><p className="text-ink-muted">{formatDateTime(b.scheduledStart)} · {b.address.line1}, {b.address.city}</p></div>
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={b.status} label={staffStatusLabel(b.status)} /><StatusBadge status={b.paymentState} />{manage && <StaffActions bookingId={b.id} currency={b.currency} refundable={refundable} canCancel={!["in_progress", "awaiting_confirmation", "completed", "cancelled"].includes(b.status)} canReschedule={["awaiting_quote", "quoted", "awaiting_payment", "pending_assignment", "assigned", "accepted"].includes(b.status)} />}</div>
      </div>
      {b.status === "disputed" && manage && <Card className="border-clay-500/40"><CardHeader title="Resolve dispute" description={tickets.length ? undefined : "No ticket linked"} action={tickets[0] && <Link href={`/admin/support/${tickets[0].id}`} className="text-sm link">Open ticket {tickets[0].reference}</Link>} /><div className="p-5"><DisputeForm bookingId={b.id} currency={b.currency} refundable={refundable} /></div></Card>}
      {(b.status === "awaiting_quote" || b.status === "quoted") && manage && <Card className="border-forest-300"><CardHeader title={b.status === "quoted" ? "Revise quote" : "Send a quote"} /><div className="p-5"><QuoteForm bookingId={b.id} currency={b.currency} /></div></Card>}
      {["pending_assignment", "assigned", "accepted"].includes(b.status) && manage && (
        <Card className={b.status === "pending_assignment" ? "border-amber-400/60" : ""}>
          <CardHeader title={b.status === "pending_assignment" ? "Assign a gardener" : "Reassign"} description="Only gardeners who offer this service, cover the area, work at this time and are free are listed, ranked by match score." />
          <div className="p-5"><AssignPanel bookingId={b.id} candidates={recs.filter((r) => r.gardenerId !== b.gardenerId).map((r) => ({ id: r.gardenerId, label: `${r.name} · ${r.type === "company" ? "company" : "independent"} · ${r.years} yrs · ${r.ratingCount ? r.rating.toFixed(1) + "★" : "new"} · score ${r.score}` }))} /></div>
        </Card>
      )}
      {b.status === "awaiting_confirmation" && manage && b.amountPaid >= b.total && <Alert tone="info"><div className="flex flex-wrap items-center justify-between gap-2"><span>Waiting for the customer to confirm.</span><ActionButton action={adminComplete} fields={{ bookingId: b.id }} confirm="Mark completed on the customer's behalf? Gardener earnings will be recorded.">Mark completed</ActionButton></div></Alert>}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Customer" action={u.permissions.has("customers.view") && <Link href={`/admin/customers/${row.customer.id}`} className="text-sm link">Profile</Link>} />
          <div className="space-y-1 p-5 text-sm"><p className="font-medium">{row.customer.fullName}</p><p className="text-ink-muted">{row.customer.email}</p><p className="text-ink-muted">Site contact: {b.contactPhone}</p><p className="pt-2 text-ink-soft">{b.address.line1}{b.address.line2 ? `, ${b.address.line2}` : ""}, {b.address.city}{b.address.digitalAddress ? ` (${b.address.digitalAddress})` : ""}</p></div>
        </Card>
        <Card>
          <CardHeader title="Gardener" action={row.gardener && <Link href={`/admin/gardeners/${row.gardener.id}`} className="text-sm link">Profile</Link>} />
          <div className="p-5 text-sm">{row.gardener ? <><p className="font-medium">{row.gName}</p><p className="text-ink-muted">{titleCase(row.gardener.type)}{row.gardener.employeeId ? ` · ${row.gardener.employeeId}` : ""}</p></> : <p className="text-ink-muted">Not assigned{b.requestedGardenerId ? " (customer requested a specific gardener)" : ""}</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Money" />
          <div className="px-5 py-2"><DescriptionList items={[["Subtotal", formatMoney(b.subtotal, b.currency)], ["Discount", formatMoney(b.discount, b.currency)], ["Tax", formatMoney(b.tax, b.currency)], ["Total", formatMoney(b.total, b.currency)], ["Deposit", formatMoney(b.depositAmount, b.currency)], ["Paid", formatMoney(b.amountPaid, b.currency)], ["Refunded", formatMoney(b.amountRefunded, b.currency)]]} /></div>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Job details" />
          <div className="space-y-2 p-5 text-sm"><p className="whitespace-pre-wrap">{b.details}</p>{b.gardenSizeSqm && <p className="text-ink-muted">Size: {b.gardenSizeSqm} m²</p>}{b.estimatedHours && <p className="text-ink-muted">Hours: {b.estimatedHours}</p>}{b.customerNotes && <p className="text-ink-muted">Customer notes: {b.customerNotes}</p>}
            {media.length > 0 && <div className="flex flex-wrap gap-2 pt-2">{media.map((m) => <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="relative h-20 w-20 overflow-hidden rounded bg-sand-100"><Image src={m.url} alt={m.kind} fill sizes="80px" className="object-cover" /><span className="absolute bottom-0 left-0 bg-ink/70 px-1 text-[10px] text-white">{m.kind}</span></a>)}</div>}
          </div>
        </Card>
        <Card><CardHeader title="Internal notes" /><div className="p-5"><NotesForm bookingId={b.id} value={b.internalNotes ?? ""} /></div></Card>
        <Card>
          <CardHeader title="Payments" />
          <ul className="divide-y divide-sand-100 text-sm">{payments.map((p) => <li key={p.id} className="flex items-center justify-between px-5 py-2.5"><span>{formatMoney(p.amount, p.currency)} <span className="text-xs text-ink-muted">{titleCase(p.provider)} · {p.kind} · {p.reference}</span></span><StatusBadge status={p.status} /></li>)}{!payments.length && <li className="px-5 py-3 text-ink-muted">None</li>}</ul>
        </Card>
        <Card>
          <CardHeader title="Assignment history" />
          <ul className="divide-y divide-sand-100 text-sm">{assignments.map(({ a, name }) => <li key={a.id} className="px-5 py-2.5"><div className="flex justify-between"><span>{name}</span><StatusBadge status={a.status} /></div><p className="text-xs text-ink-muted">{titleCase(a.method)}{a.score ? ` · score ${a.score}` : ""} · {formatDateTime(a.createdAt)}{a.reason ? ` · ${a.reason}` : ""}</p></li>)}{!assignments.length && <li className="px-5 py-3 text-ink-muted">None</li>}</ul>
        </Card>
        <Card>
          <CardHeader title="Quotes" />
          <ul className="divide-y divide-sand-100 text-sm">{quotes.map((q) => <li key={q.id} className="px-5 py-2.5"><div className="flex justify-between"><span>{formatMoney(q.amount, q.currency)}{q.gardenerId ? " (gardener)" : ""}</span><StatusBadge status={q.status} /></div>{q.note && <p className="text-xs text-ink-muted">{q.note}</p>}</li>)}{!quotes.length && <li className="px-5 py-3 text-ink-muted">None</li>}</ul>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="Status history" />
          <ol className="grid gap-x-8 gap-y-3 p-5 text-sm md:grid-cols-2">{history.map(({ h, actor }) => <li key={h.id}><p className="font-medium">{h.fromStatus ? `${titleCase(h.fromStatus)} → ` : ""}{titleCase(h.toStatus)}</p><p className="text-xs text-ink-muted">{formatDateTime(h.createdAt)} · {actor ?? "System"}{h.note ? ` · ${h.note}` : ""}</p></li>)}</ol>
        </Card>
      </div>
    </div>
  );
}
