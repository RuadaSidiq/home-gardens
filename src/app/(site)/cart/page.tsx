import Image from "next/image";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { getCartOwner, getSiteContext } from "@/server/site";
import { cartLines, findCart } from "@/server/commerce/cart";
import { EmptyState } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { QtyControl } from "./cart-line";

export const metadata = { title: "Your cart" };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const { currency, user } = await getSiteContext();
  const owner = await getCartOwner();
  const cart = owner ? await findCart(owner) : null;
  const lines = cart ? await cartLines(cart.id, currency) : [];
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const problems = lines.filter((l) => !l.allowBackorder && l.quantity > l.stock);
  return (
    <div className="container py-10">
      <h1 className="h-page">Your cart</h1>
      {lines.length === 0 ? (
        <EmptyState className="mt-8" icon={<ShoppingCart className="h-8 w-8" />} title="Your cart is empty" description="Find tools, plants and supplies for your garden." action={<ButtonLink href="/shop">Go to the shop</ButtonLink>} />
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
          <ul className="divide-y divide-sand-200 border-y border-sand-200">
            {lines.map((l) => (
              <li key={l.variantId} className="flex gap-4 py-5">
                <Link href={`/shop/${l.slug}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md bg-sand-100">{l.image && <Image src={l.image} alt="" fill sizes="96px" className="object-cover" />}</Link>
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 sm:flex-row">
                  <div className="min-w-0">
                    <Link href={`/shop/${l.slug}`} className="font-semibold hover:text-forest-700">{l.name}</Link>
                    {l.variantName && <p className="text-sm text-ink-muted">{l.variantName}</p>}
                    <p className="mt-0.5 text-sm text-ink-muted">{formatMoney(l.unitPrice, currency)} each</p>
                    {!l.allowBackorder && l.quantity > l.stock && <p className="mt-1 text-sm font-medium text-clay-600">{l.stock <= 0 ? "Out of stock – please remove" : `Only ${l.stock} available`}</p>}
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                    <p className="font-semibold tabular-nums">{formatMoney(l.lineTotal, currency)}</p>
                    <QtyControl variantId={l.variantId} quantity={l.quantity} max={l.allowBackorder ? 99 : Math.max(l.stock, 1)} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <aside className="h-fit rounded-lg border border-sand-200 bg-sand-50 p-5 lg:sticky lg:top-24">
            <div className="flex justify-between text-base"><span>Subtotal</span><span className="font-semibold tabular-nums">{formatMoney(subtotal, currency)}</span></div>
            <p className="mt-1 text-sm text-ink-muted">Delivery, discounts and taxes are calculated at checkout.</p>
            {currency !== "GHS" && <p className="mt-2 text-xs text-ink-muted">Prices are converted from GHS at today's rate. You'll be charged in {currency}.</p>}
            {problems.length > 0 && <p className="mt-3 rounded-md bg-clay-50 p-2 text-sm text-clay-700">Update the highlighted items before checking out.</p>}
            <ButtonLink href={user ? "/checkout" : "/login?next=/checkout"} size="lg" className={`mt-5 w-full ${problems.length ? "pointer-events-none opacity-50" : ""}`} aria-disabled={problems.length > 0}>
              {user ? "Checkout" : "Sign in to check out"}
            </ButtonLink>
            <Link href="/shop" className="mt-3 block text-center text-sm link">Continue shopping</Link>
          </aside>
        </div>
      )}
    </div>
  );
}
