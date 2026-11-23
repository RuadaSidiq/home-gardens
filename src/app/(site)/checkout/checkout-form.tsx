"use client";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ActionForm, Checkbox, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { placeOrder } from "./actions";

type Method = { id: number; name: string; price: number; freeOver: number | null; type: string; minDays: number; maxDays: number };
type Totals = { subtotal: number; discount: number; shipping: number; tax: number; taxLines: { name: string; amount: number }[]; total: number; couponError: string | null } | { error: string; field?: string };

export function CheckoutForm({ currency, lines, addresses, countries, cities, byCountry, defaultPhone, defaultName }: {
  currency: string;
  lines: { variantId: string; name: string; variantName: string; quantity: number; lineTotal: number; image: string | null }[];
  addresses: { id: string; label: string; text: string; countryCode: string; cityId: number | null }[];
  countries: { code: string; name: string }[];
  cities: { id: number; name: string; countryCode: string }[];
  byCountry: Record<string, { providers: { key: string; label: string; description: string }[]; methods: Record<number, Method[]> }>;
  defaultPhone: string;
  defaultName: string;
}) {
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [country, setCountry] = useState(addresses[0]?.countryCode ?? "GH");
  const [cityId, setCityId] = useState<number | "">(addresses[0]?.cityId ?? "");
  const [methodId, setMethodId] = useState<number | "">("");
  const [provider, setProvider] = useState("");
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState("");
  const [totals, setTotals] = useState<Totals | null>(null);

  useEffect(() => {
    if (addressId) {
      const a = addresses.find((x) => x.id === addressId);
      if (a) { setCountry(a.countryCode); setCityId(a.cityId ?? ""); }
    }
  }, [addressId, addresses]);

  const methods = useMemo(() => (cityId ? byCountry[country]?.methods[cityId] ?? [] : []), [byCountry, country, cityId]);
  const providers = useMemo(() => byCountry[country]?.providers ?? [], [byCountry, country]);
  useEffect(() => { if (!methods.some((m) => m.id === methodId)) setMethodId(methods[0]?.id ?? ""); }, [methods, methodId]);
  useEffect(() => { if (!providers.some((p) => p.key === provider)) setProvider(providers[0]?.key ?? ""); }, [providers, provider]);

  useEffect(() => {
    const q = new URLSearchParams({ country, city: String(cityId || ""), method: String(methodId || ""), coupon: applied });
    fetch(`/api/checkout/price?${q}`).then((r) => r.json()).then(setTotals);
  }, [country, cityId, methodId, applied]);

  const couponErr = totals && !("error" in totals) ? totals.couponError : null;
  const countryCities = cities.filter((c) => c.countryCode === country);

  return (
    <ActionForm action={placeOrder} refresh={false} className="mt-8 grid gap-10 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-10">
        <input type="hidden" name="countryCode" value={country} />
        <input type="hidden" name="deliveryMethodId" value={methodId} />
        <input type="hidden" name="provider" value={provider} />
        <input type="hidden" name="couponCode" value={couponErr ? "" : applied} />
        <section>
          <h2 className="text-lg font-semibold">Delivery address</h2>
          {addresses.length > 0 && (
            <div className="mt-4 grid gap-2">
              {addresses.map((a) => (
                <label key={a.id} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3.5", addressId === a.id ? "border-forest-600 bg-forest-50" : "border-sand-300")}>
                  <input type="radio" name="addressId" value={a.id} checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1 accent-forest-600" />
                  <span><span className="block font-semibold">{a.label}</span><span className="text-sm text-ink-soft">{a.text}</span></span>
                </label>
              ))}
              <label className={cn("flex cursor-pointer gap-3 rounded-lg border p-3.5", !addressId ? "border-forest-600 bg-forest-50" : "border-sand-300")}>
                <input type="radio" name="addressId" value="" checked={!addressId} onChange={() => { setAddressId(""); setCityId(""); }} className="mt-1 accent-forest-600" />
                <span className="font-semibold">Use a new address</span>
              </label>
            </div>
          )}
          {!addressId && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input label="Recipient name" name="recipient" required defaultValue={defaultName} autoComplete="name" />
              <Input label="Phone" name="phone" type="tel" required defaultValue={defaultPhone} autoComplete="tel" />
              <Select label="Country" value={country} onChange={(e) => { setCountry(e.target.value); setCityId(""); }} options={countries.map((c) => ({ value: c.code, label: c.name }))} />
              <Select label="City / area" name="cityId" required value={cityId} onChange={(e) => setCityId(e.target.value ? Number(e.target.value) : "")} placeholder="Select" options={countryCities.map((c) => ({ value: c.id, label: c.name }))} />
              <Input label="Street address" name="line1" required wrapClassName="sm:col-span-2" autoComplete="address-line1" />
              <Input label="Landmark / apartment (optional)" name="line2" />
              <Input label={country === "GH" ? "GhanaPost GPS (optional)" : "Postal code (optional)"} name="digitalAddress" />
              <Checkbox name="saveAddress" label="Save this address to my account" defaultChecked className="sm:col-span-2" />
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold">Delivery method</h2>
          {!cityId ? <p className="mt-2 text-sm text-ink-muted">Choose an address to see delivery options.</p> : methods.length === 0 ? (
            <p className="mt-2 rounded-md bg-clay-50 px-3 py-2 text-sm text-clay-700">We don't deliver to this area yet. Choose a different address or contact us.</p>
          ) : (
            <div className="mt-4 grid gap-2">
              {methods.map((m) => (
                <label key={m.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3.5", methodId === m.id ? "border-forest-600 bg-forest-50" : "border-sand-300")}>
                  <input type="radio" name="_method" checked={methodId === m.id} onChange={() => setMethodId(m.id)} className="accent-forest-600" />
                  <span className="flex-1"><span className="block font-semibold">{m.name}</span>{m.freeOver != null && <span className="text-sm text-ink-muted">Free over {formatMoney(m.freeOver, currency, { noDecimals: true })}</span>}</span>
                  <span className="text-sm font-semibold">{m.type === "pickup" ? "Free" : m.type === "weight" ? `From ${formatMoney(m.price, currency)}` : formatMoney(m.price, currency)}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold">Payment</h2>
          {providers.length === 0 ? (
            <p className="mt-2 rounded-md bg-amber-400/10 px-3 py-2 text-sm text-sand-800">No payment method is available for {currency} in this country yet. Switch the currency at the top of the page or contact us.</p>
          ) : (
            <div className="mt-4 grid gap-2">
              {providers.map((p) => (
                <label key={p.key} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3.5", provider === p.key ? "border-forest-600 bg-forest-50" : "border-sand-300")}>
                  <input type="radio" name="_provider" checked={provider === p.key} onChange={() => setProvider(p.key)} className="mt-1 accent-forest-600" />
                  <span><span className="block font-semibold">{p.label}</span><span className="text-sm text-ink-muted">{p.description}</span></span>
                </label>
              ))}
            </div>
          )}
          <Textarea label="Order note (optional)" name="note" rows={2} wrapClassName="mt-6" placeholder="Delivery instructions" />
        </section>
      </div>

      <aside className="h-fit rounded-lg border border-sand-200 bg-sand-50 p-5 lg:sticky lg:top-24">
        <h2 className="font-semibold">Order summary</h2>
        <ul className="mt-4 space-y-3">
          {lines.map((l) => (
            <li key={l.variantId} className="flex gap-3 text-sm">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-sand-200">{l.image && <Image src={l.image} alt="" fill sizes="48px" className="object-cover" />}<span className="absolute -right-0 -top-0 rounded-bl bg-ink px-1 text-[10px] font-bold text-white">{l.quantity}</span></div>
              <span className="min-w-0 flex-1"><span className="line-clamp-2 font-medium">{l.name}</span>{l.variantName && <span className="text-ink-muted">{l.variantName}</span>}</span>
              <span className="tabular-nums">{formatMoney(l.lineTotal, currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2 border-t border-sand-200 pt-4">
          <label htmlFor="cp" className="sr-only">Discount code</label>
          <input id="cp" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Discount code" className="h-9 min-w-0 flex-1 rounded-md border border-sand-300 px-2.5 text-sm uppercase focus:border-forest-500 focus:outline-none" />
          <button type="button" onClick={() => setApplied(coupon.trim())} className="h-9 rounded-md border border-sand-300 bg-white px-3 text-sm font-semibold">Apply</button>
        </div>
        {couponErr && <p className="mt-1 text-xs text-clay-600">{couponErr}</p>}
        <dl className="mt-4 space-y-1.5 text-sm">
          {totals && !("error" in totals) ? (
            <>
              <div className="flex justify-between"><dt className="text-ink-muted">Subtotal</dt><dd className="tabular-nums">{formatMoney(totals.subtotal, currency)}</dd></div>
              {totals.discount > 0 && <div className="flex justify-between text-forest-700"><dt>Discount</dt><dd className="tabular-nums">−{formatMoney(totals.discount, currency)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-muted">Delivery</dt><dd className="tabular-nums">{totals.shipping ? formatMoney(totals.shipping, currency) : "Free"}</dd></div>
              {totals.taxLines.map((t) => <div key={t.name} className="flex justify-between"><dt className="text-ink-muted">{t.name}</dt><dd className="tabular-nums">{formatMoney(t.amount, currency)}</dd></div>)}
              <div className="flex justify-between border-t border-sand-200 pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(totals.total, currency)}</dd></div>
            </>
          ): totals && "error" in totals ? <p className="text-clay-600">{totals.error}</p> : <p className="text-ink-muted">Calculating…</p>}
        </dl>
        <SubmitButton size="lg" className="mt-5 w-full" disabled={!methodId || !provider} pendingLabel="Placing order…">Place order and pay</SubmitButton>
        <p className="mt-2 text-center text-xs text-ink-muted">Stock is reserved for 60 minutes while you pay.</p>
      </aside>
    </ActionForm>
  );
}
