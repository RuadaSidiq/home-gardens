import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireGardener } from "@/server/auth/session";
import { releaseMaturedCommissions, walletsFor } from "@/server/finance";
import { EmptyState, PageHeader, Stat, StatusBadge, Alert } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Earnings" };

export default async function Earnings() {
  const u = await requireGardener();
  if (u.gardenerType !== "independent") return <><PageHeader title="Earnings" /><Alert tone="info">As a company gardener you're paid through payroll. Speak to your supervisor about compensation.</Alert></>;
  await releaseMaturedCommissions(u.gardenerId);
  const [wallets, rows] = await Promise.all([
    walletsFor(u.gardenerId),
    db.select({ c: schema.commissions, reference: schema.bookings.reference, service: schema.services.name }).from(schema.commissions)
      .innerJoin(schema.bookings, eq(schema.bookings.id, schema.commissions.bookingId))
      .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
      .where(eq(schema.commissions.gardenerId, u.gardenerId)).orderBy(desc(schema.commissions.createdAt)).limit(100),
  ]);
  const w = wallets[0];
  const cur = w?.currency ?? "GHS";
  return (
    <>
      <PageHeader title="Earnings" actions={<ButtonLink href="/gardener/payouts" size="sm">Request payout</ButtonLink>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Available" value={formatMoney(w?.availableBalance ?? 0, cur)} />
        <Stat label="Pending release" value={formatMoney(w?.pendingBalance ?? 0, cur)} />
        <Stat label="Payouts in progress" value={formatMoney(w?.reservedBalance ?? 0, cur)} />
        <Stat label="Paid out to date" value={formatMoney(w?.totalPaidOut ?? 0, cur)} />
      </div>
      {rows.length === 0 ? <EmptyState title="No earnings yet" description="Earnings appear here when customers confirm completed jobs." /> : (
        <table className="rtable w-full text-sm">
          <thead className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="py-2 pr-3">Job</th><th className="py-2 pr-3">Date</th><th className="py-2 pr-3 text-right">Job value</th><th className="py-2 pr-3 text-right">Commission</th><th className="py-2 pr-3 text-right">You earn</th><th className="py-2">Status</th></tr></thead>
          <tbody className="md:divide-y md:divide-sand-100">
            {rows.map(({ c, reference, service }) => (
              <tr key={c.id}>
                <td data-label="" className="rt-primary py-3 pr-3"><Link href={`/gardener/jobs/${c.bookingId}`} className="hover:text-forest-700">{service}</Link><span className="block text-xs font-normal text-ink-muted">{reference}</span></td>
                <td data-label="Date" className="py-3 pr-3">{formatDate(c.createdAt)}</td>
                <td data-label="Job value" className="py-3 pr-3 text-right tabular-nums">{formatMoney(c.grossAmount, c.currency)}</td>
                <td data-label="Commission" className="py-3 pr-3 text-right tabular-nums">−{formatMoney(c.commissionAmount, c.currency)} <span className="text-xs text-ink-muted">({c.rateBps / 100}%)</span></td>
                <td data-label="You earn" className="py-3 pr-3 text-right font-semibold tabular-nums">{formatMoney(c.gardenerAmount, c.currency)}</td>
                <td data-label="Status" className="py-3"><StatusBadge status={c.status} label={c.status === "pending" ? `Releases ${formatDate(c.availableAt)}` : undefined} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
