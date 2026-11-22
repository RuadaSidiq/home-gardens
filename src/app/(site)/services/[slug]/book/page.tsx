import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/server/auth/session";
import { getServiceBySlug } from "@/server/queries/catalog";
import { getSettings } from "@/server/settings";
import { Breadcrumbs } from "@/components/ui/primitives";
import { BookingForm } from "./booking-form";
import { addDaysStr, zonedInfo } from "@/lib/time";

export const metadata = { title: "Book a service" };

export default async function BookPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ city?: string; gardener?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/services/${slug}/book${sp.city ? `?city=${sp.city}` : ""}`)}`);
  const svc = await getServiceBySlug(slug);
  if (!svc) notFound();
  const settings = await getSettings();
  const [address] = await db.select().from(schema.addresses).where(and(eq(schema.addresses.userId, user.id), eq(schema.addresses.countryCode, "GH"))).orderBy(desc(schema.addresses.isDefault)).limit(1);
  let requested: { id: string; name: string } | null = null;
  if (sp.gardener) {
    const [g] = await db
      .select({ id: schema.gardenerProfiles.id, name: schema.users.fullName })
      .from(schema.gardenerProfiles)
      .innerJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId))
      .where(and(eq(schema.gardenerProfiles.id, sp.gardener), eq(schema.gardenerProfiles.status, "approved")));
    requested = g ?? null;
  }
  const today = zonedInfo(new Date(), "Africa/Accra").date;
  return (
    <div className="container max-w-5xl py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Services", href: "/services" }, { label: svc.s.name, href: `/services/${svc.s.slug}` }, { label: "Book" }]} />
      <h1 className="h-page mt-4">{svc.s.pricingModel === "quote" || svc.s.pricingModel === "inspection" ? "Request a quote" : "Book"}: {svc.s.name}</h1>
      <p className="mt-2 text-ink-muted">It takes about two minutes. You'll review the price before paying.</p>
      <BookingForm
        service={{ id: svc.s.id, name: svc.s.name, pricingModel: svc.s.pricingModel, durationMinutes: svc.s.durationMinutes, depositPercent: svc.s.depositPercent }}
        cities={svc.areas.filter((a) => a.countryCode === "GH")}
        initialCity={sp.city ? Number(sp.city) : address?.cityId ?? undefined}
        defaults={{ line1: address?.line1 ?? "", line2: address?.line2 ?? "", digitalAddress: address?.digitalAddress ?? "", phone: address?.phone ?? user.phone ?? "" }}
        minDate={addDaysStr(today, Math.ceil(settings.booking.minLeadHours / 24) > 0 ? 1 : 0)}
        maxDate={addDaysStr(today, settings.booking.maxAdvanceDays)}
        requested={requested}
      />
    </div>
  );
}
