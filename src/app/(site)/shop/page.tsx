import Link from "next/link";
import { Search } from "lucide-react";
import { getSiteContext, productCategoriesNav } from "@/server/site";
import { listBrands, listProducts } from "@/server/queries/catalog";
import { ProductCard } from "@/components/site/cards";
import { EmptyState, Pagination } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { toMinor } from "@/lib/money";

export const metadata = { title: "Shop gardening tools, plants and supplies", description: "Lawn mowers, trimmers, irrigation kits, seeds, fertilizer, pots and more, delivered in Ghana." };

type SP = { category?: string; brand?: string; q?: string; min?: string; max?: string; stock?: string; sale?: string; sort?: string; page?: string };

export default async function ShopPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { currency } = await getSiteContext();
  const [cats, brands, res] = await Promise.all([
    productCategoriesNav(),
    listBrands(),
    listProducts({
      categorySlug: sp.category, brand: sp.brand, q: sp.q,
      min: sp.min ? toMinor(sp.min, currency) : undefined, max: sp.max ? toMinor(sp.max, currency) : undefined,
      inStock: sp.stock === "1", onSale: sp.sale === "1", sort: sp.sort, page: Number(sp.page) || 1,
    }, currency),
  ]);
  const active = cats.find((c) => c.slug === sp.category);
  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: undefined, ...patch })) if (v) p.set(k, v);
    return `/shop${p.toString() ? `?${p}` : ""}`;
  };
  const inp = "h-9 w-full rounded-md border border-sand-300 bg-white px-2.5 text-sm focus:border-forest-500 focus:outline-none";
  return (
    <>
      <section className="border-b border-sand-200">
        <div className="container py-8 sm:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Shop</p>
              <h1 className="h-page mt-2">{active?.name ?? "Tools, plants and supplies"}</h1>
            </div>
            <form action="/shop" className="relative w-full sm:w-80">
              {sp.category && <input type="hidden" name="category" value={sp.category} />}
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <label htmlFor="shop-q" className="sr-only">Search products</label>
              <input id="shop-q" name="q" defaultValue={sp.q} placeholder="Search products or SKU" className="h-11 w-full rounded-md border border-sand-300 pl-9 pr-3 focus:border-forest-500 focus:outline-none" />
            </form>
          </div>
          <nav aria-label="Product categories" className="scrollbar-none -mx-4 mt-6 flex gap-2 overflow-x-auto px-4">
            <Link href={link({ category: undefined })} className={cn("shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium", !sp.category ? "border-ink bg-ink text-white" : "border-sand-300 hover:border-ink-muted")}>All</Link>
            {cats.map((c) => (
              <Link key={c.id} href={link({ category: c.slug })} className={cn("shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium", sp.category === c.slug ? "border-ink bg-ink text-white" : "border-sand-300 hover:border-ink-muted")}>{c.name}</Link>
            ))}
          </nav>
        </div>
      </section>
      <div className="container grid gap-8 py-8 lg:grid-cols-[14rem_1fr]">
        <form action="/shop" className="h-fit space-y-5 lg:sticky lg:top-24">
          {sp.category && <input type="hidden" name="category" value={sp.category} />}
          {sp.q && <input type="hidden" name="q" value={sp.q} />}
          <div>
            <p className="mb-2 text-sm font-semibold">Price ({currency})</p>
            <div className="flex items-center gap-2">
              <input name="min" type="number" min={0} placeholder="Min" defaultValue={sp.min} className={inp} aria-label="Minimum price" />
              <span className="text-ink-muted">–</span>
              <input name="max" type="number" min={0} placeholder="Max" defaultValue={sp.max} className={inp} aria-label="Maximum price" />
            </div>
          </div>
          <div>
            <label htmlFor="brand" className="mb-2 block text-sm font-semibold">Brand</label>
            <select id="brand" name="brand" defaultValue={sp.brand ?? ""} className={inp}>
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.slug}>{b.name}</option>)}
            </select>
          </div>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="stock" value="1" defaultChecked={sp.stock === "1"} className="accent-forest-600" /> In stock only</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="sale" value="1" defaultChecked={sp.sale === "1"} className="accent-forest-600" /> On sale</label>
          </div>
          <div>
            <label htmlFor="sort" className="mb-2 block text-sm font-semibold">Sort by</label>
            <select id="sort" name="sort" defaultValue={sp.sort ?? ""} className={inp}>
              <option value="">Featured</option><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="rating">Top rated</option>
            </select>
          </div>
          <button className="h-10 w-full rounded-md bg-ink text-sm font-semibold text-white hover:bg-forest-950">Apply filters</button>
          <Link href="/shop/compare" className="block text-center text-sm link">Compare products</Link>
        </form>
        <div>
          <p className="mb-4 text-sm text-ink-muted">{res.total} product{res.total === 1 ? "" : "s"}</p>
          {res.items.length === 0 ? (
            <EmptyState title="No products found" description="Try removing a filter or searching for something else." />
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
              {res.items.map((p) => <ProductCard key={p.p.id} product={p.p} price={p.price} salePrice={p.salePrice} brand={p.brand} stock={p.stock} currency={currency} />)}
            </div>
          )}
          <Pagination page={res.page} pageCount={res.pageCount} params={sp} basePath="/shop" />
        </div>
      </div>
    </>
  );
}
