import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { availableSlots, countryTimeZone } from "@/server/bookings/availability";
import { getSettings } from "@/server/settings";
import { rateLimit } from "@/server/rate-limit";
import { clientIp } from "@/server/auth/session";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const serviceId = u.searchParams.get("service");
  const cityId = Number(u.searchParams.get("city"));
  const date = u.searchParams.get("date") ?? "";
  const gardenerId = u.searchParams.get("gardener") || undefined;
  const hours = Number(u.searchParams.get("hours") || 0);
  if (!serviceId || !cityId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  if (!(await rateLimit(`slots:${clientIp(await headers())}`, 120, 60))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const [svc] = await db.select().from(schema.services).where(eq(schema.services.id, serviceId));
  const [city] = await db.select().from(schema.cities).where(eq(schema.cities.id, cityId));
  if (!svc || !city) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const settings = await getSettings();
  const duration = svc.pricingModel === "hourly" && hours > 0 ? Math.round(hours * 60) : svc.durationMinutes;
  const slots = await availableSlots({
    serviceId, cityId, date, durationMinutes: duration, timeZone: await countryTimeZone(city.countryCode), gardenerId,
    slotMinutes: settings.booking.slotMinutes, minLeadHours: settings.booking.minLeadHours,
  });
  // Quote-based jobs can be scheduled for a visit even if no gardener is free; staff will arrange it.
  const flexible = svc.pricingModel === "quote" || svc.pricingModel === "inspection";
  return NextResponse.json({ slots, flexible });
}
