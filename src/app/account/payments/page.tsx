import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDateTime, titleCase } from "@/lib/utils";

export const metadata = { title: "Payments" };

export default async function Payments() {
  const u = await requireUser();
  const rows = await db
    .select({ p: schema.payments, booking: schema.bookings.reference, order: schema.orders.reference, reg: schema.activityRegistrations.reference })
    .from(schema.payments)
    .leftJoin(schema.bookings, eq(schema.bookings.id, schema.payments.bookingId))
    .leftJoin(schema.orders, eq(schema.orders.id, schema.payments.orderId))
    .leftJoin(schema.activityRegistrations, eq(schema.activityRegistrations.id, schema.payments.registrationId))
    .where(eq(schema.payments.userId, u.id))
    .orderBy(desc(schema.payments.createdAt));
  const refunds = await db.select({ r: schema.refunds }).from(schema.refunds).innerJoin(schema.payments, eq(schema.payments.id, schema.refunds.paymentId)).where(eq(schema.payments.userId, u.id));
  return (
    <>
      <PageHeader title="Payments & invoices" description="We never store your card details – payments are processed by our payment partners." />
      {rows.length === 0 ? <EmptyState title="No payments yet" /> : (
        <table className="rtable w-full text-sm">
          <thead className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">For</th><th className="py-2 pr-4">Method</th><th className="py-2 pr-4">Amount</th><th className="py-2 pr-4">Status</th><th className="py-2" /></tr></thead>
          <tbody className="md:divide-y md:divide-sand-100">
            {rows.map(({ p, booking, order, reg }) => {
              const ref = booking ?? order ?? reg ?? "";
              const refunded = refunds.filter((r) => r.r.paymentId === p.id).reduce((s, r) => s + r.r.amount, 0);
              return (
                <tr key={p.id}>
                  <td data-label="Date" className="py-3 pr-4">{formatDateTime(p.createdAt)}</td>
                  <td data-label="For" className="py-3 pr-4">{titleCase(p.purpose)} {ref} {p.kind !== "full" && <span className="text-ink-muted">({p.kind})</span>}</td>
                  <td data-label="Method" className="py-3 pr-4">{titleCase(p.provider)}{p.channel ? ` · ${titleCase(p.channel)}` : ""}</td>
                  <td data-label="Amount" className="py-3 pr-4 tabular-nums">{formatMoney(p.amount, p.currency)}{refunded ? <span className="block text-xs text-ink-muted">Refunded {formatMoney(refunded, p.currency)}</span> : null}</td>
                  <td data-label="Status" className="py-3 pr-4"><StatusBadge status={p.status} /></td>
                  <td data-label="" className="py-3">{p.status !== "initiated" && p.status !== "failed" && ref && <Link href={`/account/invoices/${ref}`} className="link">Invoice</Link>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
