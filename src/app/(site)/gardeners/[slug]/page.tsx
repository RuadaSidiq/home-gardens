import Image from "next/image";
import { notFound } from "next/navigation";
import { BadgeCheck, Briefcase, GraduationCap, MapPin, CalendarCheck } from "lucide-react";
import { getGardenerBySlug, servicePriceLabel } from "@/server/queries/catalog";
import { getSiteContext } from "@/server/site";
import { getCurrentUser } from "@/server/auth/session";
import { Avatar, Breadcrumbs, Stars, Badge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { PriceTag } from "@/components/site/cards";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { SaveGardenerButton } from "./save-button";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const g = await getGardenerBySlug((await params).slug);
  return g ? { title: `${g.name} – ${g.g.headline}`, description: g.g.bio.slice(0, 160) } : {};
}

export default async function GardenerProfile({ params }: { params: Promise<{ slug: string }> }) {
  const g = await getGardenerBySlug((await params).slug);
  if (!g) notFound();
  const { currency } = await getSiteContext();
  const user = await getCurrentUser();
  const saved = user ? (await db.select().from(schema.savedGardeners).where(and(eq(schema.savedGardeners.userId, user.id), eq(schema.savedGardeners.gardenerId, g.g.id)))).length > 0 : false;
  const prices = await Promise.all(g.services.map(async (s) => ({ ...s, label: await servicePriceLabel(s.s, currency) })));
  return (
    <div className="container py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Find a gardener", href: "/find-a-gardener" }, { label: g.name }]} />
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Avatar name={g.name} src={g.avatar} size={112} className="rounded-xl" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold">{g.name}</h1>
                {g.g.verifiedAt && <Badge tone="green"><BadgeCheck className="h-3.5 w-3.5" /> Verified</Badge>}
                <Badge tone={g.g.type === "company" ? "dark" : "neutral"}>{g.g.type === "company" ? "Home Gardens team" : "Independent gardener"}</Badge>
              </div>
              <p className="mt-1 text-lg text-ink-soft">{g.g.headline}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                <Stars value={Number(g.g.ratingAvg)} count={g.g.ratingCount} />
                <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" />{g.g.yearsExperience} years' experience</span>
                <span className="inline-flex items-center gap-1"><CalendarCheck className="h-4 w-4" />{g.g.jobsCompleted} jobs completed here</span>
              </div>
            </div>
          </div>
          <section className="mt-8">
            <h2 className="text-xl font-bold">About</h2>
            <p className="mt-2 max-w-prose whitespace-pre-line text-ink-soft">{g.g.bio}</p>
            {g.g.qualifications && <p className="mt-4 flex gap-2 text-sm text-ink-soft"><GraduationCap className="h-5 w-5 shrink-0 text-forest-600" />{g.g.qualifications}</p>}
          </section>
          {g.portfolio.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-bold">Portfolio</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                {g.portfolio.map((p) => (
                  <figure key={p.id} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-sand-100">
                    <Image src={p.imageUrl} alt={p.caption ?? `Work by ${g.name}`} fill sizes="(min-width:768px) 25vw, 50vw" className="object-cover" />
                  </figure>
                ))}
              </div>
            </section>
          )}
          <section className="mt-10">
            <h2 className="text-xl font-bold">Services</h2>
            <ul className="mt-3 divide-y divide-sand-200 border-y border-sand-200">
              {prices.map((s) => (
                <li key={s.s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{s.s.name}</p>
                    <p className="text-sm text-ink-muted">{s.category}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.customPrice && g.g.type === "independent" && s.s.pricingModel !== "quote" && s.s.pricingModel !== "inspection" ? (
                      <span className="text-sm font-semibold">{formatMoney(s.customPrice, g.g.currency)}{s.s.pricingModel === "hourly" ? "/h" : s.s.pricingModel === "per_sqm" ? "/m²" : ""}</span>
                    ) : <PriceTag p={s.label} currency={currency} />}
                    <ButtonLink href={`/services/${s.s.slug}/book?gardener=${g.g.id}`} size="sm" variant="outline">Book</ButtonLink>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="mt-10">
            <h2 className="text-xl font-bold">Reviews</h2>
            {g.reviews.length === 0 ? (
              <p className="mt-2 text-ink-muted">{g.name.split(" ")[0]} hasn't been reviewed yet. Reviews can only be left by customers after a completed booking.</p>
            ) : (
              <ul className="mt-4 space-y-6">
                {g.reviews.map(({ r, author }) => (
                  <li key={r.id} className="border-b border-sand-100 pb-6">
                    <div className="flex items-center justify-between gap-2"><Stars value={r.rating} count={undefined} showValue={false} /><span className="text-xs text-ink-muted">{formatDate(r.createdAt)}</span></div>
                    {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
                    <p className="mt-1 text-ink-soft">{r.body}</p>
                    <p className="mt-2 text-sm text-ink-muted">— {author.split(" ")[0]} {author.split(" ")[1]?.[0] ?? ""}.</p>
                    {r.response && <p className="mt-3 rounded-md bg-sand-50 p-3 text-sm text-ink-soft"><strong>Response:</strong> {r.response}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-sand-200 bg-white p-5 shadow-card">
            {g.g.type === "independent" && g.g.hourlyRate && <p className="text-2xl font-bold">{formatMoney(g.g.hourlyRate, g.g.currency, { noDecimals: true })}<span className="text-base font-normal text-ink-muted"> / hour</span></p>}
            <ButtonLink href={`/services/${g.services[0]?.s.slug ?? ""}/book?gardener=${g.g.id}`} size="lg" className="mt-3 w-full">Book {g.name.split(" ")[0]}</ButtonLink>
            <div className="mt-2"><SaveGardenerButton gardenerId={g.g.id} saved={saved} signedIn={!!user} /></div>
            <div className="mt-5 border-t border-sand-200 pt-4 text-sm">
              <p className="flex gap-2 font-medium"><MapPin className="h-4 w-4 text-ink-muted" /> Works in</p>
              <p className="mt-1 text-ink-soft">{g.areas.join(", ")}</p>
              <p className="mt-4 font-medium">Usual working days</p>
              <div className="mt-2 flex gap-1">
                {DAYS.map((d, i) => {
                  const a = g.availability.find((x) => x.weekday === i);
                  return <span key={d} title={a ? `${a.startTime.slice(0, 5)}–${a.endTime.slice(0, 5)}` : "Not working"} className={`flex h-8 w-8 items-center justify-center rounded text-xs font-semibold ${a ? "bg-forest-100 text-forest-800" : "bg-sand-100 text-sand-400"}`}>{d[0]}</span>;
                })}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
