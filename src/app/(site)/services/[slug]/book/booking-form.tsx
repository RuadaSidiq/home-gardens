"use client";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Loader2, Star, Users } from "lucide-react";
import { ActionForm, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Avatar } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { submitBooking } from "./actions";

type Svc = { id: string; name: string; pricingModel: string; durationMinutes: number; depositPercent: number };
type Slot = { time: string; gardeners: number };
type G = { id: string; name: string; type: string; rating: number; ratingCount: number; years: number; verified: boolean; headline: string; avatar: string | null };
type Quote =
  | { kind: "priced"; couponError: string | null; currency: string; subtotal: number; discount: number; tax: number; taxLines: { name: string; amount: number }[]; total: number; deposit: number; isFinal: boolean; breakdown: string; depositPercent: number }
  | { kind: "quote"; reason: string; currency: string }
  | { error: string; field?: string };

function Step({ n, title, children, hint }: { n: number; title: string; children: React.ReactNode; hint?: string }) {
  return (
    <fieldset className="border-t border-sand-200 pt-6 first:border-t-0 first:pt-0">
      <legend className="flex items-center gap-3 text-lg font-semibold">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-forest-600 text-sm font-bold text-white">{n}</span>
        {title}
      </legend>
      {hint && <p className="mt-1 pl-10 text-sm text-ink-muted">{hint}</p>}
      <div className="mt-4 sm:pl-10">{children}</div>
    </fieldset>
  );
}

export function BookingForm({ service, cities, initialCity, defaults, minDate, maxDate, requested }: {
  service: Svc; cities: { id: number; name: string }[]; initialCity?: number; defaults: { line1: string; line2: string; digitalAddress: string; phone: string };
  minDate: string; maxDate: string; requested: { id: string; name: string } | null;
}) {
  const [cityId, setCityId] = useState<number | "">(initialCity && cities.some((c) => c.id === initialCity) ? initialCity : "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [size, setSize] = useState("");
  const [hours, setHours] = useState(service.pricingModel === "hourly" ? String(Math.max(1, Math.round(service.durationMinutes / 60))) : "");
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [gardenerMode, setGardenerMode] = useState<"match" | "choose">(requested ? "choose" : "match");
  const [gardenerId, setGardenerId] = useState(requested?.id ?? "");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [flexible, setFlexible] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [gardeners, setGardeners] = useState<G[] | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const isQuote = service.pricingModel === "quote" || service.pricingModel === "inspection";

  // Slots for the chosen date (filtered by the requested gardener when one is chosen)
  useEffect(() => {
    if (!cityId || !date) return setSlots(null);
    setLoadingSlots(true);
    const q = new URLSearchParams({ service: service.id, city: String(cityId), date, hours });
    if (gardenerMode === "choose" && requested && gardenerId === requested.id) q.set("gardener", requested.id);
    fetch(`/api/booking/slots?${q}`)
      .then((r) => r.json())
      .then((d) => { setSlots(d.slots ?? []); setFlexible(!!d.flexible); })
      .finally(() => setLoadingSlots(false));
  }, [cityId, date, hours, service.id, gardenerMode, gardenerId, requested]);

  useEffect(() => {
    if (!cityId || !date || !time) return setGardeners(null);
    const q = new URLSearchParams({ service: service.id, city: String(cityId), date, time, hours });
    fetch(`/api/booking/gardeners?${q}`).then((r) => r.json()).then((d) => setGardeners(d.gardeners ?? []));
  }, [cityId, date, time, hours, service.id]);

  // keep chosen gardener valid for the slot
  useEffect(() => {
    if (gardeners && gardenerId && !gardeners.some((g) => g.id === gardenerId)) setGardenerId("");
  }, [gardeners, gardenerId]);

  useEffect(() => {
    const q = new URLSearchParams({ service: service.id, country: "GH" });
    if (size) q.set("size", size);
    if (hours) q.set("hours", hours);
    if (gardenerMode === "choose" && gardenerId) q.set("gardener", gardenerId);
    if (appliedCoupon) q.set("coupon", appliedCoupon);
    const t = setTimeout(() => fetch(`/api/booking/quote?${q}`).then((r) => r.json()).then(setQuote), 250);
    return () => clearTimeout(t);
  }, [service.id, size, hours, gardenerId, gardenerMode, appliedCoupon]);

  const availableSlots = useMemo(() => (slots ?? []).filter((s) => s.gardeners > 0 || flexible), [slots, flexible]);
  const couponError = quote && "kind" in quote && quote.kind === "priced" ? quote.couponError : null;

  return (
    <ActionForm action={submitBooking} className="mt-8 grid gap-10 lg:grid-cols-[1fr_20rem]" refresh={false} encType="multipart/form-data">
      <div className="space-y-8">
        <input type="hidden" name="serviceId" value={service.id} />
        <input type="hidden" name="countryCode" value="GH" />
        <input type="hidden" name="time" value={time} />
        <input type="hidden" name="gardenerId" value={gardenerMode === "choose" ? gardenerId : ""} />
        <input type="hidden" name="couponCode" value={couponError ? "" : appliedCoupon} />

        <Step n={1} title="Where is the garden?">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Area" name="cityId" required value={cityId} onChange={(e) => { setCityId(e.target.value ? Number(e.target.value) : ""); setTime(""); }} placeholder="Select area" options={cities.map((c) => ({ value: c.id, label: c.name }))} />
            <Input label="Contact phone" name="contactPhone" type="tel" required defaultValue={defaults.phone} autoComplete="tel" />
            <Input label="Street address" name="line1" required defaultValue={defaults.line1} autoComplete="address-line1" wrapClassName="sm:col-span-2" />
            <Input label="House name, landmark (optional)" name="line2" defaultValue={defaults.line2} />
            <Input label="GhanaPost GPS address (optional)" name="digitalAddress" defaultValue={defaults.digitalAddress} placeholder="GA-123-4567" />
          </div>
          {cities.length === 0 && <p className="mt-3 text-sm text-clay-600">This service isn't available in any area yet.</p>}
        </Step>

        <Step n={2} title="About the job">
          <div className="grid gap-4 sm:grid-cols-2">
            {service.pricingModel === "per_sqm" && (
              <Input label="Garden / area size (m²)" name="gardenSizeSqm" type="number" min={1} required value={size} onChange={(e) => setSize(e.target.value)} hint="A typical townhouse lawn is 50–150 m²; a large compound 300–800 m²." />
            )}
            {service.pricingModel !== "per_sqm" && (
              <Input label="Approximate garden size (m², optional)" name="gardenSizeSqm" type="number" min={1} value={size} onChange={(e) => setSize(e.target.value)} />
            )}
            {service.pricingModel === "hourly" && (
              <Select label="Hours needed" name="hours" value={hours} onChange={(e) => { setHours(e.target.value); setTime(""); }} options={[1, 2, 3, 4, 5, 6, 8].map((h) => ({ value: h, label: `${h} hour${h > 1 ? "s" : ""}` }))} />
            )}
          </div>
          <Textarea label="Describe the work" name="details" required wrapClassName="mt-4" placeholder="e.g. Front and back lawn, about 200 m². Hedge along the gate needs shaping. Dogs will be inside." />
          <Input label="Photos (optional, up to 6)" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple wrapClassName="mt-4" hint={isQuote ? "Photos help us quote accurately without a visit." : "Helps your gardener bring the right tools."} />
        </Step>

        <Step n={3} title="When?" hint={isQuote ? "Choose a time for the site visit or start of work. We'll confirm with the quote." : undefined}>
          <Input label="Date" name="date" type="date" required min={minDate} max={maxDate} value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }} wrapClassName="max-w-xs" />
          {date && cityId && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Start time</p>
              {loadingSlots ? (
                <p className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" /> Checking availability…</p>
              ) : availableSlots.length === 0 ? (
                <p className="rounded-md bg-sand-100 px-3 py-2 text-sm text-ink-soft">No gardeners are free on this date. Please try another day.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {availableSlots.map((s) => (
                    <button key={s.time} type="button" onClick={() => setTime(s.time)} aria-pressed={time === s.time}
                      className={cn("rounded-md border px-2 py-2 text-sm font-semibold tabular-nums transition-colors", time === s.time ? "border-forest-600 bg-forest-600 text-white" : "border-sand-300 hover:border-forest-500")}>
                      {s.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {(!date || !cityId) && <p className="mt-2 text-sm text-ink-muted">Select your area and a date to see available times.</p>}
        </Step>

        <Step n={4} title="Who?">
          <div className="grid gap-2 sm:grid-cols-2">
            {(["match", "choose"] as const).map((m) => (
              <label key={m} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3.5", gardenerMode === m ? "border-forest-600 bg-forest-50" : "border-sand-300 hover:border-sand-400")}>
                <input type="radio" name="_mode" className="mt-1 accent-forest-600" checked={gardenerMode === m} onChange={() => setGardenerMode(m)} />
                <span>
                  <span className="block font-semibold">{m === "match" ? "Match me with the best available" : "Choose a gardener"}</span>
                  <span className="block text-sm text-ink-muted">{m === "match" ? "Based on area, experience, reviews and workload." : "Pick from gardeners free at your chosen time."}</span>
                </span>
              </label>
            ))}
          </div>
          {gardenerMode === "choose" && (
            <div className="mt-4">
              {!time ? (
                <p className="text-sm text-ink-muted">{requested ? `You asked for ${requested.name}. Choose a time to confirm they're available.` : "Choose a date and time first."}</p>
              ) : gardeners === null ? (
                <p className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
              ) : gardeners.length === 0 ? (
                <p className="text-sm text-ink-muted">No gardener profiles are free at this time; we'll match you instead.</p>
              ) : (
                <ul className="grid gap-2">
                  {gardeners.map((g) => (
                    <li key={g.id}>
                      <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3", gardenerId === g.id ? "border-forest-600 bg-forest-50" : "border-sand-200 hover:border-sand-400")}>
                        <input type="radio" name="_g" className="accent-forest-600" checked={gardenerId === g.id} onChange={() => setGardenerId(g.id)} />
                        <Avatar name={g.name} src={g.avatar} size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 font-semibold">{g.name}{g.verified && <BadgeCheck className="h-4 w-4 text-forest-600" />}</span>
                          <span className="block truncate text-sm text-ink-muted">{g.headline}</span>
                        </span>
                        <span className="text-right text-xs text-ink-muted">
                          {g.ratingCount ? <span className="flex items-center gap-0.5 font-semibold text-ink"><Star className="h-3 w-3 fill-amber-500 text-amber-500" />{g.rating.toFixed(1)}</span> : "New"}
                          <span className="block">{g.years} yrs</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {gardenerMode === "match" && <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted"><Users className="h-4 w-4" /> We'll confirm your gardener after payment.</p>}
        </Step>

        <Step n={5} title="Anything else?">
          <Textarea label="Notes for your gardener (optional)" name="customerNotes" rows={2} placeholder="Gate code, parking, pets…" />
        </Step>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-lg border border-sand-200 bg-sand-50 p-5">
          <h2 className="font-semibold">{service.name}</h2>
          <p className="mt-1 text-sm text-ink-muted">{date && time ? `${new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} at ${time}` : "Date and time not chosen"}</p>
          <div className="mt-4 border-t border-sand-200 pt-4 text-sm">
            {!quote ? (
              <p className="text-ink-muted">Calculating…</p>
            ) : "error" in quote ? (
              <p className="text-ink-muted">{quote.error}</p>
            ) : quote && "kind" in quote && quote.kind === "quote" ? (
              <p className="text-ink-soft">{quote.reason} No payment is needed now.</p>
            ) : quote && "kind" in quote && quote.kind === "priced" ? (
              <dl className="space-y-1.5">
                <div className="flex justify-between"><dt className="text-ink-muted">{quote.breakdown}</dt><dd className="tabular-nums">{formatMoney(quote.subtotal, quote.currency)}</dd></div>
                {quote.discount > 0 && <div className="flex justify-between text-forest-700"><dt>Discount</dt><dd className="tabular-nums">−{formatMoney(quote.discount, quote.currency)}</dd></div>}
                {quote.taxLines.map((t) => <div key={t.name} className="flex justify-between"><dt className="text-ink-muted">{t.name}</dt><dd className="tabular-nums">{formatMoney(t.amount, quote.currency)}</dd></div>)}
                <div className="flex justify-between border-t border-sand-200 pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(quote.total, quote.currency)}</dd></div>
                {quote.depositPercent > 0 && quote.depositPercent < 100 && <p className="pt-1 text-ink-muted">Deposit to confirm: <strong className="text-ink">{formatMoney(quote.deposit, quote.currency)}</strong> ({quote.depositPercent}%)</p>}
                {!quote.isFinal && <p className="pt-1 text-xs text-ink-muted">Starting price – your gardener may propose a revised price after seeing the site. You decide whether to accept.</p>}
              </dl>
            ) : null}
          </div>
          {!isQuote && (
            <div className="mt-4 border-t border-sand-200 pt-4">
              <label htmlFor="coupon" className="text-sm font-medium">Discount code</label>
              <div className="mt-1.5 flex gap-2">
                <input id="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} className="h-9 min-w-0 flex-1 rounded-md border border-sand-300 px-2.5 text-sm uppercase focus:border-forest-500 focus:outline-none" />
                <button type="button" onClick={() => setAppliedCoupon(coupon.trim())} className="h-9 rounded-md border border-sand-300 bg-white px-3 text-sm font-semibold hover:bg-sand-100">Apply</button>
              </div>
              {couponError && <p className="mt-1 text-xs text-clay-600">{couponError}</p>}
              {appliedCoupon && !couponError && quote && "kind" in quote && quote.kind === "priced" && quote.discount > 0 && <p className="mt-1 text-xs text-forest-700">Code {appliedCoupon} applied.</p>}
            </div>
          )}
          <SubmitButton size="lg" className="mt-5 w-full" disabled={!time || !cityId} pendingLabel="Saving…">{isQuote ? "Send request" : "Continue to payment"}</SubmitButton>
          {(!time || !cityId) && <p className="mt-2 text-center text-xs text-ink-muted">Choose an area, date and time to continue.</p>}
        </div>
      </aside>
    </ActionForm>
  );
}
