import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatDateTime, cn } from "@/lib/utils";

export const metadata = { title: "My bookings" };
const GROUPS = { active: ["awaiting_quote", "quoted", "awaiting_payment", "pending_assignment", "assigned", "accepted", "in_progress", "awaiting_confirmation", "disputed"], past: ["completed", "cancelled"] } as const;

export default async function MyBookings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await requireUser();
  const tab = (await searchParams).tab === "past" ? "past" : "active";
  const rows = await db
    .select({ b: schema.bookings, service: schema.services.name, gardener: schema.users.fullName })
    .from(schema.bookings)
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .leftJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.bookings.gardenerId))
    .leftJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId))
    .where(and(eq(schema.bookings.customerId, u.id), inArray(schema.bookings.status, [...GROUPS[tab]])))
    .orderBy(tab === "past" ? desc(schema.bookings.scheduledStart) : schema.bookings.scheduledStart);
  return (
    <>
      <PageHeader title="Bookings" actions={<ButtonLink href="/services" size="sm">New booking</ButtonLink>} />
      <div className="mb-4 flex gap-1 text-sm">
        {(["active", "past"] as const).map((t) => <Link key={t} href={`/account/bookings?tab=${t}`} className={cn("rounded-md px-3 py-1.5 font-medium", tab === t ? "bg-ink text-white" : "text-ink-soft hover:bg-sand-100")}>{t === "active" ? "Upcoming & active" : "Past"}</Link>)}
      </div>
      {rows.length === 0 ? <EmptyState title={tab === "active" ? "No active bookings" : "No past bookings"} action={<ButtonLink href="/services" size="sm">Book a service</ButtonLink>} /> : (
        <table className="rtable w-full text-sm">
          <thead className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="py-2 pr-4">Service</th><th className="py-2 pr-4">When</th><th className="py-2 pr-4">Gardener</th><th className="py-2 pr-4">Total</th><th className="py-2">Status</th></tr></thead>
          <tbody className="md:divide-y md:divide-sand-100">
            {rows.map(({ b, service, gardener }) => (
              <tr key={b.id} className="md:hover:bg-sand-50">
                <td data-label="" className="rt-primary py-3 pr-4"><Link href={`/account/bookings/${b.id}`} className="font-medium hover:text-forest-700">{service}</Link><span className="block text-xs font-normal text-ink-muted">{b.reference}</span></td>
                <td data-label="When" className="py-3 pr-4">{formatDateTime(b.scheduledStart)}</td>
                <td data-label="Gardener" className="py-3 pr-4">{gardener ?? "—"}</td>
                <td data-label="Total" className="py-3 pr-4 tabular-nums">{b.total ? formatMoney(b.total, b.currency) : "Quote"}</td>
                <td data-label="Status" className="py-3"><StatusBadge status={b.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
