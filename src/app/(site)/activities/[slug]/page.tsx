import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Users, Info } from "lucide-react";
import { getActivityBySlug } from "@/server/queries/catalog";
import { getCurrentUser } from "@/server/auth/session";
import { Breadcrumbs } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDate, formatTime, titleCase } from "@/lib/utils";
import { RegisterForm } from "./register-form";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getActivityBySlug((await params).slug);
  return a ? { title: a.a.title, description: a.a.summary } : {};
}

export default async function ActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getActivityBySlug((await params).slug);
  if (!a) notFound();
  const user = await getCurrentUser();
  const sessions = a.sessions.map((s) => ({
    id: s.id,
    label: `${formatDate(s.startsAt, { weekday: "short", day: "numeric", month: "short" })}, ${formatTime(s.startsAt)}–${formatTime(s.endsAt)}`,
    left: s.capacity - s.seatsTaken,
    closed: s.startsAt.getTime() - a.a.bookingDeadlineHours * 3600_000 < Date.now(),
  }));
  return (
    <div className="container py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Activities", href: "/activities" }, { label: a.a.title }]} />
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div>
          <p className="eyebrow">{titleCase(a.a.type)}</p>
          <h1 className="h-page mt-2">{a.a.title}</h1>
          <p className="lead mt-3">{a.a.summary}</p>
          {a.a.images[0] && <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-xl bg-sand-100"><Image src={a.a.images[0]} alt="" fill priority sizes="(min-width:1024px) 60vw, 100vw" className="object-cover" /></div>}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <p className="flex gap-2 text-sm"><MapPin className="h-5 w-5 shrink-0 text-forest-600" /><span><strong className="block">{a.a.venue}</strong><span className="text-ink-muted">{a.a.address}</span></span></p>
            <p className="flex gap-2 text-sm"><Users className="h-5 w-5 shrink-0 text-forest-600" /><span><strong className="block">Organised by</strong><span className="text-ink-muted">{a.a.organizer}</span></span></p>
            <p className="flex gap-2 text-sm"><CalendarDays className="h-5 w-5 shrink-0 text-forest-600" /><span><strong className="block">Registration closes</strong><span className="text-ink-muted">{a.a.bookingDeadlineHours} h before each session</span></span></p>
          </div>
          <div className="mt-8 space-y-4 text-ink-soft">{a.a.description.split("\n").filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>
          {a.a.requirements && <div className="mt-6 flex gap-3 rounded-lg border border-sand-200 bg-sand-50 p-4 text-sm"><Info className="h-5 w-5 shrink-0 text-forest-600" /><div><p className="font-semibold">Good to know</p><p className="mt-0.5 text-ink-soft">{a.a.requirements}</p></div></div>}
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-sand-200 bg-white p-5 shadow-card">
            <p className="text-2xl font-bold">{a.a.price === 0 ? "Free" : formatMoney(a.a.price, a.a.currency, { noDecimals: true })}<span className="text-base font-normal text-ink-muted">{a.a.price ? " per person" : ""}</span></p>
            <div className="mt-5">
              {sessions.length === 0 ? <p className="text-sm text-ink-muted">No upcoming sessions.</p> : user ? (
                <RegisterForm sessions={sessions} price={a.a.price} currency={a.a.currency} maxPer={a.a.maxPerBooking} />
              ) : (
                <Link href={`/login?next=/activities/${a.a.slug}`} className="flex h-12 items-center justify-center rounded-md bg-forest-600 font-semibold text-white hover:bg-forest-700">Sign in to register</Link>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
