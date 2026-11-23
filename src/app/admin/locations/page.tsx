import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { getRate } from "@/server/currency";
import { Card, CardHeader, PageHeader, Badge } from "@/components/ui/primitives";
import { formatDateTime, cn } from "@/lib/utils";
import { CityForm, CountryForm, CurrencyToggle, RateForm, TaxForm } from "./forms";

export const metadata = { title: "Locations, currencies & tax" };
const TABS = [["countries", "Countries"], ["cities", "Cities & areas"], ["currencies", "Currencies & rates"], ["taxes", "Taxes"]] as const;

export default async function Locations({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission("locations.manage");
  const tab = (await searchParams).tab ?? "countries";
  const [countries, currencies] = await Promise.all([db.select().from(schema.countries).orderBy(asc(schema.countries.name)), db.select().from(schema.currencies)]);
  const codes = countries.map((c) => c.code);
  return (
    <>
      <PageHeader title="Locations, currencies & tax" description="Nothing about Ghana is hard-coded: add a country, its currency, taxes, providers and areas to start operating there." />
      <nav className="scrollbar-none -mx-4 mb-5 flex gap-1 overflow-x-auto px-4">{TABS.map(([k, l]) => <Link key={k} href={`/admin/locations?tab=${k}`} className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm font-medium", tab === k ? "bg-ink text-white" : "text-ink-soft hover:bg-white")}>{l}</Link>)}</nav>
      {tab === "countries" && <div className="space-y-4">{countries.map((c) => <Card key={c.code}><CardHeader title={`${c.name} (${c.code})`} action={<span className="flex gap-1">{c.servicesEnabled && <Badge tone="green">Services</Badge>}{c.shippingEnabled && <Badge tone="blue">Shop</Badge>}</span>} /><div className="p-5"><CountryForm c={c} currencies={currencies.map((x) => x.code)} /></div></Card>)}<Card><CardHeader title="Add country" /><div className="p-5"><CountryForm currencies={currencies.map((x) => x.code)} /></div></Card></div>}
      {tab === "cities" && <CitiesTab countries={codes} />}
      {tab === "currencies" && <CurrenciesTab currencies={currencies} />}
      {tab === "taxes" && <TaxesTab countries={codes} />}
    </>
  );
}

async function CitiesTab({ countries }: { countries: string[] }) {
  const cities = await db.select({ c: schema.cities, region: schema.regions.name }).from(schema.cities).leftJoin(schema.regions, eq(schema.regions.id, schema.cities.regionId)).orderBy(asc(schema.cities.countryCode), asc(schema.cities.name));
  return <Card><CardHeader title="Cities & service areas" description="'Services' makes an area bookable; also add it to services and gardener coverage." /><div className="divide-y divide-sand-100">{cities.map(({ c, region }) => <div key={c.id} className="px-5 py-2.5"><CityForm c={{ ...c, region }} countries={countries} /></div>)}<div className="bg-sand-50 px-5 py-3"><CityForm countries={countries} /></div></div></Card>;
}

async function CurrenciesTab({ currencies }: { currencies: (typeof schema.currencies.$inferSelect)[] }) {
  const history = await db.select().from(schema.exchangeRates).orderBy(desc(schema.exchangeRates.effectiveAt)).limit(20);
  const codes = currencies.map((c) => c.code);
  const toGhs = await Promise.all(codes.map(async (c) => ({ c, r: await getRate(c, "GHS").catch(() => null) })));
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Currencies" description="Prices are stored with their currency. Display prices convert at the latest rate; orders snapshot the rate used." />
        <ul className="divide-y divide-sand-100 text-sm">{currencies.map((c) => <li key={c.code} className="flex items-center justify-between px-5 py-2.5"><span><strong>{c.code}</strong> {c.name} ({c.symbol}) <span className="text-ink-muted">· 1 {c.code} ≈ {toGhs.find((x) => x.c === c.code)?.r?.toFixed(4) ?? "no rate"} GHS</span></span><span className="flex items-center gap-2">{c.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}<CurrencyToggle code={c.code} active={c.active} /></span></li>)}</ul>
      </Card>
      <Card><CardHeader title="Set exchange rate" description="Rates are kept as history; the newest rate for a pair is used. Inverse and cross rates (via USD) are derived automatically." /><div className="p-5"><RateForm currencies={codes} /></div></Card>
      <Card><CardHeader title="Rate history" /><ul className="divide-y divide-sand-100 text-sm">{history.map((r) => <li key={r.id} className="flex justify-between px-5 py-2"><span>1 {r.base} = {Number(r.rate)} {r.quote}</span><span className="text-xs text-ink-muted">{r.source} · {formatDateTime(r.effectiveAt)}</span></li>)}</ul></Card>
    </div>
  );
}

async function TaxesTab({ countries }: { countries: string[] }) {
  const taxes = await db.select().from(schema.taxConfigurations).orderBy(asc(schema.taxConfigurations.countryCode));
  return <Card><CardHeader title="Taxes" description="Exclusive taxes are added at checkout; inclusive taxes are already in the price and shown for information." /><div className="divide-y divide-sand-100">{taxes.map((t) => <div key={t.id} className="px-5 py-2.5"><TaxForm t={t} countries={countries} /></div>)}<div className="bg-sand-50 px-5 py-3"><TaxForm countries={countries} /></div></div></Card>;
}
