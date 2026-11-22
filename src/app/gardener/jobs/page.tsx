import Link from "next/link";
import { requireGardener } from "@/server/auth/session";
import { JOB_TABS, gardenerJobs, declinedJobs } from "@/server/queries/gardener";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDateTime, cn } from "@/lib/utils";

export const metadata = { title: "Jobs" };
const LABELS = { requests: "New requests", upcoming: "Upcoming", active: "Active", completed: "Completed", declined: "Declined", other: "Other" } as const;

export default async function Jobs({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await requireGardener();
  const t = (await searchParams).tab as keyof typeof LABELS | undefined;
  const tab = t && t in LABELS ? t : u.gardenerType === "independent" ? "requests" : "upcoming";
  const tabs = (Object.keys(LABELS) as (keyof typeof LABELS)[]).filter((k) => u.gardenerType === "independent" || (k !== "requests" && k !== "declined"));
  const jobs = tab === "declined" ? [] : await gardenerJobs(u.gardenerId, JOB_TABS[tab as keyof typeof JOB_TABS]);
  const declined = tab === "declined" ? await declinedJobs(u.gardenerId) : [];
  return (
    <>
      <PageHeader title="Jobs" />
      <nav className="scrollbar-none -mx-4 mb-4 flex gap-1 overflow-x-auto px-4">
        {tabs.map((k) => <Link key={k} href={`/gardener/jobs?tab=${k}`} className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm font-medium", tab === k ? "bg-ink text-white" : "text-ink-soft hover:bg-white")}>{LABELS[k]}</Link>)}
      </nav>
      {tab === "declined" ? (
        declined.length === 0 ? <EmptyState title="No declined jobs" /> : (
          <ul className="space-y-2">{declined.map((d) => <li key={d.a.id} className="rounded-lg border border-sand-200 bg-white p-4 text-sm"><p className="font-medium">{d.service} · {d.reference}</p><p className="text-ink-muted">{formatDateTime(d.start)} · {d.a.status}{d.a.reason ? ` – ${d.a.reason}` : ""}</p></li>)}</ul>
        )
      ) : jobs.length === 0 ? <EmptyState title={`No ${LABELS[tab].toLowerCase()} jobs`} /> : (
        <ul className="space-y-3">
          {jobs.map(({ b, service, customer }) => (
            <li key={b.id}>
              <Link href={`/gardener/jobs/${b.id}`} className="block rounded-lg border border-sand-200 bg-white p-4 hover:border-forest-300 hover:shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold">{service}</p><p className="text-sm text-ink-muted">{formatDateTime(b.scheduledStart)}</p></div>
                  <StatusBadge status={b.status} label={b.status === "assigned" ? "Needs response" : b.status === "awaiting_confirmation" ? "Awaiting customer" : undefined} />
                </div>
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm text-ink-soft"><span>{customer.split(" ")[0]} · {b.address.line1}, {b.address.city}</span>{u.gardenerType === "independent" && b.total > 0 && <span className="font-semibold text-ink">{formatMoney(b.total - b.tax, b.currency)}</span>}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
