import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { eligibleGardeners, countryTimeZone } from "@/server/bookings/availability";
import { zonedToUtc } from "@/lib/time";

/** Gardeners free for a specific slot – public profile fields only. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const serviceId = u.searchParams.get("service");
  const cityId = Number(u.searchParams.get("city"));
  const date = u.searchParams.get("date") ?? "";
  const time = u.searchParams.get("time") ?? "";
  const hours = Number(u.searchParams.get("hours") || 0);
  if (!serviceId || !cityId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return NextResponse.json({ gardeners: [] });
  const [svc] = await db.select().from(schema.services).where(eq(schema.services.id, serviceId));
  const [city] = await db.select().from(schema.cities).where(eq(schema.cities.id, cityId));
  if (!svc || !city) return NextResponse.json({ gardeners: [] });
  const tz = await countryTimeZone(city.countryCode);
  const start = zonedToUtc(date, time, tz);
  const duration = svc.pricingModel === "hourly" && hours > 0 ? hours * 60 : svc.durationMinutes;
  const list = await eligibleGardeners({ serviceId, cityId, start, end: new Date(start.getTime() + duration * 60_000), timeZone: tz });
  const profiles = list.length
    ? await db
        .select({ id: schema.gardenerProfiles.id, slug: schema.gardenerProfiles.slug, headline: schema.gardenerProfiles.headline, isPublic: schema.gardenerProfiles.isPublic, avatar: schema.users.avatarUrl })
        .from(schema.gardenerProfiles)
        .innerJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId))
    : [];
  return NextResponse.json({
    gardeners: list
      .map((c) => ({ c, p: profiles.find((p) => p.id === c.gardenerId) }))
      .filter((x) => x.p?.isPublic)
      .map(({ c, p }) => ({ id: c.gardenerId, name: c.name, type: c.type, rating: c.rating, ratingCount: c.ratingCount, years: c.years, verified: c.verified, headline: p!.headline, avatar: p!.avatar, slug: p!.slug })),
  });
}
