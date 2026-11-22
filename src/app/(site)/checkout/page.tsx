import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { getDisplayCurrency } from "@/server/site";
import { getOrCreateCart, cartLines } from "@/server/commerce/cart";
import { deliveryOptions } from "@/server/commerce/orders";
import { providersFor } from "@/server/payments/registry";
import { getRate } from "@/server/currency";
import { CheckoutForm } from "./checkout-form";

export const metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const currency = await getDisplayCurrency();
  const cart = await getOrCreateCart({ userId: user.id });
  const lines = await cartLines(cart.id, currency);
  if (!lines.length) redirect("/cart");
  const [addresses, countries, cities] = await Promise.all([
    db.select().from(schema.addresses).where(eq(schema.addresses.userId, user.id)),
    db.select().from(schema.countries).where(and(eq(schema.countries.active, true), eq(schema.countries.shippingEnabled, true))),
    db.select({ id: schema.cities.id, name: schema.cities.name, countryCode: schema.cities.countryCode }).from(schema.cities).where(eq(schema.cities.active, true)).orderBy(asc(schema.cities.name)),
  ]);
  const shippable = addresses.filter((a) => countries.some((c) => c.code === a.countryCode));
  // delivery options and payment methods per country, prices converted to the display currency
  const byCountry: Record<string, { providers: { key: string; label: string; description: string }[]; methods: Record<number, { id: number; name: string; price: number; freeOver: number | null; type: string; minDays: number; maxDays: number }[]> }> = {};
  for (const c of countries) {
    const providers = providersFor(c.paymentProviders, currency).map((p) => ({ key: p.key, label: p.label, description: p.description }));
    const methods: Record<number, { id: number; name: string; price: number; freeOver: number | null; type: string; minDays: number; maxDays: number }[]> = {};
    for (const city of cities.filter((x) => x.countryCode === c.code)) {
      const opts = await deliveryOptions(c.code, city.id);
      methods[city.id] = await Promise.all(
        opts.map(async (m) => {
          const r = await getRate(m.currency, currency);
          return { id: m.id, name: m.name, price: Math.round(m.price * r), freeOver: m.freeOver != null ? Math.round(m.freeOver * r) : null, type: m.type, minDays: m.minDays, maxDays: m.maxDays };
        }),
      );
    }
    byCountry[c.code] = { providers, methods };
  }
  return (
    <div className="container max-w-6xl py-10">
      <h1 className="h-page">Checkout</h1>
      <CheckoutForm
        currency={currency}
        lines={lines.map((l) => ({ variantId: l.variantId, name: l.name, variantName: l.variantName, quantity: l.quantity, lineTotal: l.lineTotal, image: l.image }))}
        addresses={shippable.map((a) => ({ id: a.id, label: a.label, text: `${a.recipient}, ${a.line1}, ${a.city}`, countryCode: a.countryCode, cityId: a.cityId }))}
        countries={countries.map((c) => ({ code: c.code, name: c.name }))}
        cities={cities}
        byCountry={byCountry}
        defaultPhone={user.phone ?? ""}
        defaultName={user.fullName}
      />
    </div>
  );
}
