import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { Truck, RotateCcw, ShieldCheck } from "lucide-react";
import { db, schema } from "@/db";
import { getSiteContext } from "@/server/site";
import { getProductBySlug } from "@/server/queries/catalog";
import { Breadcrumbs, Stars } from "@/components/ui/primitives";
import { ProductCard } from "@/components/site/cards";
import { formatDate } from "@/lib/utils";
import { ProductBuy } from "./product-buy";
import { ProductGallery } from "./gallery";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProductBySlug((await params).slug, "GHS");
  return p ? { title: p.p.seoTitle ?? p.p.name, description: p.p.seoDescription ?? p.p.summary } : {};
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { currency, user, settings } = await getSiteContext();
  const p = await getProductBySlug(slug, currency);
  if (!p) notFound();
  const wished = user ? (await db.select().from(schema.wishlistItems).where(and(eq(schema.wishlistItems.userId, user.id), eq(schema.wishlistItems.productId, p.p.id)))).length > 0 : false;
  const inCompare = ((await cookies()).get("hg_compare")?.value ?? "").split(",").includes(p.p.id);
  const specs = Object.entries(p.p.specs);
  return (
    <div className="container py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Shop", href: "/shop" }, { label: p.category.name, href: `/shop?category=${p.category.slug}` }, { label: p.p.name }]} />
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <ProductGallery images={p.p.images} alt={p.p.name} />
        <div>
          {p.brand && <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{p.brand}</p>}
          <h1 className="mt-1 text-3xl font-bold leading-tight">{p.p.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
            <Stars value={Number(p.p.ratingAvg)} count={p.p.ratingCount} />
            <span>SKU {p.variants.find((v) => v.isDefault)?.sku ?? p.p.sku}</span>
            {!p.vendor.isCompany && <span>Sold by {p.vendor.name}</span>}
          </div>
          <p className="mt-4 text-ink-soft">{p.p.summary}</p>
          <div className="mt-6">
            <ProductBuy productId={p.p.id} variants={p.variants} currency={currency} allowBackorder={p.p.allowBackorder} wished={wished} signedIn={!!user} inCompare={inCompare} />
          </div>
          <ul className="mt-8 grid gap-3 border-t border-sand-200 pt-6 text-sm sm:grid-cols-3">
            <li className="flex gap-2"><Truck className="h-5 w-5 shrink-0 text-forest-600" /> Delivery in 1–3 days in Accra & Kumasi</li>
            <li className="flex gap-2"><RotateCcw className="h-5 w-5 shrink-0 text-forest-600" /> {settings.commerce.returnWindowDays}-day returns on unused items</li>
            <li className="flex gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-forest-600" /> Secure Mobile Money and card payment</li>
          </ul>
        </div>
      </div>
      <div className="mt-14 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="text-xl font-bold">Description</h2>
          <div className="mt-3 space-y-3 text-ink-soft">{p.p.description.split("\n").filter(Boolean).map((t, i) => <p key={i}>{t}</p>)}</div>
        </section>
        {specs.length > 0 && (
          <section>
            <h2 className="text-xl font-bold">Specifications</h2>
            <table className="mt-3 w-full text-sm">
              <tbody>{specs.map(([k, v]) => <tr key={k} className="border-b border-sand-100"><th scope="row" className="py-2 pr-4 text-left font-normal text-ink-muted">{k}</th><td className="py-2 font-medium">{v}</td></tr>)}</tbody>
            </table>
          </section>
        )}
      </div>
      <section className="mt-14">
        <h2 className="text-xl font-bold">Customer reviews</h2>
        {p.reviews.length === 0 ? (
          <p className="mt-2 text-ink-muted">No reviews yet. Customers can review products from their order page after delivery.</p>
        ) : (
          <ul className="mt-4 grid gap-6 md:grid-cols-2">
            {p.reviews.map(({ r, author }) => (
              <li key={r.id} className="rounded-lg border border-sand-200 p-4">
                <div className="flex justify-between"><Stars value={r.rating} count={undefined} showValue={false} /><span className="text-xs text-ink-muted">{formatDate(r.createdAt)}</span></div>
                {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
                <p className="mt-1 text-sm text-ink-soft">{r.body}</p>
                <p className="mt-2 text-xs text-ink-muted">{author.split(" ")[0]} · Verified purchase</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {p.related.length > 0 && (
        <section className="mt-14">
          <div className="flex items-baseline justify-between"><h2 className="text-xl font-bold">You may also need</h2><Link href={`/shop?category=${p.category.slug}`} className="text-sm link">More in {p.category.name}</Link></div>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
            {p.related.map((r) => <ProductCard key={r.id} product={r} price={r.price} salePrice={r.salePrice} currency={currency} />)}
          </div>
        </section>
      )}
    </div>
  );
}
