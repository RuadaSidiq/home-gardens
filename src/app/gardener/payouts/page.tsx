import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireGardener } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { releaseMaturedCommissions, walletsFor } from "@/server/finance";
import { Alert, Card, CardHeader, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PayoutMethodForm, PayoutRequest } from "./forms";

export const metadata = { title: "Payouts" };

export default async function Payouts() {
  const u = await requireGardener();
  if (u.gardenerType !== "independent") return <><PageHeader title="Payouts" /><Alert tone="info">Company gardeners are paid through payroll.</Alert></>;
  await releaseMaturedCommissions(u.gardenerId);
  const [settings, wallets, [g], list] = await Promise.all([
    getSettings(), walletsFor(u.gardenerId),
    db.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, u.gardenerId)),
    db.select().from(schema.payouts).where(eq(schema.payouts.gardenerId, u.gardenerId)).orderBy(desc(schema.payouts.createdAt)),
  ]);
  const w = wallets.find((x) => x.currency === g!.currency);
  return (
    <>
      <PageHeader title="Payouts" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Withdraw earnings" description={`Minimum payout ${formatMoney(settings.finance.minimumPayout, g!.currency)}.`} />
          <div className="space-y-3 p-5">
            <p className="text-3xl font-bold">{formatMoney(w?.availableBalance ?? 0, g!.currency)} <span className="text-base font-normal text-ink-muted">available</span></p>
            {g!.payoutMethodSummary ? <p className="text-sm text-ink-muted">Paid to {g!.payoutMethodSummary}</p> : <Alert tone="warning">Add payout details below first.</Alert>}
            <PayoutRequest available={w?.availableBalance ?? 0} currency={g!.currency} minimum={settings.finance.minimumPayout} />
          </div>
        </Card>
        <Card><CardHeader title="Payout details" description="Stored encrypted; only shown masked." /><div className="p-5"><PayoutMethodForm /></div></Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">History</h2>
      {list.length === 0 ? <EmptyState title="No payouts yet" /> : (
        <table className="rtable w-full text-sm">
          <thead className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="py-2 pr-3">Reference</th><th className="py-2 pr-3">Requested</th><th className="py-2 pr-3">Amount</th><th className="py-2 pr-3">To</th><th className="py-2">Status</th></tr></thead>
          <tbody className="md:divide-y md:divide-sand-100">{list.map((p) => (
            <tr key={p.id}><td data-label="" className="rt-primary py-3 pr-3">{p.reference}</td><td data-label="Requested" className="py-3 pr-3">{formatDate(p.createdAt)}</td><td data-label="Amount" className="py-3 pr-3 tabular-nums">{formatMoney(p.amount, p.currency)}</td><td data-label="To" className="py-3 pr-3">{p.methodSummary}</td><td data-label="Status" className="py-3"><StatusBadge status={p.status} />{p.providerReference && <span className="block text-xs text-ink-muted">Ref {p.providerReference}</span>}{p.status === "rejected" && p.note && <span className="block text-xs text-clay-600">{p.note}</span>}</td></tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}
