import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { getSiteContext } from "@/server/site";
import { db, schema } from "@/db";
import { inArray } from "drizzle-orm";
import { getProductBySlug } from "@/server/queries/catalog";
import { EmptyState } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { toggleCompare } from "../actions";

export const metadata = { title: "Compare products" };

export default async function ComparePage() {
  const ids = ((await cookies()).get("hg_compare")?.value ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const { currency } = await getSiteContext();
  const rows = ids.length ? await db.select({ slug: schema.products.slug }).from(schema.products).where(inArray(schema.products.id, ids)) : [];
  const products = (await Promise.all(rows.map((r) => getProductBySlug(r.slug, currency)))).filter((p): p is NonNullable<typeof p> => !!p);
  const keys = [...new Set(products.flatMap((p) => Object.keys(p.p.specs)))];
  return (
    <div className="container py-10">
      <h1 className="h-page">Compare products</h1>
      {products.length === 0 ? (
        <EmptyState className="mt-8" title="Nothing to compare yet" description="Use the Compare button on product pages to add up to four items." action={<ButtonLink href="/shop">Browse the shop</ButtonLink>} />
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-40" />
                {products.map((p) => (
                  <th key={p.p.id} className="p-3 text-left align-top font-normal">
                    <div className="relative aspect-square w-full max-w-[180px] overflow-hidden rounded-lg bg-sand-100">{p.p.images[0] && <Image src={p.p.images[0]} alt="" fill sizes="180px" className="object-cover" />}</div>
                    <Link href={`/shop/${p.p.slug}`} className="mt-2 block font-semibold hover:text-forest-700">{p.p.name}</Link>
                    <div className="mt-2"><ActionButton action={toggleCompare} fields={{ productId: p.p.id }} variant="ghost">Remove</ActionButton></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-sand-200"><th className="p-3 text-left font-medium text-ink-muted">Price</th>{products.map((p) => { const v = p.variants[0]!; return <td key={p.p.id} className="p-3 font-semibold">{formatMoney(v.salePrice ?? v.price, currency)}</td>; })}</tr>
              <tr className="border-t border-sand-200"><th className="p-3 text-left font-medium text-ink-muted">Brand</th>{products.map((p) => <td key={p.p.id} className="p-3">{p.brand ?? "—"}</td>)}</tr>
              <tr className="border-t border-sand-200"><th className="p-3 text-left font-medium text-ink-muted">Availability</th>{products.map((p) => <td key={p.p.id} className="p-3">{p.variants.some((v) => v.stock > 0) ? "In stock" : "Out of stock"}</td>)}</tr>
              {keys.map((k) => <tr key={k} className="border-t border-sand-200"><th className="p-3 text-left font-medium text-ink-muted">{k}</th>{products.map((p) => <td key={p.p.id} className="p-3">{p.p.specs[k] ?? "—"}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
