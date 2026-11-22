import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireGardener } from "@/server/auth/session";
import { serviceCities } from "@/server/queries/catalog";
import { PageHeader } from "@/components/ui/primitives";
import { toMajor } from "@/lib/money";
import { ServicesForm } from "./form";

export const metadata = { title: "Services & areas" };

export default async function GardenerServices() {
  const u = await requireGardener();
  const [[g], all, mine, areas, cities] = await Promise.all([
    db.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, u.gardenerId)),
    db.select({ id: schema.services.id, name: schema.services.name, category: schema.serviceCategories.name, pricingModel: schema.services.pricingModel }).from(schema.services).innerJoin(schema.serviceCategories, eq(schema.serviceCategories.id, schema.services.categoryId)).where(eq(schema.services.active, true)).orderBy(asc(schema.serviceCategories.sort), asc(schema.services.name)),
    db.select().from(schema.gardenerServices).where(eq(schema.gardenerServices.gardenerId, u.gardenerId)),
    db.select().from(schema.gardenerServiceAreas).where(eq(schema.gardenerServiceAreas.gardenerId, u.gardenerId)),
    serviceCities(),
  ]);
  return (
    <>
      <PageHeader title="Services & areas" description={u.gardenerType === "independent" ? "Choose what you offer and, optionally, your own price. Leave the price empty to use the platform price." : "Services you're trained for. Operations may also update these."} />
      <ServicesForm
        services={all.map((s) => { const m = mine.find((x) => x.serviceId === s.id); return { ...s, on: !!m, customPrice: m?.customPrice ? String(toMajor(m.customPrice, g!.currency)) : "" }; })}
        cities={cities} areas={areas.map((a) => a.cityId)} baseCityId={g!.baseCityId} independent={u.gardenerType === "independent"} currency={g!.currency}
      />
    </>
  );
}
