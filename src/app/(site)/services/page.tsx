import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { getSiteContext } from "@/server/site";
import { listServiceCategories, listServices, serviceCities, servicePriceLabel } from "@/server/queries/catalog";
import { PriceTag, ServiceIcon } from "@/components/site/cards";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata = { title: "Garden services", description: "Lawn care, landscaping, garden design, pruning, irrigation and maintenance in Accra and Kumasi." };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; city?: string }> }) {
  const sp = await searchParams;
  const { currency } = await getSiteContext();
  const cityId = sp.city ? Number(sp.city) : undefined;
  const [cats, rows, cities] = await Promise.all([listServiceCategories(), listServices({ categorySlug: sp.category, q: sp.q, cityId }), serviceCities()]);
  const priced = await Promise.all(rows.map(async (r) => ({ ...r, price: await servicePriceLabel(r.s, currency) })));
  const groups = cats.map((c) => ({ c, items: priced.filter((r) => r.category.id === c.id) })).filter((g) => g.items.length);
  const active = cats.find((c) => c.slug === sp.category);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/services${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <>
      <section className="border-b border-sand-200 bg-sand-50">
        <div className="container py-10 sm:py-14">
          <p className="eyebrow">Services</p>
          <h1 className="h-page mt-2 max-w-3xl">{active ? active.name : "Garden services for homes, estates and businesses"}</h1>
          <p className="lead mt-3 max-w-2xl">{active ? active.description : "Clear prices where we can give them, written quotes where a site needs to be seen first. Every job is done by a vetted gardener."}</p>
          <form className="mt-6 grid max-w-3xl gap-2 sm:grid-cols-[1fr_14rem_auto]" action="/services">
            {sp.category && <input type="hidden" name="category" value={sp.category} />}
            <label className="relative">
              <span className="sr-only">Search services</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input name="q" defaultValue={sp.q} placeholder="Search e.g. hedge, sprinkler, lawn" className="h-11 w-full rounded-md border border-sand-300 bg-white pl-9 pr-3 focus:border-forest-500 focus:outline-none" />
            </label>
            <label>
              <span className="sr-only">Area</span>
              <select name="city" defaultValue={sp.city ?? ""} className="h-11 w-full rounded-md border border-sand-300 bg-white px-3 focus:border-forest-500 focus:outline-none">
                <option value="">All areas</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <button className="h-11 rounded-md bg-ink px-5 font-semibold text-white hover:bg-forest-950">Search</button>
          </form>
        </div>
      </section>

      <div className="container grid gap-10 py-10 lg:grid-cols-[15rem_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-ink-muted lg:block">Categories</h2>
          <nav aria-label="Service categories" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-0.5 lg:px-0">
            <Link href={qs({ category: undefined })} className={cn("shrink-0 rounded-md px-3 py-2 text-sm font-medium", !sp.category ? "bg-forest-50 text-forest-800" : "text-ink-soft hover:bg-sand-100")}>All services</Link>
            {cats.map((c) => (
              <Link key={c.id} href={qs({ category: c.slug })} className={cn("flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium", sp.category === c.slug ? "bg-forest-50 text-forest-800" : "text-ink-soft hover:bg-sand-100")}>
                <ServiceIcon name={c.icon} className="hidden h-4 w-4 lg:block" /> {c.name}
              </Link>
            ))}
          </nav>
        </aside>
        <div>
          {groups.length === 0 && <EmptyState title="No services match your search" description="Try another word or area, or send us a message and we'll help." action={<ButtonLink href="/contact" variant="outline">Contact us</ButtonLink>} />}
          <div className="space-y-12">
            {groups.map(({ c, items }) => (
              <section key={c.id} aria-labelledby={`cat-${c.id}`}>
                {!sp.category && (
                  <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-sand-200 pb-3">
                    <h2 id={`cat-${c.id}`} className="text-xl font-bold">{c.name}</h2>
                    <Link href={qs({ category: c.slug })} className="text-sm link">View</Link>
                  </div>
                )}
                <ul className="space-y-4">
                  {items.map((r) => (
                    <li key={r.s.id} className="group grid gap-4 rounded-lg border border-sand-200 bg-white p-3 transition-shadow hover:shadow-pop sm:grid-cols-[13rem_1fr] sm:p-4">
                      <Link href={`/services/${r.s.slug}`} className="relative aspect-[16/10] overflow-hidden rounded-md bg-sand-100 sm:aspect-auto sm:min-h-[150px]">
                        {r.s.images[0] && <Image src={r.s.images[0]} alt={r.s.name} fill sizes="(min-width:640px) 208px, 100vw" className="object-cover" />}
                      </Link>
                      <div className="flex flex-col">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="text-lg font-semibold"><Link href={`/services/${r.s.slug}`} className="hover:text-forest-700">{r.s.name}</Link></h3>
                          <PriceTag p={r.price} currency={currency} className="text-base" />
                        </div>
                        <p className="mt-1 text-ink-soft">{r.s.summary}</p>
                        {r.s.includes.length > 0 && (
                          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
                            {r.s.includes.slice(0, 3).map((x) => <li key={x} className="before:mr-1.5 before:text-forest-500 before:content-['✓']">{x}</li>)}
                          </ul>
                        )}
                        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                          <ButtonLink href={`/services/${r.s.slug}/book${sp.city ? `?city=${sp.city}` : ""}`} size="sm">{r.price.amount == null ? "Request a quote" : "Book now"}</ButtonLink>
                          <ButtonLink href={`/services/${r.s.slug}`} size="sm" variant="ghost">Details</ButtonLink>
                          <span className="ml-auto text-[13px] text-ink-muted">≈ {Math.round(r.s.durationMinutes / 60)} h on site</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
