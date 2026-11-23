"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { getCurrentUser, assertPermission } from "@/server/auth/session";
import { UserError } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { hashPassword } from "@/server/auth/password";
import { slugify, token } from "@/lib/ids";
import { toMinor } from "@/lib/money";

async function reviewer() {
  const u = await getCurrentUser();
  assertPermission(u, "gardeners.review");
  return u;
}

export async function decideGardener(_: Prev, fd: FormData) {
  return run(fd, z.object({ gardenerId: f.uuid(), decision: z.enum(["approved", "rejected", "info_requested", "suspended"]), note: f.text(1000).optional() }), async (i) => {
    const u = await reviewer();
    const [g] = await db.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, i.gardenerId));
    if (!g) throw new UserError("Gardener not found.");
    if (i.decision !== "approved" && !i.note) throw new UserError("Add a note explaining the decision – it is shared with the gardener.", "note");
    if (i.decision === "approved") {
      const docs = await db.select().from(schema.gardenerDocuments).where(eq(schema.gardenerDocuments.gardenerId, g.id));
      if (g.type === "independent" && !docs.some((d) => d.status === "verified")) throw new UserError("Verify at least one identity document before approving.");
    }
    await db.update(schema.gardenerProfiles).set({
      status: i.decision, reviewNote: i.note || null, reviewedBy: u.id, reviewedAt: new Date(),
      ...(i.decision === "approved" ? { verifiedAt: g.verifiedAt ?? new Date() } : {}), updatedAt: new Date(),
    }).where(eq(schema.gardenerProfiles.id, g.id));
    // Suspending withdraws future offers so the gardener doesn't hold slots.
    if (i.decision === "suspended") {
      await db.execute(sql`update bookings set status = 'pending_assignment', gardener_id = null, updated_at = now() where gardener_id = ${g.id} and status = 'assigned'`);
    }
    await audit({ actorId: u.id, action: `gardener.${i.decision}`, entityType: "gardener", entityId: g.id, meta: { note: i.note } });
    const tpl = { approved: "gardener_application_approved", rejected: "gardener_application_rejected", info_requested: "gardener_info_requested", suspended: "gardener_application_rejected" }[i.decision];
    await notify(g.userId, tpl, { note: i.note ?? "" }, "/gardener/dashboard");
    return { ok: true, message: `Gardener ${i.decision.replace("_", " ")}.` };
  });
}

export async function reactivateGardener(_: Prev, fd: FormData) {
  return run(fd, z.object({ gardenerId: f.uuid() }), async (i) => {
    const u = await reviewer();
    await db.update(schema.gardenerProfiles).set({ status: "approved", reviewNote: null, reviewedBy: u.id, reviewedAt: new Date() }).where(eq(schema.gardenerProfiles.id, i.gardenerId));
    await audit({ actorId: u.id, action: "gardener.reactivated", entityType: "gardener", entityId: i.gardenerId });
    return { ok: true, message: "Gardener reactivated." };
  });
}

export async function reviewDocument(_: Prev, fd: FormData) {
  return run(fd, z.object({ documentId: f.uuid(), status: z.enum(["verified", "rejected"]), note: f.text(500).optional() }), async (i) => {
    const u = await reviewer();
    const [d] = await db.update(schema.gardenerDocuments).set({ status: i.status, note: i.note || null, reviewedBy: u.id, reviewedAt: new Date() }).where(eq(schema.gardenerDocuments.id, i.documentId)).returning();
    if (!d) throw new UserError("Document not found.");
    await audit({ actorId: u.id, action: `document.${i.status}`, entityType: "gardener", entityId: d.gardenerId, meta: { documentId: d.id } });
  });
}

export async function updateCompanyGardener(_: Prev, fd: FormData) {
  return run(fd, z.object({ gardenerId: f.uuid(), employeeId: f.text(30).optional(), compensationNote: f.text(1000).optional(), isPublic: f.bool(), maxJobsPerDay: f.int(1, 10) }), async (i) => {
    const u = await getCurrentUser();
    assertPermission(u, "staff.manage");
    await db.update(schema.gardenerProfiles).set({ employeeId: i.employeeId || null, compensationNote: i.compensationNote || null, isPublic: i.isPublic, maxJobsPerDay: i.maxJobsPerDay }).where(eq(schema.gardenerProfiles.id, i.gardenerId));
    await audit({ actorId: u.id, action: "gardener.company_update", entityType: "gardener", entityId: i.gardenerId });
    return { ok: true, message: "Saved." };
  });
}

export async function createCompanyGardener(_: Prev, fd: FormData) {
  return run(
    fd,
    z.object({ fullName: f.req("Name", 120), email: f.email(), phone: f.phone(), employeeId: f.req("Employee ID", 30), headline: f.req("Role / headline", 120), baseCityId: f.int(1), yearsExperience: f.int(0, 60), services: z.array(z.string().uuid()).min(1, "Choose at least one service"), isPublic: f.bool() }),
    async (i) => {
      const u = await getCurrentUser();
      assertPermission(u, "staff.manage");
      const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${i.email}`);
      if (exists) throw new UserError("A user with this email already exists.", "email");
      const [city] = await db.select().from(schema.cities).where(eq(schema.cities.id, i.baseCityId));
      const [country] = await db.select().from(schema.countries).where(eq(schema.countries.code, city!.countryCode));
      const g = await db.transaction(async (tx) => {
        // random initial password; the gardener sets their own through "Forgot password"
        const [nu] = await tx.insert(schema.users).values({ email: i.email, fullName: i.fullName, phone: i.phone, countryCode: country!.code, passwordHash: await hashPassword(token(24)), emailVerifiedAt: new Date() }).returning();
        const [role] = await tx.select().from(schema.roles).where(eq(schema.roles.key, "gardener"));
        await tx.insert(schema.userRoles).values({ userId: nu!.id, roleId: role!.id, grantedBy: u.id });
        const [g] = await tx.insert(schema.gardenerProfiles).values({ userId: nu!.id, type: "company", slug: `${slugify(i.fullName)}-${i.employeeId.toLowerCase().replace(/[^a-z0-9]/g, "")}`, status: "approved", headline: i.headline, bio: "", yearsExperience: i.yearsExperience, countryCode: country!.code, baseCityId: city!.id, currency: country!.currency, employeeId: i.employeeId, isPublic: i.isPublic, verifiedAt: new Date(), reviewedBy: u.id, reviewedAt: new Date() }).returning();
        await tx.insert(schema.gardenerServices).values(i.services.map((serviceId) => ({ gardenerId: g!.id, serviceId })));
        await tx.insert(schema.gardenerAvailability).values([1, 2, 3, 4, 5].map((weekday) => ({ gardenerId: g!.id, weekday, startTime: "07:00", endTime: "17:00" })));
        return g!;
      });
      await audit({ actorId: u.id, action: "gardener.company_create", entityType: "gardener", entityId: g.id });
      redirect(`/admin/gardeners/${g.id}?created=1`);
    },
  );
}

export async function adminSetGardenerRate(_: Prev, fd: FormData) {
  return run(fd, z.object({ gardenerId: f.uuid(), hourlyRate: f.amount() }), async (i) => {
    const u = await reviewer();
    const [g] = await db.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, i.gardenerId));
    await db.update(schema.gardenerProfiles).set({ hourlyRate: toMinor(i.hourlyRate, g!.currency) }).where(eq(schema.gardenerProfiles.id, i.gardenerId));
    await audit({ actorId: u.id, action: "gardener.rate", entityType: "gardener", entityId: i.gardenerId });
  });
}
