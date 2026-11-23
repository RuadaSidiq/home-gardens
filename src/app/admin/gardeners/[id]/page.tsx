import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { walletsFor } from "@/server/finance";
import { Alert, Avatar, Breadcrumbs, Card, CardHeader, DescriptionList, Stat, StatusBadge, Badge, staffStatusLabel } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, titleCase } from "@/lib/utils";
import { CompanyForm, DecisionForm, DocActions } from "./forms";

export const metadata = { title: "Gardener" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function AdminGardener({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const u = await requirePermission("gardeners.view");
  const { id } = await params;
  const { created } = await searchParams;
  const [row] = await db.select({ g: schema.gardenerProfiles, user: schema.users, city: schema.cities.name }).from(schema.gardenerProfiles).innerJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId)).leftJoin(schema.cities, eq(schema.cities.id, schema.gardenerProfiles.baseCityId)).where(eq(schema.gardenerProfiles.id, id));
  if (!row) notFound();
  const { g } = row;
  const [docs, services, areas, avail, portfolio, jobs, [perf], wallets, reviewer] = await Promise.all([
    db.select({ d: schema.gardenerDocuments, f: schema.files }).from(schema.gardenerDocuments).innerJoin(schema.files, eq(schema.files.id, schema.gardenerDocuments.fileId)).where(eq(schema.gardenerDocuments.gardenerId, g.id)),
    db.select({ name: schema.services.name, customPrice: schema.gardenerServices.customPrice }).from(schema.gardenerServices).innerJoin(schema.services, eq(schema.services.id, schema.gardenerServices.serviceId)).where(eq(schema.gardenerServices.gardenerId, g.id)),
    db.select({ name: schema.cities.name }).from(schema.gardenerServiceAreas).innerJoin(schema.cities, eq(schema.cities.id, schema.gardenerServiceAreas.cityId)).where(eq(schema.gardenerServiceAreas.gardenerId, g.id)),
    db.select().from(schema.gardenerAvailability).where(eq(schema.gardenerAvailability.gardenerId, g.id)),
    db.select().from(schema.gardenerPortfolio).where(eq(schema.gardenerPortfolio.gardenerId, g.id)),
    db.select({ b: schema.bookings, service: schema.services.name }).from(schema.bookings).innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId)).where(eq(schema.bookings.gardenerId, g.id)).orderBy(desc(schema.bookings.scheduledStart)).limit(15),
    db.execute<{ offered: number; accepted: number; rejected: number; completed: number; disputed: number }>(sql`select
      count(*) filter (where a.status <> 'withdrawn')::int as offered, count(*) filter (where a.status = 'accepted')::int as accepted, count(*) filter (where a.status = 'rejected')::int as rejected,
      (select count(*) from bookings where gardener_id = ${g.id} and status = 'completed')::int as completed,
      (select count(*) from support_tickets t join bookings b on b.id = t.booking_id where b.gardener_id = ${g.id} and t.category = 'dispute')::int as disputed
      from booking_assignments a where a.gardener_id = ${g.id}`),
    walletsFor(g.id),
    g.reviewedBy ? db.select({ name: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, g.reviewedBy)) : Promise.resolve([]),
  ]);
  const canReview = u.permissions.has("gardeners.review");
  const acceptance = perf && perf.offered ? Math.round((perf.accepted / perf.offered) * 100) : null;
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Gardeners", href: "/admin/gardeners" }, { label: row.user.fullName }]} />
      {created && <Alert tone="success">Company gardener created. Ask them to use "Forgot password" on the sign-in page to set their password.</Alert>}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={row.user.fullName} src={row.user.avatarUrl} size={64} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{row.user.fullName}</h1><StatusBadge status={g.status} /><Badge tone={g.type === "company" ? "dark" : "neutral"}>{titleCase(g.type)}</Badge></div>
          <p className="text-ink-muted">{g.headline} · {row.user.email} · {row.user.phone}</p>
        </div>
        {g.status === "approved" && <Link href={`/gardeners/${g.slug}`} className="text-sm link" target="_blank">Public profile</Link>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Jobs completed" value={perf?.completed ?? 0} />
        <Stat label="Acceptance rate" value={acceptance != null ? `${acceptance}%` : "—"} hint={`${perf?.offered ?? 0} offers`} />
        <Stat label="Rating" value={g.ratingCount ? Number(g.ratingAvg).toFixed(2) : "—"} hint={`${g.ratingCount} reviews`} />
        <Stat label="Disputes" value={perf?.disputed ?? 0} />
        <Stat label={g.type === "independent" ? "Owed" : "Experience"} value={g.type === "independent" ? formatMoney(wallets.reduce((s, w) => s + w.availableBalance + w.pendingBalance + w.reservedBalance, 0), g.currency) : `${g.yearsExperience} yrs`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Profile" />
            <div className="space-y-3 p-5 text-sm">
              <p className="whitespace-pre-wrap text-ink-soft">{g.bio || "No bio."}</p>
              <DescriptionList items={[["Experience", `${g.yearsExperience} years`], ["Qualifications", g.qualifications ?? "—"], ["Base", row.city ?? "—"], ["Other areas", areas.map((a) => a.name).join(", ") || "—"], ["Hourly rate", g.hourlyRate ? formatMoney(g.hourlyRate, g.currency) : "—"], ["Payout to", g.payoutMethodSummary ?? "—"], ["Availability", avail.map((a) => `${DAYS[a.weekday]} ${a.startTime.slice(0, 5)}–${a.endTime.slice(0, 5)}`).join(", ") || "None set"], ["Services", services.map((s) => s.name + (s.customPrice ? ` (${formatMoney(s.customPrice, g.currency)})` : "")).join(", ")]]} />
            </div>
          </Card>
          {portfolio.length > 0 && <Card><CardHeader title="Portfolio" /><div className="grid grid-cols-3 gap-2 p-5 md:grid-cols-5">{portfolio.map((p) => <div key={p.id} className="relative aspect-square overflow-hidden rounded bg-sand-100"><Image src={p.imageUrl} alt="" fill sizes="20vw" className="object-cover" /></div>)}</div></Card>}
          <Card>
            <CardHeader title="Recent jobs" />
            <ul className="divide-y divide-sand-100 text-sm">{jobs.map(({ b, service }) => <li key={b.id}><Link href={`/admin/bookings/${b.id}`} className="flex justify-between px-5 py-2.5 hover:bg-sand-50"><span>{service} · {formatDateTime(b.scheduledStart)}</span><StatusBadge status={b.status} label={staffStatusLabel(b.status)} /></Link></li>)}{!jobs.length && <li className="px-5 py-3 text-ink-muted">No jobs yet.</li>}</ul>
          </Card>
        </div>
        <div className="space-y-6">
          {canReview && <Card><CardHeader title="Review" description={g.reviewedAt ? `Last reviewed ${formatDate(g.reviewedAt)}${reviewer[0] ? ` by ${reviewer[0].name}` : ""}` : "Not reviewed yet"} /><div className="p-5">{g.reviewNote && <p className="mb-3 rounded bg-sand-50 p-2 text-sm">{g.reviewNote}</p>}<DecisionForm gardenerId={g.id} status={g.status} /></div></Card>}
          <Card>
            <CardHeader title="Documents" description="Private. Each view is recorded in the audit log." />
            <ul className="divide-y divide-sand-100 text-sm">
              {docs.map(({ d, f }) => (
                <li key={d.id} className="space-y-2 px-5 py-3">
                  <div className="flex items-center justify-between"><a href={`/api/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="link">{titleCase(d.type)}</a><StatusBadge status={d.status} /></div>
                  <p className="text-xs text-ink-muted">{f.mime} · {Math.round(f.size / 1024)} KB · uploaded {formatDate(d.createdAt)}{d.note ? ` · ${d.note}` : ""}</p>
                  {canReview && d.status === "pending" && <DocActions documentId={d.id} />}
                </li>
              ))}
              {!docs.length && <li className="px-5 py-3 text-ink-muted">No documents.</li>}
            </ul>
          </Card>
          {g.type === "company" && u.permissions.has("staff.manage") && <Card><CardHeader title="Employment" /><div className="p-5"><CompanyForm g={g} /></div></Card>}
        </div>
      </div>
    </div>
  );
}
