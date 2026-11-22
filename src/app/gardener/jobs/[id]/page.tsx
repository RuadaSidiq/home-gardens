import Image from "next/image";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { MapPin, Phone, Clock } from "lucide-react";
import { db, schema } from "@/db";
import { requireGardener } from "@/server/auth/session";
import { resolveCommissionRate } from "@/server/finance";
import { getSettings } from "@/server/settings";
import { commissionSplit } from "@/server/pricing";
import { Alert, Breadcrumbs, Card, CardHeader, DescriptionList, StatusBadge } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { formatDateTime, formatTime, titleCase } from "@/lib/utils";
import { messageGardener } from "@/app/account/actions";
import { CompleteJob, RespondJob, StartJob } from "./job-actions";

export const metadata = { title: "Job" };

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireGardener();
  const { id } = await params;
  // A gardener can only see jobs currently assigned to them.
  const [row] = await db
    .select({ b: schema.bookings, svc: schema.services, customer: schema.users.fullName })
    .from(schema.bookings)
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .innerJoin(schema.users, eq(schema.users.id, schema.bookings.customerId))
    .where(and(eq(schema.bookings.id, id), eq(schema.bookings.gardenerId, u.gardenerId)));
  if (!row) notFound();
  const { b, svc } = row;
  const settings = await getSettings();
  const [media, quotes] = await Promise.all([
    db.select().from(schema.bookingMedia).where(eq(schema.bookingMedia.bookingId, b.id)),
    db.select().from(schema.bookingQuotes).where(and(eq(schema.bookingQuotes.bookingId, b.id), eq(schema.bookingQuotes.gardenerId, u.gardenerId))).orderBy(desc(schema.bookingQuotes.createdAt)),
  ]);
  const net = b.total - b.tax;
  const rate = u.gardenerType === "independent" ? await resolveCommissionRate(db, svc.categoryId, b.countryCode, settings.finance.defaultCommissionBps) : null;
  const split = rate ? commissionSplit(net, rate.rateBps) : null;
  const canStart = b.status === "accepted" && b.scheduledStart.getTime() - Date.now() <= 12 * 3600_000;
  const showAddress = ["accepted", "in_progress", "awaiting_confirmation", "completed"].includes(b.status);
  const pendingQuote = quotes.find((q) => q.status === "pending");
  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: "Jobs", href: "/gardener/jobs" }, { label: b.reference }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{svc.name}</h1><p className="text-ink-muted">{formatDateTime(b.scheduledStart)} – {formatTime(b.scheduledEnd)}</p></div>
        <StatusBadge status={b.status} />
      </div>
      {b.status === "assigned" && (
        <Card className="border-forest-300 p-5">
          <p className="font-semibold">New job offer</p>
          <p className="mb-4 mt-1 text-sm text-ink-muted">Please respond within {settings.booking.gardenerResponseHours} hours, otherwise it may be offered to another gardener.</p>
          {pendingQuote ? <Alert tone="info">You proposed {formatMoney(pendingQuote.amount, pendingQuote.currency)}. Waiting for the customer.</Alert> : <RespondJob bookingId={b.id} canQuote={svc.pricingModel !== "fixed"} currency={b.currency} />}
        </Card>
      )}
      {b.status === "accepted" && <Card className="p-5"><p className="mb-3 font-semibold">Ready to start?</p>{canStart ? <StartJob bookingId={b.id} /> : <p className="text-sm text-ink-muted">You can start this job on the day it's scheduled.</p>}</Card>}
      {b.status === "in_progress" && <Card className="border-forest-300 p-5"><p className="mb-3 font-semibold">Finish the job</p><CompleteJob bookingId={b.id} /></Card>}
      {b.status === "awaiting_confirmation" && <Alert tone="info">Waiting for the customer to confirm. It's confirmed automatically after {settings.booking.autoCompleteHours} hours if they don't respond.</Alert>}
      {b.status === "disputed" && <Alert tone="warning">The customer reported a problem. Our support team will contact you.</Alert>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Job details" />
          <div className="space-y-3 p-5 text-sm">
            <p className="whitespace-pre-wrap">{b.details}</p>
            {b.gardenSizeSqm && <p className="text-ink-muted">Garden size: {b.gardenSizeSqm} m²</p>}
            {b.estimatedHours && <p className="flex items-center gap-1.5 text-ink-muted"><Clock className="h-4 w-4" />{b.estimatedHours} hours</p>}
            {b.customerNotes && <p className="rounded bg-sand-50 p-2">Note from customer: {b.customerNotes}</p>}
            {svc.requirements && <p className="text-ink-muted">Service requirements: {svc.requirements}</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Customer & location" />
          <div className="space-y-2 p-5 text-sm">
            <p className="font-medium">{row.customer}</p>
            {showAddress ? (
              <>
                <p className="flex gap-1.5"><MapPin className="h-4 w-4 shrink-0 text-ink-muted" />{b.address.line1}{b.address.line2 ? `, ${b.address.line2}` : ""}, {b.address.city}{b.address.digitalAddress ? ` (${b.address.digitalAddress})` : ""}</p>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.address.line1}, ${b.address.city}`)}`} target="_blank" rel="noopener noreferrer" className="link">Open in maps</a>
                <p className="flex gap-1.5"><Phone className="h-4 w-4 text-ink-muted" /><a href={`tel:${b.contactPhone.replace(/\s/g, "")}`} className="link">{b.contactPhone}</a></p>
                <div className="pt-2"><ActionButton action={messageGardener} fields={{ bookingId: b.id }} size="md">Message customer</ActionButton></div>
              </>
            ) : <p className="text-ink-muted">{b.address.city}. The full address and phone number are shown once you accept.</p>}
          </div>
        </Card>
        {split && (
          <Card>
            <CardHeader title="Your earnings" />
            <div className="px-5 py-2"><DescriptionList items={[["Job value (before tax)", formatMoney(net, b.currency)], [`Platform commission (${rate!.rateBps / 100}%)`, `−${formatMoney(split.commission, b.currency)}`], ["You receive", <strong key="r">{formatMoney(split.gardener, b.currency)}</strong>]]} /></div>
            <p className="px-5 pb-4 text-xs text-ink-muted">Released {settings.finance.payoutHoldDays} days after the customer confirms completion.</p>
          </Card>
        )}
        {media.length > 0 && (
          <Card>
            <CardHeader title="Photos" />
            <div className="flex flex-wrap gap-2 p-5">{media.map((m) => <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="relative h-24 w-24 overflow-hidden rounded bg-sand-100" title={titleCase(m.kind)}><Image src={m.url} alt={m.kind} fill sizes="96px" className="object-cover" /><span className="absolute bottom-0 left-0 bg-ink/70 px-1 text-[10px] text-white">{m.kind}</span></a>)}</div>
          </Card>
        )}
      </div>
    </div>
  );
}
