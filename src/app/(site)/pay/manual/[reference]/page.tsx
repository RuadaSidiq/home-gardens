import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { formatMoney } from "@/lib/money";
import { StatusBadge, Alert } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Bank or Mobile Money transfer" };

export default async function ManualPay({ params }: { params: Promise<{ reference: string }> }) {
  const user = await requireUser();
  const { reference } = await params;
  const [p] = await db.select().from(schema.payments).where(and(eq(schema.payments.reference, decodeURIComponent(reference)), eq(schema.payments.userId, user.id)));
  if (!p || p.provider !== "manual") notFound();
  const back = p.bookingId ? `/account/bookings/${p.bookingId}` : p.orderId ? `/account/orders/${p.orderId}` : "/account/activities";
  const instructions = process.env.MANUAL_PAYMENT_INSTRUCTIONS ?? "Contact us for bank and Mobile Money details.";
  return (
    <div className="container max-w-xl py-12">
      <h1 className="text-2xl font-bold">Complete your transfer</h1>
      <p className="mt-2 text-ink-soft">Send the exact amount below and use the reference as the payment description. Our finance team confirms transfers during working hours, usually within 2–4 hours.</p>
      <div className="mt-6 rounded-lg border border-sand-200 bg-white p-5 shadow-card">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between"><dt className="text-ink-muted">Amount</dt><dd className="text-xl font-bold">{formatMoney(p.amount, p.currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">Reference</dt><dd className="font-mono text-base font-semibold">{p.reference}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">Status</dt><dd><StatusBadge status={p.status === "pending" ? "pending" : p.status} label={p.status === "pending" ? "Awaiting confirmation" : undefined} /></dd></div>
        </dl>
        <div className="mt-5 rounded-md bg-sand-50 p-4 text-sm text-ink-soft">{instructions}</div>
      </div>
      <Alert tone="info" className="mt-4">You'll get a notification as soon as the payment is confirmed. Unconfirmed shop orders are held for 60 minutes; contact us if your transfer will take longer.</Alert>
      <div className="mt-6 flex gap-3"><ButtonLink href={back}>I've sent the payment</ButtonLink><Link href="/contact" className="inline-flex items-center text-sm link">Need help?</Link></div>
    </div>
  );
}
