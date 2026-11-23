import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { MethodForm, ZoneForm } from "./forms";

export const metadata = { title: "Delivery" };

export default async function Delivery() {
  await requirePermission("locations.manage");
  const [zones, methods, cities, countries] = await Promise.all([
    db.select().from(schema.shippingZones).orderBy(asc(schema.shippingZones.countryCode), asc(schema.shippingZones.id)),
    db.select().from(schema.deliveryMethods).orderBy(asc(schema.deliveryMethods.id)),
    db.select({ id: schema.cities.id, name: schema.cities.name, countryCode: schema.cities.countryCode }).from(schema.cities).orderBy(asc(schema.cities.name)),
    db.select({ code: schema.countries.code }).from(schema.countries),
  ]);
  return (
    <>
      <PageHeader title="Delivery zones & methods" description="Columns: name · type · base price · per kg · currency · free-over threshold · min/max days." />
      <div className="space-y-6">
        {zones.map((z) => (
          <Card key={z.id}>
            <CardHeader title={`${z.name} (${z.countryCode})`} />
            <div className="space-y-4 p-5">
              <ZoneForm z={z} cities={cities} countries={countries.map((c) => c.code)} />
              <div className="space-y-2 border-t border-sand-200 pt-4">{methods.filter((m) => m.zoneId === z.id).map((m) => <MethodForm key={m.id} zoneId={z.id} m={m} />)}<div className="rounded bg-sand-50 p-2"><MethodForm zoneId={z.id} /></div></div>
            </div>
          </Card>
        ))}
        <Card><CardHeader title="Add zone" /><div className="p-5"><ZoneForm cities={cities} countries={countries.map((c) => c.code)} /></div></Card>
      </div>
    </>
  );
}
