import Link from "next/link";
import { eq } from "drizzle-orm";
import { CheckCircle2, Circle } from "lucide-react";
import { db, schema } from "@/db";
import { requireGardener } from "@/server/auth/session";
import { gardenerJobs, gardenerStats } from "@/server/queries/gardener";
import { walletsFor } from "@/server/finance";
import { Alert, Card, CardHeader, EmptyState, Stat, StatusBadge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";

import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { ResubmitForm } from "./resubmit";

export const metadata = { title: "Gardener dashboard" };

export default async function GardenerDashboard({ searchParams }: { searchParams: Promise<{ applied?: string }> }) {
  const u = await requireGardener();
  const { applied } = await searchParams;
  const [g] = await db.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, u.gardenerId));
  if (!g) return null;
  if (g.status !== "approved") {
    const [docs, avail, svcs] = await Promise.all([
      db.select().from(schema.gardenerDocuments).where(eq(schema.gardenerDocuments.gardenerId, g.id)),
      db.select().from(schema.gardenerAvailability).where(eq(schema.gardenerAvailability.gardenerId, g.id)),
      db.select().from(schema.gardenerServices).where(eq(schema.gardenerServices.gardenerId, g.id)),
    ]);
    const steps = [
      { done: true, t: "Application submitted" },
      { done: docs.length > 0, t: "Identity document uploaded" },
      { done: svcs.length > 0 && avail.length > 0, t: "Services and availability set" },
      { done: docs.some((d) => d.status === "verified"), t: "Documents verified by our team" },
      { done: false, t: "Profile approved and live" },
    ];
    return (
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">Your application</h1>
        {applied && <Alert tone="success" title="Application received">Thanks for applying. We review applications within 3 working days and will notify you by email and SMS.</Alert>}
        {g.status === "pending" && <Alert tone="info" title="Under review">Our team is reviewing your profile. You can keep improving your profile and portfolio in the meantime.</Alert>}
        {g.status === "info_requested" && <Alert tone="warning" title="We need more information">{g.reviewNote}</Alert>}
        {g.status === "rejected" && <Alert tone="error" title="Application not approved">{g.reviewNote ?? "Contact support for details."}</Alert>}
        {g.status === "suspended" && <Alert tone="error" title="Account suspended">{g.reviewNote ?? "Contact support for details."} You won't receive new jobs while suspended.</Alert>}
        <Card className="p-5">
          <ol className="space-y-3">{steps.map((s) => <li key={s.t} className="flex items-center gap-3 text-sm">{s.done ? <CheckCircle2 className="h-5 w-5 text-forest-600" /> : <Circle className="h-5 w-5 text-sand-300" />}<span className={s.done ? "" : "text-ink-muted"}>{s.t}</span></li>)}</ol>
        </Card>
        {g.status === "info_requested" && <Card><CardHeader title="Send the requested information" /><div className="p-5"><ResubmitForm /></div></Card>}
        <div className="flex flex-wrap gap-2"><ButtonLink href="/gardener/profile" variant="outline">Edit profile</ButtonLink><ButtonLink href="/gardener/support" variant="ghost">Contact support</ButtonLink></div>
      </div>
    );
  }
  const [stats, requests, upcoming, active, wallets] = await Promise.all([
    gardenerStats(g.id),
    gardenerJobs(g.id, ["assigned"], 5),
    gardenerJobs(g.id, ["accepted"], 5),
    gardenerJobs(g.id, ["in_progress"], 3),
    walletsFor(g.id),
  ]);
  const w = wallets.find((x) => x.currency === g.currency);
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Good to see you, {u.fullName.split(" ")[0]}</h1><p className="text-ink-muted">{g.headline}</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Upcoming jobs" value={stats.upcoming} />
        <Stat label="Completed this month" value={stats.thisMonth} />
        {g.type === "independent" ? <><Stat label="Earned this month" value={formatMoney(stats.earnedThisMonth, g.currency)} /><Stat label="Available to withdraw" value={formatMoney(w?.availableBalance ?? 0, g.currency)} hint={w?.pendingBalance ? `${formatMoney(w.pendingBalance, g.currency)} pending` : undefined} /></> : <><Stat label="Jobs completed" value={stats.completed} /><Stat label="Rating" value={g.ratingCount ? Number(g.ratingAvg).toFixed(1) : "—"} hint={`${g.ratingCount} reviews`} /></>}
      </div>
      {active.length > 0 && (
        <Card className="border-forest-300"><CardHeader title="In progress" /><ul className="divide-y divide-sand-100">{active.map(({ b, service }) => <li key={b.id}><Link href={`/gardener/jobs/${b.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-sand-50"><span><span className="block font-medium">{service}</span><span className="text-sm text-ink-muted">{b.address.line1}, {b.address.city}</span></span><span className="text-sm font-semibold text-forest-700">Continue →</span></Link></li>)}</ul></Card>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="New job requests" description={g.type === "independent" ? "Accept or decline – the customer is waiting." : undefined} action={<Link href="/gardener/jobs?tab=requests" className="text-sm link">All</Link>} />
          {requests.length === 0 ? <div className="p-5"><EmptyState title="No new requests" description="Keep your availability up to date to receive more jobs." /></div> : (
            <ul className="divide-y divide-sand-100">{requests.map(({ b, service }) => <li key={b.id}><Link href={`/gardener/jobs/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-sand-50"><span><span className="block font-medium">{service}</span><span className="text-sm text-ink-muted">{formatDateTime(b.scheduledStart)} · {b.address.city}</span></span><StatusBadge status="offered" label="Respond" /></Link></li>)}</ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Upcoming schedule" action={<Link href="/gardener/jobs?tab=upcoming" className="text-sm link">All</Link>} />
          {upcoming.length === 0 ? <div className="p-5"><EmptyState title="Nothing scheduled" /></div> : (
            <ul className="divide-y divide-sand-100">{upcoming.map(({ b, service, customer }) => <li key={b.id}><Link href={`/gardener/jobs/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-sand-50"><span><span className="block font-medium">{service}</span><span className="text-sm text-ink-muted">{formatDateTime(b.scheduledStart)} · {customer.split(" ")[0]} · {b.address.city}</span></span></Link></li>)}</ul>
          )}
        </Card>
      </div>
    </div>
  );
}
