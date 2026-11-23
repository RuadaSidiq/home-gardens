import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarDays, CreditCard, MessageSquare, ShieldCheck, Smartphone, Users } from "lucide-react";
import { getSiteContext } from "@/server/site";
import { getContent } from "@/server/settings";
import { homeContent, listActivities, listGardeners, listProducts, listServiceCategories, listServices, serviceCities, servicePriceLabel, trustStats } from "@/server/queries/catalog";
import { GardenerCard, PriceTag, ProductCard } from "@/components/site/cards";
import { Chip, ExploreLink, LandingHeading, PillLink } from "@/components/site/landing";
import { ServiceCards } from "@/components/site/service-cards";
import { BeforeAfter } from "@/components/site/before-after";
import { QuickBook } from "@/components/site/quick-book";
import { NewsletterForm } from "@/components/site/newsletter";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { currency } = await getSiteContext();
  const [hero, promo, cats, services, featured, cities, gardeners, products, activities, content, stats] = await Promise.all([
    getContent("home.hero", { eyebrow: "", title: "Garden care you can rely on", subtitle: "", image: "", primaryLabel: "Book a gardener", secondaryLabel: "Shop supplies" }),
    getContent<{ title: string; body: string; image: string; ctaLabel: string; ctaHref: string; active: boolean } | null>("home.promo", null),
    listServiceCategories(),
    listServices(),
    listServices({ featured: true }),
    serviceCities(),
    listGardeners({}, 4),
    listProducts({ featured: true }, currency, 8),
    listActivities({ limit: 4 }),
    homeContent(),
    trustStats(),
  ]);
  const featuredPriced = await Promise.all(featured.slice(0, 5).map(async (r) => ({ ...r, price: await servicePriceLabel(r.s, currency) })));
  const [lead, ...rest] = featuredPriced;

  return (
    <>
      {/* Hero */}
      <section className="bg-white">
        <div className="container grid items-center gap-12 pb-16 pt-8 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:pb-24 lg:pt-12">
          <div className="max-w-[36rem]">
            <Chip>{hero.eyebrow || "Home Gardens"}</Chip>
            <h1 className="mt-7 text-[2.6rem] font-bold leading-[1.1] tracking-tight sm:text-[3.4rem]">{hero.title}</h1>
            <p className="mt-6 text-[17px] leading-relaxed text-ink-soft">{hero.subtitle}</p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-6">
              <PillLink href="/services">{hero.primaryLabel || "Our services"}</PillLink>
              {(stats.reviewCount > 0 || stats.verifiedGardeners > 0) && (
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3">
                  {gardeners.slice(0, 3).map((g) => g.avatar && <Image key={g.g.id} src={g.avatar} alt="" width={44} height={44} className="h-11 w-11 rounded-full border-2 border-white object-cover object-top" />)}
                </div>
                {stats.reviewCount > 0 ? (
                  <div>
                    <p className="flex items-center gap-1.5 font-display text-lg font-bold">{stats.reviewAvg.toFixed(1)} <span className="text-amber-500" aria-hidden>★★★★★</span></p>
                    <p className="text-[13px] text-ink-muted">{stats.reviewCount} verified reviews</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-display text-lg font-bold">{stats.verifiedGardeners} verified gardeners</p>
                    <p className="text-[13px] text-ink-muted">ID-checked &amp; reviewed</p>
                  </div>
                )}
              </div>
              )}
            </div>
            <p className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-soft">
              <Link href="/shop" className="inline-flex items-center gap-1.5 font-semibold text-ink hover:text-forest-600">{hero.secondaryLabel || "Shop supplies"} <ArrowRight className="h-4 w-4" /></Link>
              <span className="inline-flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-forest-600" /> Mobile Money, card or bank transfer</span>
            </p>
          </div>
          <div className="relative">
            <div className="relative aspect-[1.12] overflow-hidden rounded-[28px] rounded-br-[110px] bg-mint">
              {hero.image && <Image src={hero.image} alt="Gardeners planting in a home garden" fill priority sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />}
            </div>
            <div className="absolute bottom-5 left-5 rounded-[20px] rounded-tr-[34px] bg-white px-7 py-5 text-center shadow-pop sm:bottom-8 sm:left-8">
              <p className="font-display text-[2.6rem] font-bold leading-none text-forest-600">{stats.jobsCompleted > 0 ? stats.jobsCompleted : stats.cities}</p>
              <p className="mt-2 text-[13px] font-semibold uppercase leading-tight tracking-wide text-ink">{stats.jobsCompleted > 0 ? <>Jobs<br />completed</> : <>Areas<br />served</>}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick availability check */}
      <section className="pb-4">
        <div className="container">
          <div className="grid items-center gap-5 rounded-[22px] rounded-br-[56px] border border-mint-line bg-mint p-6 sm:p-8 lg:grid-cols-[0.8fr_2fr]">
            <div>
              <h2 className="text-xl font-bold">Check availability in your area</h2>
              <p className="mt-1 text-sm text-ink-soft">Pick a service and see open times with vetted gardeners near you.</p>
            </div>
            <QuickBook services={services.map((r) => ({ slug: r.s.slug, name: r.s.name, category: r.category.name }))} cities={cities} />
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-20 sm:py-24">
        <div className="container">
          <LandingHeading chip="Our services" title="We bring life and order to your home garden" />
          <ServiceCards categories={cats.map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, icon: c.icon }))} />
        </div>
      </section>

      {/* Featured services – editorial */}
      {lead && (
        <section className="pb-20 sm:pb-24">
          <div className="container">
            <LandingHeading chip="Popular" align="left" title="Most booked this season" action={<ExploreLink href="/services" label="All services" />} />
            <div className="grid gap-6 lg:grid-cols-2">
              <Link href={`/services/${lead.s.slug}`} className="group relative flex min-h-[440px] flex-col justify-end overflow-hidden rounded-[28px] rounded-br-[90px] bg-forest-950 p-7 text-white sm:p-9">
                <Image src={lead.s.images[0]!} alt={lead.s.name} fill sizes="(min-width:1024px) 50vw, 100vw" className="object-cover opacity-75 transition-transform duration-700 group-hover:scale-[1.03]" />
                <div className="absolute inset-0 bg-gradient-to-t from-forest-950/90 via-forest-950/25 to-transparent" />
                <div className="relative">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-forest-200">{lead.category.name}</p>
                  <h3 className="mt-2 text-3xl font-bold text-white">{lead.s.name}</h3>
                  <p className="mt-2 max-w-md text-forest-100">{lead.s.summary}</p>
                  <p className="mt-5 inline-flex items-center gap-2 rounded-[12px] rounded-br-[18px] bg-white px-4 py-2.5 text-sm font-bold text-ink">
                    {lead.price.amount != null ? `${lead.price.prefix}${formatMoney(lead.price.amount, currency, { noDecimals: lead.price.amount % 100 === 0 })}${lead.price.suffix}` : lead.price.label} <ArrowRight className="h-4 w-4" />
                  </p>
                </div>
              </Link>
              <div className="grid gap-4">
                {rest.map((r) => (
                  <Link key={r.s.id} href={`/services/${r.s.slug}`} className="group flex items-center gap-5 rounded-[20px] rounded-br-[40px] border border-sand-200 bg-white p-4 transition-colors hover:border-mint-line hover:bg-mint sm:p-5">
                    <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-[14px] bg-sand-100 sm:h-24 sm:w-32">
                      <Image src={r.s.images[0]!} alt="" fill sizes="128px" className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-ink-muted">{r.category.name}</p>
                      <h3 className="font-semibold leading-snug group-hover:text-forest-700">{r.s.name}</h3>
                      <p className="mt-0.5 line-clamp-1 text-sm text-ink-soft">{r.s.summary}</p>
                      <PriceTag p={r.price} currency={currency} className="mt-1 block" />
                    </div>
                    <ArrowRight className="hidden h-5 w-5 shrink-0 text-sand-400 transition-transform group-hover:translate-x-1 group-hover:text-forest-600 sm:block" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="bg-mint py-20 sm:py-24">
        <div className="container">
          <LandingHeading chip="How it works" title="Clear prices, vetted people, payment protected" />
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: CalendarDays, t: "Choose a service and time", d: "See the price upfront, or send photos for a quote on larger jobs." },
              { icon: Users, t: "Pick a gardener or let us match", d: "We match by service, area, availability, experience and reviews." },
              { icon: CreditCard, t: "Pay securely", d: "Mobile Money, card or bank transfer. Some services only need a deposit." },
              { icon: ShieldCheck, t: "Confirm when you're happy", d: "Your gardener uploads photos of the finished work. Report a problem and we step in." },
            ].map((s, i) => (
              <li key={s.t} className="relative rounded-[20px] rounded-br-[44px] border border-mint-line bg-white p-6">
                <span className="font-display text-sm font-bold text-forest-600">0{i + 1}</span>
                <s.icon className="absolute right-6 top-6 h-5 w-5 text-forest-600" aria-hidden />
                <h3 className="mt-2 text-lg font-semibold">{s.t}</h3>
                <p className="mt-1.5 text-sm text-ink-soft">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Gardeners */}
      {gardeners.length > 0 && (
        <section className="py-16 sm:py-20">
          <div className="container">
            <LandingHeading chip="Our gardeners" align="left" title="Meet the people who'll look after your garden" description="Company gardeners are trained and employed by us. Independent gardeners are ID-verified and reviewed before their profile goes live." action={<ExploreLink href="/find-a-gardener" label="Find a gardener" />} />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {gardeners.map((g) => <GardenerCard key={g.g.id} gardener={g} />)}
            </div>
          </div>
        </section>
      )}

      {/* Projects */}
      {content.projects.length > 0 && (
        <section className="bg-forest-950 py-16 text-white sm:py-20">
          <div className="container grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-center">
            <div>
              <span className="inline-flex rounded-[10px] border border-forest-700 px-3 py-1 text-[13px] font-medium uppercase tracking-[0.14em] text-forest-200">Projects</span>
              <h2 className="mt-5 text-[1.9rem] font-bold leading-[1.15] tracking-tight text-white sm:text-[2.4rem]">Before and after</h2>
              <p className="mt-3 text-forest-200">Drag the slider to compare. Every project starts with a conversation about how you want to use your space.</p>
              <ul className="mt-8 divide-y divide-forest-800 border-y border-forest-800">
                {content.projects.map((p) => (
                  <li key={p.p.id} className="py-4">
                    <p className="font-semibold text-white">{p.p.title}</p>
                    <p className="mt-0.5 text-sm text-forest-200">{p.p.location}{p.p.durationLabel ? ` · ${p.p.durationLabel}` : ""}{p.category ? ` · ${p.category}` : ""}</p>
                    <p className="mt-1.5 text-sm text-forest-300">{p.p.summary}</p>
                  </li>
                ))}
              </ul>
            </div>
            <BeforeAfter before={content.projects[0]!.p.beforeUrl} after={content.projects[0]!.p.afterUrl} alt={content.projects[0]!.p.title} />
          </div>
        </section>
      )}

      {/* Shop */}
      {products.items.length > 0 && (
        <section className="py-16 sm:py-20">
          <div className="container">
            <LandingHeading chip="Shop" align="left" title="Tools and supplies our gardeners use" description="Delivered across Greater Accra and Kumasi, with courier delivery elsewhere in Ghana and to Nigeria." action={<ExploreLink href="/shop" label="Browse the shop" />} />
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
              {products.items.map((p) => <ProductCard key={p.p.id} product={p.p} price={p.price} salePrice={p.salePrice} brand={p.brand} stock={p.stock} currency={currency} />)}
            </div>
          </div>
        </section>
      )}

      {/* Promo */}
      {promo?.active && (
        <section className="pb-16 sm:pb-20">
          <div className="container">
            <div className="grid overflow-hidden rounded-[28px] rounded-br-[90px] bg-forest-800 md:grid-cols-2">
              <div className="relative min-h-[240px]">
                <Image src={promo.image} alt="" fill sizes="(min-width:768px) 50vw, 100vw" className="object-cover" />
              </div>
              <div className="p-8 text-white sm:p-10">
                <p className="eyebrow text-forest-200">Seasonal offer</p>
                <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{promo.title}</h2>
                <p className="mt-3 text-forest-100">{promo.body}</p>
                <PillLink href={promo.ctaHref} tone="light" className="mt-7">{promo.ctaLabel}</PillLink>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Activities */}
      {activities.length > 0 && (
        <section className="bg-mint py-20 sm:py-24">
          <div className="container grid gap-10 lg:grid-cols-[1fr_2fr]">
            <div>
              <Chip>Activities</Chip>
              <h2 className="mt-5 text-[1.9rem] font-bold leading-[1.15] tracking-tight sm:text-[2.4rem]">Workshops, tours and community days</h2>
              <p className="mt-3 text-ink-soft">Practical sessions led by our horticulturists, for beginners, families and teams.</p>
              <div className="mt-7"><ExploreLink href="/activities" label="See all activities" /></div>
            </div>
            <ul className="divide-y divide-sand-200 border-y border-sand-200">
              {activities.map((a) => {
                const s = a.sessions[0]!;
                const left = s.capacity - s.seatsTaken;
                return (
                  <li key={a.a.id}>
                    <Link href={`/activities/${a.a.slug}`} className="group grid grid-cols-[4.5rem_1fr] items-center gap-4 py-4 sm:grid-cols-[4.5rem_1fr_auto]">
                      <div className="rounded-md border border-sand-300 bg-white py-2 text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-clay-600">{formatDate(s.startsAt, { month: "short" })}</p>
                        <p className="font-display text-2xl font-bold leading-none">{formatDate(s.startsAt, { day: "numeric" })}</p>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold group-hover:text-forest-700">{a.a.title}</h3>
                        <p className="mt-0.5 text-sm text-ink-muted">{formatDate(s.startsAt, { weekday: "short", hour: "2-digit", minute: "2-digit" })} · {a.a.venue}</p>
                      </div>
                      <div className="col-start-2 flex items-center gap-3 text-sm sm:col-start-auto sm:flex-col sm:items-end sm:gap-0.5">
                        <span className="font-semibold">{a.a.price === 0 ? "Free" : formatMoney(a.a.price, a.a.currency, { noDecimals: true })}</span>
                        <span className={left <= 5 ? "text-clay-600" : "text-ink-muted"}>{left <= 0 ? "Fully booked" : `${left} seats left`}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* Testimonials */}
      {content.testimonials.length > 0 && (
        <section className="py-16 sm:py-20">
          <div className="container">
            <LandingHeading chip="Testimonials" title="What people say after the work is done" />
            <div className="grid gap-10 md:grid-cols-3">
              {content.testimonials.slice(0, 3).map((t) => (
                <figure key={t.id} className="flex flex-col rounded-[22px] rounded-br-[56px] border border-mint-line bg-mint p-7">
                  <blockquote className="text-[17px] leading-relaxed text-ink">“{t.quote}”</blockquote>
                  <figcaption className="mt-4 text-sm">
                    <span className="font-semibold">{t.name}</span>
                    <span className="text-ink-muted"> · {t.location}{t.serviceLabel ? ` · ${t.serviceLabel}` : ""}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Trust + newsletter */}
      <section className="border-t border-sand-200 py-14">
        <div className="container grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { icon: BadgeCheck, t: "Checked before they work", d: "Identity documents and experience are verified for every independent gardener." },
              { icon: ShieldCheck, t: "Payment held until done", d: "Gardeners are paid after you confirm the job, or after support resolves an issue." },
              { icon: MessageSquare, t: "Real support", d: "Message your gardener or our team directly from your account." },
            ].map((x) => (
              <div key={x.t}>
                <x.icon className="h-6 w-6 text-forest-600" aria-hidden />
                <h3 className="mt-3 font-semibold">{x.t}</h3>
                <p className="mt-1 text-sm text-ink-soft">{x.d}</p>
              </div>
            ))}
          </div>
          <div className="rounded-[22px] rounded-br-[56px] border border-mint-line bg-mint p-7">
            <h2 className="text-lg font-bold">Seasonal garden tips, once a month</h2>
            <p className="mt-1 text-sm text-ink-soft">What to plant, prune and feed through the rainy and dry seasons.</p>
            <div className="mt-4"><NewsletterForm /></div>
          </div>
        </div>
      </section>
    </>
  );
}
