import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { Card, CardHeader, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { DataTable } from "@/components/admin/table";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { RuleForm } from "./forms";

export const metadata = { title: "Commissions" };

export default async function Commissions() {
  await requirePermission("commissions.manage");
  const [rules, cats, countries, recent, balances, settings] = await Promise.all([
    db.select().from(schema.commissionRules).orderBy(schema.commissionRules.id),
    db.select({ id: schema.serviceCategories.id, name: schema.serviceCategories.name }).from(schema.serviceCategories),
    db.select({ code: schema.countries.code }).from(schema.countries),
    db.select({ c: schema.commissions, ref: schema.bookings.reference, name: schema.users.fullName }).from(schema.commissions).innerJoin(schema.bookings, eq(schema.bookings.id, schema.commissions.bookingId)).innerJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.commissions.gardenerId)).innerJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId)).orderBy(desc(schema.commissions.createdAt)).limit(50),
    db.select({ w: schema.gardenerWallets, name: schema.users.fullName, gid: schema.gardenerProfiles.id }).from(schema.gardenerWallets).innerJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.gardenerWallets.gardenerId)).innerJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId)).where(sql`${schema.gardenerWallets.pendingBalance} + ${schema.gardenerWallets.availableBalance} + ${schema.gardenerWallets.reservedBalance} > 0`),
    getSettings(),
  ]);
  return (
    <>
      <PageHeader title="Commissions" description={`The most specific active rule applies (category + country, then category, then country, then default). Fallback: ${settings.finance.defaultCommissionBps / 100}%. Company gardener jobs don't earn commission.`} />
      <Card>
        <CardHeader title="Rules" />
        <div className="divide-y divide-sand-100">{rules.map((r) => <div key={r.id} className="px-5 py-3"><RuleForm r={r} categories={cats} countries={countries.map((c) => c.code)} /></div>)}<div className="bg-sand-50 px-5 py-3"><RuleForm categories={cats} countries={countries.map((c) => c.code)} /></div></div>
      </Card>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Outstanding gardener balances</h2>
      <DataTable rows={balances} rowKey={(r) => r.w.gardenerId + r.w.currency} empty="No outstanding balances" columns={[
        { header: "Gardener", primary: true, cell: (r) => <Link href={`/admin/gardeners/${r.gid}`} className="font-medium hover:text-forest-700">{r.name}</Link> },
        { header: "Pending release", align: "right", cell: (r) => formatMoney(r.w.pendingBalance, r.w.currency) },
        { header: "Available", align: "right", cell: (r) => formatMoney(r.w.availableBalance, r.w.currency) },
        { header: "Payout requested", align: "right", cell: (r) => formatMoney(r.w.reservedBalance, r.w.currency) },
        { header: "Paid to date", align: "right", cell: (r) => formatMoney(r.w.totalPaidOut, r.w.currency) },
      ]} />
      <h2 className="mb-3 mt-8 text-lg font-semibold">Recent commissions</h2>
      <DataTable rows={recent} rowKey={(r) => r.c.id} empty="No commissions recorded yet" columns={[
        { header: "Booking", primary: true, cell: (r) => <Link href={`/admin/bookings/${r.c.bookingId}`} className="font-medium hover:text-forest-700">{r.ref}</Link> },
        { header: "Gardener", cell: (r) => r.name },
        { header: "Date", cell: (r) => formatDate(r.c.createdAt) },
        { header: "Net job value", align: "right", cell: (r) => formatMoney(r.c.grossAmount, r.c.currency) },
        { header: "Rate", align: "right", cell: (r) => `${r.c.rateBps / 100}%` },
        { header: "Commission", align: "right", cell: (r) => formatMoney(r.c.commissionAmount, r.c.currency) },
        { header: "Gardener share", align: "right", cell: (r) => formatMoney(r.c.gardenerAmount, r.c.currency) },
        { header: "Status", cell: (r) => <StatusBadge status={r.c.status} /> },
      ]} />
    </>
  );
}
