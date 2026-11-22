import Image from "next/image";
import Link from "next/link";
import { listActivities } from "@/server/queries/catalog";
import { EmptyState } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDate, titleCase, cn } from "@/lib/utils";

export const metadata = { title: "Garden workshops, tours and events", description: "Gardening workshops, botanical garden tours, kids' clubs and community planting days in Accra." };

const TYPES = ["workshop", "tour", "lesson", "family", "community", "corporate", "exhibition", "class", "school"];

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const all = await listActivities();
  const list = type ? all.filter((a) => a.a.type === type) : all;
  const types = TYPES.filter((t) => all.some((a) => a.a.type === t));
  const [lead, ...rest] = list;
  return (
    <>
      <section className="border-b border-sand-200 bg-sand-50">
        <div className="container py-10 sm:py-12">
          <p className="eyebrow">Activities</p>
          <h1 className="h-page mt-2">Learn, grow and get your hands dirty</h1>
          <p className="lead mt-3 max-w-2xl">Hands-on workshops with our horticulturists, garden tours, family sessions and community planting days.</p>
          <nav className="scrollbar-none -mx-4 mt-6 flex gap-2 overflow-x-auto px-4" aria-label="Activity types">
            <Link href="/activities" className={cn("shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium", !type ? "border-ink bg-ink text-white" : "border-sand-300 bg-white")}>All</Link>
            {types.map((t) => <Link key={t} href={`/activities?type=${t}`} className={cn("shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium", type === t ? "border-ink bg-ink text-white" : "border-sand-300 bg-white")}>{titleCase(t)}</Link>)}
          </nav>
        </div>
      </section>
      <div className="container py-10">
        {!lead ? <EmptyState title="No upcoming sessions" description="New activities are added regularly. Subscribe to our newsletter to hear first." /> : (
          <>
            <Link href={`/activities/${lead.a.slug}`} className="group grid overflow-hidden rounded-xl border border-sand-200 md:grid-cols-2">
              <div className="relative min-h-[260px] bg-sand-100">{lead.a.images[0] && <Image src={lead.a.images[0]} alt="" fill sizes="50vw" className="object-cover" />}</div>
              <div className="flex flex-col justify-center p-6 sm:p-10">
                <p className="eyebrow">{titleCase(lead.a.type)} · Next session {formatDate(lead.sessions[0]!.startsAt, { weekday: "long", day: "numeric", month: "long" })}</p>
                <h2 className="mt-2 text-2xl font-bold group-hover:text-forest-700 sm:text-3xl">{lead.a.title}</h2>
                <p className="mt-3 text-ink-soft">{lead.a.summary}</p>
                <p className="mt-5 text-sm text-ink-muted">{lead.a.venue} · {lead.a.price === 0 ? "Free" : `${formatMoney(lead.a.price, lead.a.currency, { noDecimals: true })} per person`}</p>
              </div>
            </Link>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((a) => {
                const s = a.sessions[0]!;
                const left = s.capacity - s.seatsTaken;
                return (
                  <li key={a.a.id}>
                    <Link href={`/activities/${a.a.slug}`} className="group block">
                      <div className="relative aspect-[3/2] overflow-hidden rounded-lg bg-sand-100">
                        {a.a.images[0] && <Image src={a.a.images[0]} alt="" fill sizes="33vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />}
                        <div className="absolute left-3 top-3 rounded-md bg-white px-2.5 py-1 text-center leading-none shadow"><p className="text-[10px] font-bold uppercase text-clay-600">{formatDate(s.startsAt, { month: "short" })}</p><p className="font-display text-lg font-bold">{formatDate(s.startsAt, { day: "numeric" })}</p></div>
                      </div>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{titleCase(a.a.type)}</p>
                      <h3 className="mt-1 text-lg font-semibold group-hover:text-forest-700">{a.a.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{a.a.summary}</p>
                      <p className="mt-2 text-sm"><span className="font-semibold">{a.a.price === 0 ? "Free" : formatMoney(a.a.price, a.a.currency, { noDecimals: true })}</span> <span className={left <= 5 ? "text-clay-600" : "text-ink-muted"}>· {left <= 0 ? "Fully booked" : `${left} seats left`}</span></p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
