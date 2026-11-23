import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { serviceCities } from "@/server/queries/catalog";
import { PageHeader } from "@/components/ui/primitives";
import { NewBookingForm } from "./form";

export const metadata = { title: "New booking" };
export default async function NewBooking() {
  await requirePermission("bookings.manage");
  const [services, cities] = await Promise.all([db.select({ id: schema.services.id, name: schema.services.name }).from(schema.services).where(eq(schema.services.active, true)), serviceCities()]);
  return (<><PageHeader title="New booking" breadcrumbs={[{ label: "Bookings", href: "/admin/bookings" }, { label: "New" }]} /><NewBookingForm services={services} cities={cities} /></>);
}
