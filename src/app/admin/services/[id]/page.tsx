import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { ServiceForm } from "../service-form";
import { CountryPriceForm } from "./price-form";

export const metadata = { title: "Edit service" };

export default async function EditService({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requirePermission("services.manage");
  const { id } = await params;
  const isNew = id === "new";
  const [svc] = isNew ? [undefined] : await db.select().from(schema.services).where(eq(schema.services.id, id));
  if (!isNew && !svc) notFound();
  const [cats, cities, areas, currencies, countries, prices] = await Promise.all([
    db.select({ id: schema.serviceCategories.id, name: schema.serviceCategories.name }).from(schema.serviceCategories).orderBy(asc(schema.serviceCategories.sort)),
    db.select({ id: schema.cities.id, name: schema.cities.name }).from(schema.cities).where(eq(schema.cities.serviceAvailable, true)).orderBy(asc(schema.cities.name)),
    svc ? db.select().from(schema.serviceAreas).where(eq(schema.serviceAreas.serviceId, svc.id)) : Promise.resolve([]),
    db.select({ code: schema.currencies.code }).from(schema.currencies).where(eq(schema.currencies.active, true)),
    db.select().from(schema.countries).where(eq(schema.countries.servicesEnabled, true)),
    svc ? db.select().from(schema.servicePrices).where(eq(schema.servicePrices.serviceId, svc.id)) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title={svc ? svc.name : "New service"} breadcrumbs={[{ label: "Services", href: "/admin/services" }, { label: svc ? "Edit" : "New" }]} actions={svc && <a href={`/services/${svc.slug}`} target="_blank" className="text-sm link">View on site</a>} />
      {(await searchParams).saved && <Alert tone="success" className="mb-4">Service created.</Alert>}
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card className="p-5"><ServiceForm s={svc} categories={cats} cities={cities} selectedAreas={areas.map((a) => a.cityId)} currencies={currencies.map((c) => c.code)} /></Card>
        {svc && (
          <Card className="h-fit">
            <CardHeader title="Country prices" description="Optional. Without an override, the base price is converted at the current exchange rate." />
            <div className="space-y-2 p-5">{countries.map((c) => { const p = prices.find((x) => x.countryCode === c.code); return <CountryPriceForm key={c.code} serviceId={svc.id} country={c} currency={c.currency} base={p?.basePrice} min={p?.minimumCharge} />; })}</div>
          </Card>
        )}
      </div>
    </>
  );
}
