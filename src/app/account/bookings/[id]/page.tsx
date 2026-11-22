import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { amountDue, bookingHistory } from "@/server/bookings/engine";
import { providersFor } from "@/server/payments/registry";
import { Alert, Avatar, Breadcrumbs, Card, CardHeader, DescriptionList, StatusBadge } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/form";
import { PaymentPanel } from "@/components/portal/payment-panel";
import { ReviewForm } from "@/components/portal/review-form";
import { formatMoney } from "@/lib/money";
import { formatDateTime, titleCase } from "@/lib/utils";
import { addDaysStr, zonedInfo } from "@/lib/time";
import { confirmMyBooking, messageGardener, quoteResponse, reviewMyGardener } from "../../actions";
import { CancelBooking, DisputeBooking, RescheduleBooking } from "./booking-actions";

export const metadata = { title: "Booking" };

const PAYMENT_MSG: Record<string, { tone: "success" | "warning" | "error"; text: string }> = {
  success: { tone: "success", text: "Payment confirmed. Thank you!" },
  pending: { tone: "warning", text: "We're waiting for the payment provider to confirm your payment. This page will update once it does." },
  failed: { tone: "error", text: "The payment did not go through. You can try again below." },
  cancelled: { tone: "warning", text: "Payment was cancelled. You can try again whenever you're ready." },
};

export default async function BookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string; created?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const [row] = await db
    .select({ b: schema.bookings, svc: schema.services, gardener: schema.gardenerProfiles, gName: schema.users.fullName, gAvatar: schema.users.avatarUrl })
    .from(schema.bookings)
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .leftJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.bookings.gardenerId))
    .leftJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId))
    .where(and(eq(schema.bookings.id, id), eq(schema.bookings.customerId, u.id)));
  if (!row) notFound();
  const { b, svc } = row;
  const [settings, history, media, quotes, payments, [country], [review]] = await Promise.all([
    getSettings(),
    bookingHistory(b.id),
    db.select().from(schema.bookingMedia).where(eq(schema.bookingMedia.bookingId, b.id)),
    db.select().from(schema.bookingQuotes).where(eq(schema.bookingQuotes.bookingId, b.id)).orderBy(desc(schema.bookingQuotes.createdAt)),
    db.select().from(schema.payments).where(eq(schema.payments.bookingId, b.id)).orderBy(desc(schema.payments.createdAt)),
    db.select().from(schema.countries).where(eq(schema.countries.code, b.countryCode)),
    db.select().from(schema.reviews).where(and(eq(schema.reviews.bookingId, b.id), eq(schema.reviews.authorId, u.id))),
  ]);
  const pendingQuote = quotes.find((q) => q.status === "pending");
  const providers = providersFor(country?.paymentProviders ?? [], b.currency).map((p) => ({ key: p.key, label: p.label, description: p.description }));
  const due = amountDue(b, "full");
  const pendingManual = payments.find((p) => p.provider === "manual" && p.status === "pending");
  const cancellable = ["awaiting_quote", "quoted", "awaiting_payment", "pending_assignment", "assigned", "accepted"].includes(b.status);
  const hoursToStart = (b.scheduledStart.getTime() - Date.now()) / 3600_000;
  const policy = b.amountPaid === 0 ? "Nothing has been paid yet, so there's no charge." : hoursToStart >= settings.booking.freeCancellationHours ? "You'll receive a full refund." : `This is within ${settings.booking.freeCancellationHours} hours of the start, so ${settings.booking.lateCancellationFeePercent}% of the booking value is kept to cover the gardener's reserved time.`;
  const payMsg = sp.payment ? PAYMENT_MSG[sp.payment] : null;
  const photos = (k: string) => media.filter((m) => m.kind === k);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Bookings", href: "/account/bookings" }, { label: b.reference }]} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{svc.name}</h1>
          <p className="mt-1 text-ink-muted">{formatDateTime(b.scheduledStart)} · {b.address.line1}, {b.address.city}</p>
        </div>
        <StatusBadge status={b.status} />
      </div>
      {sp.created && <Alert tone="success" title="Booking received">{b.status === "awaiting_quote" ? "We'll send your quote shortly – usually within one working day." : "Complete payment below to confirm your booking."}</Alert>}
      {payMsg && <Alert tone={payMsg.tone}>{payMsg.text}</Alert>}
      {pendingManual && <Alert tone="warning" title="Transfer awaiting confirmation">We're checking your transfer {pendingManual.reference} for {formatMoney(pendingManual.amount, pendingManual.currency)}. <Link href={`/pay/manual/${pendingManual.reference}`} className="link">View payment details</Link></Alert>}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {pendingQuote && (
            <Card className="border-forest-300">
              <CardHeader title="Your quote is ready" description={pendingQuote.validUntil ? `Valid until ${formatDateTime(pendingQuote.validUntil)}` : undefined} />
              <div className="p-5">
                <p className="text-3xl font-bold">{formatMoney(pendingQuote.amount, pendingQuote.currency)} <span className="text-base font-normal text-ink-muted">+ taxes</span></p>
                {pendingQuote.estimatedHours && <p className="mt-1 text-sm text-ink-muted">Estimated {pendingQuote.estimatedHours} hours</p>}
                {pendingQuote.note && <p className="mt-3 whitespace-pre-wrap text-ink-soft">{pendingQuote.note}</p>}
                {pendingQuote.gardenerId && b.status === "assigned" && <p className="mt-3 text-sm text-ink-muted">Your gardener proposed this revised price after reviewing the job. Accepting confirms them for the booking.</p>}
                <div className="mt-5 flex flex-wrap gap-2">
                  <ActionButton action={quoteResponse} fields={{ quoteId: pendingQuote.id, accept: "1" }} variant="primary" size="md">Accept quote</ActionButton>
                  <ActionButton action={quoteResponse} fields={{ quoteId: pendingQuote.id, accept: "0" }} variant="outline" size="md" confirm="Decline this quote?">Decline</ActionButton>
                </div>
              </div>
            </Card>
          )}
          {due > 0 && !pendingManual && b.status !== "awaiting_quote" && b.status !== "quoted" && (
            <Card>
              <CardHeader title={b.status === "awaiting_payment" ? "Pay to confirm your booking" : "Pay the remaining balance"} description={b.status === "awaiting_confirmation" ? "Pay the balance to confirm the job is complete." : undefined} />
              <div className="p-5">
                <PaymentPanel purpose="booking" subjectId={b.id} currency={b.currency} providers={providers} full={due} deposit={b.status === "awaiting_payment" ? b.depositAmount : undefined} balance={b.status !== "awaiting_payment"} />
              </div>
            </Card>
          )}
          {b.status === "awaiting_confirmation" && (
            <Card>
              <CardHeader title="Is the job done?" description="Your gardener has marked this job as complete. Check the photos below." />
              <div className="flex flex-wrap gap-2 p-5">
                {b.amountPaid >= b.total && <ActionButton action={confirmMyBooking} fields={{ bookingId: b.id }} variant="primary" size="md">Yes, confirm completion</ActionButton>}
                <DisputeBooking bookingId={b.id} />
                <p className="w-full text-xs text-ink-muted">If you do nothing, the job is confirmed automatically after {settings.booking.autoCompleteHours} hours.</p>
              </div>
            </Card>
          )}
          {b.status === "completed" && row.gardener && !review && (
            <Card><CardHeader title={`How did ${row.gName?.split(" ")[0]} do?`} /><div className="p-5"><ReviewForm action={reviewMyGardener} hidden={{ bookingId: b.id }} /></div></Card>
          )}
          {(photos("before").length > 0 || photos("after").length > 0 || photos("request").length > 0) && (
            <Card>
              <CardHeader title="Photos" />
              <div className="space-y-4 p-5">
                {(["request", "before", "after"] as const).map((k) => photos(k).length > 0 && (
                  <div key={k}>
                    <p className="mb-2 text-sm font-medium">{k === "request" ? "Your photos" : titleCase(k)}</p>
                    <div className="flex flex-wrap gap-2">{photos(k).map((m) => <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="relative h-28 w-28 overflow-hidden rounded-md bg-sand-100"><Image src={m.url} alt="" fill sizes="112px" className="object-cover" /></a>)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Timeline" />
            <ol className="space-y-4 p-5">
              {history.map(({ h, actor }) => (
                <li key={h.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-forest-500" />
                  <div><p className="font-medium">{titleCase(h.toStatus)}{h.note ? <span className="font-normal text-ink-soft"> – {h.note}</span> : null}</p><p className="text-xs text-ink-muted">{formatDateTime(h.createdAt)}{actor ? ` · ${actor === u.fullName ? "You" : actor}` : ""}</p></div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Summary" />
            <div className="px-5 py-2">
              <DescriptionList items={[
                ["Reference", b.reference],
                ["Subtotal", b.subtotal ? formatMoney(b.subtotal, b.currency) : "Awaiting quote"],
                ...(b.discount ? [["Discount", `−${formatMoney(b.discount, b.currency)}`] as [string, string]] : []),
                ["Taxes", formatMoney(b.tax, b.currency)],
                ["Total", <strong key="t">{formatMoney(b.total, b.currency)}</strong>],
                ["Paid", formatMoney(b.amountPaid, b.currency)],
                ...(b.amountRefunded ? [["Refunded", formatMoney(b.amountRefunded, b.currency)] as [string, string]] : []),
                ["Payment", <StatusBadge key="p" status={b.paymentState} />],
              ]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Your gardener" />
            <div className="p-5">
              {row.gardener ? (
                <>
                  <div className="flex items-center gap-3"><Avatar name={row.gName!} src={row.gAvatar} size={48} /><div><p className="font-semibold">{row.gName}</p><p className="text-sm text-ink-muted">{row.gardener.headline}</p></div></div>
                  {b.status === "assigned" && <p className="mt-3 text-sm text-ink-muted">Waiting for {row.gName?.split(" ")[0]} to accept.</p>}
                  <div className="mt-4"><ActionButton action={messageGardener} fields={{ bookingId: b.id }} variant="outline" size="md">Message gardener</ActionButton></div>
                </>
              ) : <p className="text-sm text-ink-muted">{b.status === "pending_assignment" ? "We're finding the best available gardener." : "A gardener is assigned after payment."}</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Job details" />
            <div className="space-y-2 p-5 text-sm">
              <p className="whitespace-pre-wrap text-ink-soft">{b.details}</p>
              {b.gardenSizeSqm && <p className="text-ink-muted">Garden size: {b.gardenSizeSqm} m²</p>}
              {b.customerNotes && <p className="text-ink-muted">Notes: {b.customerNotes}</p>}
              <p className="text-ink-muted">Contact: {b.contactPhone}</p>
            </div>
          </Card>
          {cancellable && (
            <div className="flex flex-wrap gap-2">
              <RescheduleBooking bookingId={b.id} minDate={addDaysStr(zonedInfo(new Date(), "Africa/Accra").date, 1)} />
              <CancelBooking bookingId={b.id} policy={policy} />
            </div>
          )}
          <p className="text-sm text-ink-muted">Need help? <Link href={`/account/support?booking=${b.id}`} className="link">Contact support</Link></p>
        </div>
      </div>
    </div>
  );
}
