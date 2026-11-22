import { SlidersHorizontal } from "lucide-react";
import { listGardeners, listServiceCategories, serviceCities } from "@/server/queries/catalog";
import { GardenerCard } from "@/components/site/cards";
import { EmptyState } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Find a gardener", description: "Browse verified gardeners in Accra and Kumasi by area, service, experience and rating." };

type SP = { city?: string; category?: string; rating?: string; years?: string; maxRate?: string; verified?: string; type?: string; day?: string; sort?: string; q?: string };

export default async function FindGardener({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [cities, cats] = await Promise.all([serviceCities(), listServiceCategories()]);
  const list = await listGardeners({
    cityId: sp.city ? Number(sp.city) : undefined,
    categorySlug: sp.category || undefined,
    minRating: sp.rating ? Number(sp.rating) : undefined,
    minYears: sp.years ? Number(sp.years) : undefined,
    maxRate: sp.maxRate ? Math.round(Number(sp.maxRate) * 100) : undefined,
    verified: sp.verified === "1",
    type: sp.type === "company" || sp.type === "independent" ? sp.type : undefined,
    availableOn: sp.day ? Number(sp.day) : undefined,
    sort: sp.sort,
    q: sp.q,
  }, 60);
  const sel = "h-10 w-full rounded-md border border-sand-300 bg-white px-2.5 text-sm focus:border-forest-500 focus:outline-none";
  const filtersActive = Object.entries(sp).some(([k, v]) => v && k !== "sort");
  return (
    <>
      <section className="border-b border-sand-200 bg-sand-50">
        <div className="container py-10 sm:py-12">
          <p className="eyebrow">Find a gardener</p>
          <h1 className="h-page mt-2">Gardeners near you</h1>
          <p className="lead mt-3 max-w-2xl">Every profile here has been reviewed by our team. Filter by area, the work you need and when you need it.</p>
        </div>
      </section>
      <div className="container grid gap-8 py-8 lg:grid-cols-[16rem_1fr]">
        <form action="/find-a-gardener" className="h-fit space-y-4 rounded-lg border border-sand-200 bg-white p-4 lg:sticky lg:top-24">
          <p className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4" /> Filters</p>
          <label className="block text-sm"><span className="mb-1 block font-medium">Name or skill</span><input name="q" defaultValue={sp.q} className={sel} /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Area</span>
            <select name="city" defaultValue={sp.city ?? ""} className={sel}><option value="">Any area</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Service</span>
            <select name="category" defaultValue={sp.category ?? ""} className={sel}><option value="">Any service</option>{cats.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
          </label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Works on</span>
            <select name="day" defaultValue={sp.day ?? ""} className={sel}><option value="">Any day</option>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm"><span className="mb-1 block font-medium">Rating</span>
              <select name="rating" defaultValue={sp.rating ?? ""} className={sel}><option value="">Any</option><option value="4">4+</option><option value="4.5">4.5+</option></select>
            </label>
            <label className="block text-sm"><span className="mb-1 block font-medium">Experience</span>
              <select name="years" defaultValue={sp.years ?? ""} className={sel}><option value="">Any</option><option value="3">3+ yrs</option><option value="5">5+ yrs</option><option value="10">10+ yrs</option></select>
            </label>
          </div>
          <label className="block text-sm"><span className="mb-1 block font-medium">Max hourly rate (GH₵)</span><input name="maxRate" type="number" min={0} defaultValue={sp.maxRate} className={sel} /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">Type</span>
            <select name="type" defaultValue={sp.type ?? ""} className={sel}><option value="">All gardeners</option><option value="company">Home Gardens team</option><option value="independent">Independent</option></select>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" value="1" defaultChecked={sp.verified === "1"} className="accent-forest-600" /> Verified only</label>
          <input type="hidden" name="sort" value={sp.sort ?? ""} />
          <div className="flex gap-2">
            <button className="h-10 flex-1 rounded-md bg-forest-600 text-sm font-semibold text-white hover:bg-forest-700">Apply</button>
            {filtersActive && <a href="/find-a-gardener" className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-ink-soft hover:bg-sand-100">Clear</a>}
          </div>
        </form>
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">{list.length} gardener{list.length === 1 ? "" : "s"}</p>
            <form action="/find-a-gardener" className="flex items-center gap-2 text-sm">
              {Object.entries(sp).filter(([k, v]) => v && k !== "sort").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <label htmlFor="sort" className="text-ink-muted">Sort</label>
              <select id="sort" name="sort" defaultValue={sp.sort ?? ""} className="h-9 rounded-md border border-sand-300 bg-white px-2">
                <option value="">Top rated</option><option value="experience">Most experienced</option><option value="jobs">Most jobs</option><option value="price">Lowest rate</option>
              </select>
              <button className="h-9 rounded-md border border-sand-300 px-3 font-medium hover:bg-sand-50">Go</button>
            </form>
          </div>
          {list.length === 0 ? (
            <EmptyState title="No gardeners match these filters" description="Try widening the area or service. You can also book a service and let us match you." action={<ButtonLink href="/services">Browse services</ButtonLink>} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{list.map((g) => <GardenerCard key={g.g.id} gardener={g} />)}</div>
          )}
        </div>
      </div>
    </>
  );
}
