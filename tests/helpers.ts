import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDaysStr, zonedInfo } from "@/lib/time";

export async function userByEmail(email: string) {
  const [u] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`);
  return u!;
}
export async function gardenerByEmail(email: string) {
  const u = await userByEmail(email);
  const [g] = await db.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.userId, u.id));
  return { user: u, gardener: g! };
}
export async function serviceBySlug(slug: string) {
  const [s] = await db.select().from(schema.services).where(eq(schema.services.slug, slug));
  return s!;
}
export async function cityByName(name: string) {
  const [c] = await db.select().from(schema.cities).where(eq(schema.cities.name, name));
  return c!;
}
/** A weekday (Mon-Fri) date string `daysAhead` or later, in Accra time. */
export function nextWeekday(daysAhead: number) {
  let d = addDaysStr(zonedInfo(new Date(), "Africa/Accra").date, daysAhead);
  while ([0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) d = addDaysStr(d, 1);
  return d;
}
let counter = 0;
export async function newCustomer() {
  counter++;
  const [u] = await db
    .insert(schema.users)
    .values({ email: `cust${counter}-${Date.now()}@test.local`, fullName: `Test Customer ${counter}`, passwordHash: "x", countryCode: "GH", emailVerifiedAt: new Date() })
    .returning();
  return u!;
}
