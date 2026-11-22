import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "./print-button";

export const metadata = { title: "Invoice" };

/** Printable invoice for a booking, order or activity registration owned by the user. */
export default async function Invoice({ params }: { params: Promise<{ reference: string }> }) {
  const u = await requireUser();
  const ref = decodeURIComponent((await params).reference);
  const settings = await getSettings();
  let lines: { desc: string; qty: number; unit: number; total: number }[] = [];
  let meta: { date: Date; currency: string; subtotal: number; discount: number; shipping: number; tax: number; total: number; paid: number; refunded: number; to: string } | null = null;
  const [b] = await db.select({ b: schema.bookings, svc: schema.services.name }).from(schema.bookings).innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId)).where(and(eq(schema.bookings.reference, ref), eq(schema.bookings.customerId, u.id)));
  if (b) {
    lines = [{ desc: `${b.svc} – ${formatDate(b.b.scheduledStart)}`, qty: 1, unit: b.b.subtotal, total: b.b.subtotal }];
    meta = { date: b.b.createdAt, currency: b.b.currency, subtotal: b.b.subtotal, discount: b.b.discount, shipping: 0, tax: b.b.tax, total: b.b.total, paid: b.b.amountPaid, refunded: b.b.amountRefunded, to: `${b.b.address.line1}, ${b.b.address.city}` };
  }
  const [o] = !meta ? await db.select().from(schema.orders).where(and(eq(schema.orders.reference, ref), eq(schema.orders.userId, u.id))) : [];
  if (o) {
    const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
    lines = items.map((i) => ({ desc: `${i.name}${i.variantName ? ` (${i.variantName})` : ""}`, qty: i.quantity, unit: i.unitPrice, total: i.lineTotal }));
    meta = { date: o.createdAt, currency: o.currency, subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, tax: o.tax, total: o.total, paid: o.amountPaid, refunded: o.amountRefunded, to: `${o.shippingAddress.line1}, ${o.shippingAddress.city}` };
  }
  const [r] = !meta ? await db.select({ r: schema.activityRegistrations, title: schema.activities.title, price: schema.activities.price }).from(schema.activityRegistrations).innerJoin(schema.activitySessions, eq(schema.activitySessions.id, schema.activityRegistrations.sessionId)).innerJoin(schema.activities, eq(schema.activities.id, schema.activitySessions.activityId)).where(and(eq(schema.activityRegistrations.reference, ref), eq(schema.activityRegistrations.userId, u.id))) : [];
  if (r) {
    lines = [{ desc: r.title, qty: r.r.quantity, unit: r.price, total: r.r.amount }];
    meta = { date: r.r.createdAt, currency: r.r.currency, subtotal: r.r.amount, discount: 0, shipping: 0, tax: 0, total: r.r.amount, paid: r.r.paymentState === "paid" ? r.r.amount : 0, refunded: r.r.paymentState === "refunded" ? r.r.amount : 0, to: "" };
  }
  if (!meta) notFound();
  const m = (n: number) => formatMoney(n, meta!.currency);
  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-sand-200 bg-white p-8 print:border-0 print:p-0">
      <div className="flex justify-between gap-4">
        <div><p className="font-display text-xl font-bold text-forest-700">{settings.company.name}</p><p className="text-sm text-ink-muted">{settings.company.legalName}<br />{settings.company.address}<br />{settings.company.email}</p></div>
        <div className="text-right"><p className="text-2xl font-bold">Invoice</p><p className="text-sm text-ink-muted">{ref}<br />{formatDate(meta.date)}</p></div>
      </div>
      <div className="mt-8 text-sm"><p className="font-semibold">Billed to</p><p className="text-ink-soft">{u.fullName}<br />{u.email}{meta.to ? <><br />{meta.to}</> : null}</p></div>
      <table className="mt-8 w-full text-sm">
        <thead className="border-b border-sand-300 text-left"><tr><th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit</th><th className="py-2 text-right">Amount</th></tr></thead>
        <tbody>{lines.map((l, i) => <tr key={i} className="border-b border-sand-100"><td className="py-2">{l.desc}</td><td className="py-2 text-right">{l.qty}</td><td className="py-2 text-right">{m(l.unit)}</td><td className="py-2 text-right">{m(l.total)}</td></tr>)}</tbody>
      </table>
      <dl className="ml-auto mt-4 w-64 space-y-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{m(meta.subtotal)}</dd></div>
        {meta.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{m(meta.discount)}</dd></div>}
        {meta.shipping > 0 && <div className="flex justify-between"><dt>Delivery</dt><dd>{m(meta.shipping)}</dd></div>}
        <div className="flex justify-between"><dt>Taxes</dt><dd>{m(meta.tax)}</dd></div>
        <div className="flex justify-between border-t border-sand-300 pt-1 font-bold"><dt>Total</dt><dd>{m(meta.total)}</dd></div>
        <div className="flex justify-between"><dt>Paid</dt><dd>{m(meta.paid)}</dd></div>
        {meta.refunded > 0 && <div className="flex justify-between"><dt>Refunded</dt><dd>{m(meta.refunded)}</dd></div>}
      </dl>
      <div className="mt-8 print:hidden"><PrintButton /></div>
    </div>
  );
}
