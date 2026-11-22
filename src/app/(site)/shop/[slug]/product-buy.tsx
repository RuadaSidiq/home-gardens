"use client";
import Link from "next/link";
import { useState } from "react";
import { Heart, GitCompare, Minus, Plus } from "lucide-react";
import { ActionForm, ActionButton, SubmitButton } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { addToCart } from "@/app/(site)/actions";
import { toggleCompare, toggleWishlist } from "../actions";

type V = { id: string; name: string; isDefault: boolean; stock: number; price: number; salePrice: number | null; options: Record<string, string> };

export function ProductBuy({ productId, variants, currency, allowBackorder, wished, signedIn, inCompare }: { productId: string; variants: V[]; currency: string; allowBackorder: boolean; wished: boolean; signedIn: boolean; inCompare: boolean }) {
  const [vid, setVid] = useState(variants.find((v) => v.stock > 0)?.id ?? variants[0]!.id);
  const [qty, setQty] = useState(1);
  const v = variants.find((x) => x.id === vid)!;
  const out = v.stock <= 0 && !allowBackorder;
  const max = allowBackorder ? 99 : Math.max(1, Math.min(99, v.stock));
  return (
    <div>
      <p className="flex items-baseline gap-3">
        <span className="text-3xl font-bold">{formatMoney(v.salePrice ?? v.price, currency)}</span>
        {v.salePrice != null && <span className="text-lg text-ink-muted line-through">{formatMoney(v.price, currency)}</span>}
      </p>
      <p className="mt-1 text-sm text-ink-muted">Price includes delivery-ready packaging. Taxes calculated at checkout.</p>
      {variants.length > 1 && (
        <fieldset className="mt-6">
          <legend className="text-sm font-semibold">{Object.keys(v.options)[0] ?? "Option"}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {variants.map((x) => (
              <button key={x.id} type="button" onClick={() => { setVid(x.id); setQty(1); }} aria-pressed={vid === x.id}
                className={cn("rounded-md border px-3.5 py-2 text-sm font-medium", vid === x.id ? "border-ink bg-ink text-white" : "border-sand-300 hover:border-ink-muted", x.stock <= 0 && !allowBackorder && "text-ink-muted line-through")}>
                {x.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <p className={cn("mt-5 text-sm font-medium", v.stock > 5 ? "text-forest-700" : v.stock > 0 ? "text-amber-600" : "text-clay-600")}>
        {v.stock > 5 ? "In stock" : v.stock > 0 ? `Only ${v.stock} left` : allowBackorder ? "Available on backorder – ships in 2–3 weeks" : "Out of stock"}
      </p>
      <ActionForm action={addToCart} className="mt-4" successMessage="Added to your cart.">
        <input type="hidden" name="variantId" value={vid} />
        <input type="hidden" name="quantity" value={qty} />
        <div className="flex gap-3">
          <div className="flex h-12 items-center rounded-md border border-sand-300">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-full w-10 items-center justify-center hover:bg-sand-100" aria-label="Decrease quantity"><Minus className="h-4 w-4" /></button>
            <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(max, q + 1))} className="flex h-full w-10 items-center justify-center hover:bg-sand-100" aria-label="Increase quantity"><Plus className="h-4 w-4" /></button>
          </div>
          <SubmitButton size="lg" className="flex-1" disabled={out}>{out ? "Out of stock" : "Add to cart"}</SubmitButton>
        </div>
      </ActionForm>
      <div className="mt-3 flex flex-wrap gap-2">
        {signedIn ? (
          <ActionButton action={toggleWishlist} fields={{ productId }} variant="ghost"><Heart className={wished ? "h-4 w-4 fill-clay-500 text-clay-500" : "h-4 w-4"} /> {wished ? "In wishlist" : "Add to wishlist"}</ActionButton>
        ) : (
          <Link href="/login" className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold text-ink-soft hover:bg-sand-100"><Heart className="h-4 w-4" /> Add to wishlist</Link>
        )}
        <ActionButton action={toggleCompare} fields={{ productId }} variant="ghost"><GitCompare className="h-4 w-4" /> {inCompare ? "Remove from compare" : "Compare"}</ActionButton>
        <Link href="/cart" className="inline-flex h-8 items-center rounded-md px-3 text-[13px] font-semibold text-forest-700 hover:bg-forest-50">View cart</Link>
      </div>
    </div>
  );
}
