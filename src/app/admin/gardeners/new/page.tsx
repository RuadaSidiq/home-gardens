import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { serviceCities } from "@/server/queries/catalog";
import { PageHeader } from "@/components/ui/primitives";
import { NewGardenerForm } from "./form";

export const metadata = { title: "Add company gardener" };
export default async function P() {
  await requirePermission("staff.manage");
  const [cities, services] = await Promise.all([serviceCities(), db.select({ id: schema.services.id, name: schema.services.name }).from(schema.services).where(eq(schema.services.active, true))]);
  return (<><PageHeader title="Add company gardener" description="Company gardeners are employees: they're approved immediately and jobs are assigned to them directly." breadcrumbs={[{ label: "Gardeners", href: "/admin/gardeners" }, { label: "New" }]} /><NewGardenerForm cities={cities} services={services} /></>);
}
