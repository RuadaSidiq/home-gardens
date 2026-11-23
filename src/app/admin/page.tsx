import Link from "next/link";
import { requirePermission } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { bookingSeries, dashboardMetrics, parseRange, recentActivity, revenueByCategory, revenueSeries } from "@/server/queries/admin";
import { Card, CardHeader, PageHeader, Stat, StatusBadge, staffStatusLabel } from "@/components/ui/primitives";
import { ChartMoney } from "@/components/admin/chart-format";
import { RangeFilter } from "@/components/admin/range-filter";
import { formatMoney } from "@/lib/money";
import { relativeTime, titleCase } from "@/lib/utils";

export const metadata = { title: "Admin dashboard" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const u = await requirePermission("dashboard.view");
  const sp = await searchParams;
  const range = parseRange(sp.range, sp.from, sp.to);
  const { finance } = await getSettings();
  const base = finance.baseCurrency;
  const canFinance = u.permissions.has("reports.view") || u.permissions.has("payments.view");
  const [m, rev, bk, cats, recent] = await Promise.all([dashboardMetrics(range, base), revenueSeries(range, base), bookingSeries(range), revenueByCategory(range, base), recentActivity()]);
  const money = (n: number) => formatMoney(n, base, { noDecimals: true });
  const alerts = [
    m.people.pendingApplications && { href: "/admin/gardeners?status=pending", t: `${m.people.pendingApplications} gardener application(s) to review` },
    m.people.manualPending && { href: "/admin/payments?status=pending&provider=manual", t: `${m.people.manualPending} bank/MoMo transfer(s) to verify` },
    m.people.payoutRequests && { href: "/admin/payouts", t: `${m.people.payoutRequests} payout request(s)` },
    m.people.openTickets && { href: "/admin/support", t: `${m.people.openTickets} open support ticket(s)` },
    m.people.lowStock && { href: "/admin/inventory?low=1", t: `${m.people.lowStock} variant(s) at or below low-stock threshold` },
    m.bookings.disputed && { href: "/admin/bookings?status=disputed", t: `${m.bookings.disputed} disputed booking(s)` },
  ].filter(Boolean) as { href: string; t: string }[];
  return (
    <>
      <PageHeader title="Dashboard" description={`All money in ${base} at current exchange rates. Figures come from recorded transactions.`} actions={<RangeFilter base="/admin" current={range.key} from={sp.from} to={sp.to} />} />
      {alerts.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">{alerts.map((a) => <Link key={a.href} href={a.href} className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm font-medium text-sand-900 hover:bg-amber-400/20">{a.t} →</Link>)}</div>
      )}
      {canFinance && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Collected (net of refunds)" value={money(m.collected)} className="col-span-2 lg:col-span-1" />
          <Stat label="Service revenue" value={money(m.streams.services)} />
          <Stat label="Product revenue" value={money(m.streams.products)} />
          <Stat label="Activity revenue" value={money(m.streams.activities)} />
          <Stat label="Company revenue" value={money(m.companyRevenue)} hint="After gardener and vendor shares" />
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Bookings" value={m.bookings.total} />
        <Stat label="Pending" value={m.bookings.pending} />
        <Stat label="Completed" value={m.bookings.completed} />
        <Stat label="Cancelled" value={m.bookings.cancelled} />
        <Stat label="Orders" value={m.orders.total} hint={`${m.orders.pending} open`} />
        <Stat label="Customers" value={m.people.customers} hint={`+${m.people.newCustomers} in period`} />
        <Stat label="Active gardeners" value={m.people.activeGardeners} hint={`${m.people.pendingApplications} pending`} />
        <Stat label="Owed to gardeners" value={money(m.outstandingPayouts)} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {canFinance && <Card className="xl:col-span-2"><CardHeader title="Revenue collected" description={range.days > 92 ? "Weekly, by stream" : "Daily, by stream"} /><div className="p-5"><ChartMoney kind="stacked" labels={rev.labels} series={rev.series} currency={base} /></div></Card>}
        <Card className={canFinance ? "" : "xl:col-span-3"}><CardHeader title="New bookings" /><div className="p-5"><ChartMoney kind="stacked" labels={bk.labels} series={bk.series} height={canFinance ? 300 : 220} /></div></Card>
      </div>
      {canFinance && (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Card><CardHeader title="Service revenue by category" /><div className="p-5"><ChartMoney kind="hbars" rows={cats.services} currency={base} /></div></Card>
          <Card><CardHeader title="Product sales by category" /><div className="p-5"><ChartMoney kind="hbars" rows={cats.products} currency={base} /></div></Card>
        </div>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Recent bookings" action={<Link href="/admin/bookings" className="text-sm link">All</Link>} />
          <ul className="divide-y divide-sand-100">{recent.bookings.map(({ b, service, customer }) => <li key={b.id}><Link href={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-sand-50"><span className="min-w-0"><span className="block truncate font-medium">{service}</span><span className="text-xs text-ink-muted">{customer} · {relativeTime(b.createdAt)}</span></span><StatusBadge status={b.status} label={staffStatusLabel(b.status)} /></Link></li>)}{recent.bookings.length === 0 && <li className="px-5 py-6 text-sm text-ink-muted">No bookings yet.</li>}</ul>
        </Card>
        <Card>
          <CardHeader title="Recent orders" action={<Link href="/admin/orders" className="text-sm link">All</Link>} />
          <ul className="divide-y divide-sand-100">{recent.orders.map(({ o, customer }) => <li key={o.id}><Link href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-sand-50"><span><span className="block font-medium">{o.reference}</span><span className="text-xs text-ink-muted">{customer} · {formatMoney(o.total, o.currency)}</span></span><StatusBadge status={o.status} /></Link></li>)}{recent.orders.length === 0 && <li className="px-5 py-6 text-sm text-ink-muted">No orders yet.</li>}</ul>
        </Card>
        {canFinance && (
          <Card>
            <CardHeader title="Recent transactions" action={<Link href="/admin/payments" className="text-sm link">All</Link>} />
            <ul className="divide-y divide-sand-100">{recent.payments.map(({ p, user }) => <li key={p.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm"><span><span className="block font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</span><span className="text-xs text-ink-muted">{user} · {titleCase(p.provider)} · {relativeTime(p.createdAt)}</span></span><StatusBadge status={p.status} /></li>)}{recent.payments.length === 0 && <li className="px-5 py-6 text-sm text-ink-muted">No transactions yet.</li>}</ul>
          </Card>
        )}
      </div>
    </>
  );
}
