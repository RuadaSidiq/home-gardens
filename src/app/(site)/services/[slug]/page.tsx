import Image from "next/image";
import { notFound } from "next/navigation";
import { Check, Clock, MapPin, Info } from "lucide-react";
import { getSiteContext } from "@/server/site";
import { getServiceBySlug, listGardeners, servicePriceLabel } from "@/server/queries/catalog";
import { GardenerCard, PriceTag } from "@/components/site/cards";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/primitives";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const s = await getServiceBySlug((await params).slug);
  return s ? { title: s.s.seoTitle ?? s.s.name, description: s.s.seoDescription ?? s.s.summary } : {};
}

const MODEL_NOTE: Record<string, string> = {
  fixed: "Fixed price. What you see is what you pay.",
  starting: "Starting price. If the site needs more work than expected, your gardener sends a revised price for you to accept before continuing.",
  hourly: "Charged per hour on site, with a minimum charge. Choose the number of hours when booking.",
  per_sqm: "Priced by area. Enter your garden size when booking to see the exact price.",
  quote: "Send us photos and details and we'll send a written quote. You only pay once you accept it.",
  inspection: "We visit to assess the site first, then send a written quote. You only pay once you accept it.",
};

export default async function ServiceDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const svc = await getServiceBySlug(slug);
  if (!svc) notFound();
  const { currency } = await getSiteContext();
  const [price, gardeners] = await Promise.all([servicePriceLabel(svc.s, currency), listGardeners({ serviceId: svc.s.id }, 4)]);
  const [main, ...thumbs] = svc.s.images;
  return (
    <div className="container py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Services", href: "/services" }, { label: svc.category.name, href: `/services?category=${svc.category.slug}` }, { label: svc.s.name }]} />
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_22rem]">
        <div>
          <h1 className="h-page">{svc.s.name}</h1>
          <p className="lead mt-3 max-w-2xl">{svc.s.summary}</p>
          <div className="mt-6 grid gap-2 sm:grid-cols-[2fr_1fr]">
            {main && (
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-sand-100 sm:row-span-2 sm:aspect-auto sm:min-h-[380px]">
                <Image src={main} alt={svc.s.name} fill priority sizes="(min-width:1024px) 45vw, 100vw" className="object-cover" />
              </div>
            )}
            {thumbs.slice(0, 2).map((t) => (
              <div key={t} className="relative hidden aspect-[4/3] overflow-hidden rounded-lg bg-sand-100 sm:block">
                <Image src={t} alt="" fill sizes="20vw" className="object-cover" />
              </div>
            ))}
          </div>
          <div className="mt-10 grid gap-10 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-xl font-bold">About this service</h2>
              <div className="mt-3 space-y-4 text-ink-soft">{svc.s.description.split("\n").filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>
              {svc.s.requirements && (
                <div className="mt-6 flex gap-3 rounded-lg border border-sand-200 bg-sand-50 p-4 text-sm">
                  <Info className="h-5 w-5 shrink-0 text-forest-600" />
                  <div><p className="font-semibold">Before the visit</p><p className="mt-0.5 text-ink-soft">{svc.s.requirements}</p></div>
                </div>
              )}
            </div>
            {svc.s.includes.length > 0 && (
              <div>
                <h2 className="text-xl font-bold">What's included</h2>
                <ul className="mt-3 space-y-2.5">
                  {svc.s.includes.map((x) => (
                    <li key={x} className="flex gap-2.5 text-ink-soft"><Check className="mt-0.5 h-4 w-4 shrink-0 text-forest-600" />{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {gardeners.length > 0 && (
            <section className="mt-14">
              <h2 className="text-xl font-bold">Gardeners who offer this service</h2>
              <p className="mt-1 text-sm text-ink-muted">You can choose one of them when booking, or let us match you.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {gardeners.map((g) => <GardenerCard key={g.g.id} gardener={g} compact />)}
              </div>
            </section>
          )}
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-sand-200 bg-white p-5 shadow-card">
            <PriceTag p={price} currency={currency} className="block text-2xl [&>span]:text-2xl" />
            <p className="mt-2 text-sm text-ink-muted">{MODEL_NOTE[svc.s.pricingModel]}</p>
            {svc.s.depositPercent > 0 && svc.s.depositPercent < 100 && price.amount != null && (
              <p className="mt-2 text-sm text-ink-muted">Pay a {svc.s.depositPercent}% deposit to confirm, balance before completion.</p>
            )}
            <ButtonLink href={`/services/${svc.s.slug}/book`} size="lg" className="mt-5 w-full">{price.amount == null ? "Request a quote" : "Book this service"}</ButtonLink>
            <dl className="mt-5 space-y-3 border-t border-sand-200 pt-4 text-sm">
              <div className="flex gap-2.5"><Clock className="h-4 w-4 shrink-0 text-ink-muted" /><div><dt className="sr-only">Duration</dt><dd>About {Math.round(svc.s.durationMinutes / 60)} hours on site</dd></div></div>
              <div className="flex gap-2.5"><MapPin className="h-4 w-4 shrink-0 text-ink-muted" /><div><dt className="sr-only">Areas</dt><dd>{svc.areas.length ? svc.areas.map((a) => a.name).join(", ") : "Ask us about your area"}</dd></div></div>
            </dl>
          </div>
          <p className="mt-3 px-1 text-xs text-ink-muted">Free cancellation up to 24 hours before your booking.</p>
        </aside>
      </div>
    </div>
  );
}
