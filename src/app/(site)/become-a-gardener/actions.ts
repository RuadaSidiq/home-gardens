"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { UserError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { clientIp, createSession, getCurrentUser } from "@/server/auth/session";
import { hashPassword, passwordProblem } from "@/server/auth/password";
import { storeImages, storeUpload } from "@/server/storage";
import { encrypt, mask } from "@/server/crypto";
import { slugify } from "@/lib/ids";
import { toMinor } from "@/lib/money";
import { notify, notifyStaff } from "@/server/notify";

const appSchema = z.object({
  fullName: f.req("Full name", 120),
  email: f.email(),
  phone: f.phone(),
  password: z.string().max(200).optional(),
  countryCode: z.string().length(2),
  baseCityId: f.int(1),
  areas: z.array(z.coerce.number().int()).optional(),
  headline: f.req("Headline", 120),
  bio: f.req("About you", 2000).refine((s) => s.length >= 60, "Write at least a few sentences (60+ characters)"),
  yearsExperience: f.int(0, 60),
  qualifications: f.text(500).optional(),
  services: z.array(z.string().uuid()).min(1, "Choose at least one service"),
  hourlyRate: f.amount().refine((n) => n > 0, "Enter your hourly rate"),
  days: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Choose at least one working day"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  docType: z.enum(["national_id", "passport", "drivers_license"]),
  payoutMethod: z.enum(["momo", "bank"]),
  payoutProvider: f.req("Network or bank", 60),
  payoutAccountName: f.req("Account name", 120),
  payoutAccountNumber: f.req("Account / MoMo number", 40),
  agree: f.bool().refine((v) => v, "Please accept the gardener terms"),
});

export async function applyAsGardener(_: Prev, fd: FormData) {
  return run(fd, appSchema, async (i) => {
    const ip = clientIp(await headers());
    if (!(await rateLimit(`gardener-apply:${ip}`, 5, 3600))) throw new UserError("Too many applications from this network. Please try later.");
    if (i.endTime <= i.startTime) throw new UserError("End time must be after start time.", "endTime");
    const idDoc = fd.get("idDocument") as File | null;
    if (!idDoc || idDoc.size === 0) throw new UserError("Upload an identity document.", "idDocument");

    let user = await getCurrentUser();
    let userId: string;
    if (user) {
      if (user.gardenerId) throw new UserError("You already have a gardener profile.");
      userId = user.id;
    } else {
      const problem = passwordProblem(i.password ?? "");
      if (problem) throw new UserError(problem, "password");
      const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${i.email}`);
      if (exists) throw new UserError("An account with this email exists. Sign in first, then apply.", "email");
      const [u] = await db.insert(schema.users).values({ email: i.email, fullName: i.fullName, phone: i.phone, countryCode: i.countryCode, preferredCurrency: "GHS", passwordHash: await hashPassword(i.password!) }).returning();
      userId = u!.id;
    }
    const [country] = await db.select().from(schema.countries).where(eq(schema.countries.code, i.countryCode));
    if (!country) throw new UserError("Choose a country.");

    // Uploads first (validated by content), then a single transaction for the records.
    const doc = await storeUpload(idDoc, { kind: "document", visibility: "private", purpose: "gardener-id", ownerId: userId });
    const certs: Awaited<ReturnType<typeof storeUpload>>[] = [];
    for (const c of (fd.getAll("certificates") as File[]).filter((x) => x.size > 0).slice(0, 3)) certs.push(await storeUpload(c, { kind: "document", visibility: "private", purpose: "gardener-cert", ownerId: userId }));
    const portfolio = await storeImages(fd.getAll("portfolio") as File[], "portfolio", userId, 8);
    const avatar = await storeImages([fd.get("photo") as File].filter(Boolean), "avatars", userId, 1);

    await db.transaction(async (tx) => {
      if (avatar[0]) await tx.update(schema.users).set({ avatarUrl: avatar[0] }).where(eq(schema.users.id, userId));
      const [role] = await tx.select().from(schema.roles).where(eq(schema.roles.key, "gardener"));
      await tx.insert(schema.userRoles).values({ userId, roleId: role!.id }).onConflictDoNothing();
      let slug = slugify(i.fullName);
      const [taken] = await tx.select({ id: schema.gardenerProfiles.id }).from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.slug, slug));
      if (taken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      const payout = { method: i.payoutMethod, provider: i.payoutProvider, accountName: i.payoutAccountName, accountNumber: i.payoutAccountNumber };
      const [g] = await tx
        .insert(schema.gardenerProfiles)
        .values({
          userId, type: "independent", slug, status: "pending", headline: i.headline, bio: i.bio, yearsExperience: i.yearsExperience,
          qualifications: i.qualifications || null, countryCode: country.code, baseCityId: i.baseCityId, hourlyRate: toMinor(i.hourlyRate, country.currency),
          currency: country.currency, submittedAt: new Date(),
          payoutMethod: encrypt(JSON.stringify(payout)),
          payoutMethodSummary: `${i.payoutProvider} ${mask(i.payoutAccountNumber)}`,
        })
        .returning();
      await tx.insert(schema.gardenerServices).values(i.services.map((serviceId) => ({ gardenerId: g!.id, serviceId })));
      const areas = [...new Set((i.areas ?? []).filter((a) => a !== i.baseCityId))];
      if (areas.length) await tx.insert(schema.gardenerServiceAreas).values(areas.map((cityId) => ({ gardenerId: g!.id, cityId })));
      await tx.insert(schema.gardenerAvailability).values(i.days.map((weekday) => ({ gardenerId: g!.id, weekday, startTime: i.startTime, endTime: i.endTime })));
      await tx.insert(schema.gardenerDocuments).values([{ gardenerId: g!.id, type: i.docType, fileId: doc.id }, ...certs.map((c) => ({ gardenerId: g!.id, type: "certificate" as const, fileId: c.id }))]);
      if (portfolio.length) await tx.insert(schema.gardenerPortfolio).values(portfolio.map((imageUrl, idx) => ({ gardenerId: g!.id, imageUrl, sort: idx })));
    });
    if (!user) await createSession(userId);
    await notify(userId, "gardener_application_received", {}, "/gardener/dashboard");
    await notifyStaff("gardeners.review", "New gardener application", `${i.fullName} applied to join as an independent gardener.`, "/admin/gardeners?status=pending");
    redirect("/gardener/dashboard?applied=1");
  });
}
