"use server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { requireGardener } from "@/server/auth/session";
import { UserError } from "@/server/errors";
import { completeJob, issueQuote, respondToOffer, startJob } from "@/server/bookings/engine";
import { storeImages } from "@/server/storage";
import { requestPayout, releaseMaturedCommissions } from "@/server/finance";
import { getSettings } from "@/server/settings";
import { encrypt, mask } from "@/server/crypto";
import { toMinor } from "@/lib/money";
import { notifyStaff } from "@/server/notify";

async function gardener() {
  const u = await requireGardener();
  const [g] = await db.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, u.gardenerId));
  if (!g) throw new UserError("Gardener profile not found.");
  return { u, g };
}
async function approvedGardener() {
  const r = await gardener();
  if (r.g.status !== "approved") throw new UserError("Your profile must be approved before you can take jobs.");
  return r;
}

export async function respondJob(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), accept: z.enum(["1", "0"]), reason: f.text(300).optional() }), async (i) => {
    const { u, g } = await approvedGardener();
    if (g.type !== "independent") throw new UserError("Company jobs are assigned by the operations team.");
    await respondToOffer({ bookingId: i.bookingId, gardenerId: g.id, userId: u.id, accept: i.accept === "1", reason: i.reason });
    return { ok: true, message: i.accept === "1" ? "Job accepted. It's now in your schedule." : "Job declined." };
  });
}

export async function proposeQuote(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), amount: f.amount().refine((n) => n > 0, "Enter an amount"), hours: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().min(0.5).max(80).optional()), note: f.req("Explanation", 1000) }), async (i) => {
    const { u, g } = await approvedGardener();
    if (g.type !== "independent") throw new UserError("Only independent gardeners can propose prices.");
    const [b] = await db.select({ currency: schema.bookings.currency }).from(schema.bookings).where(eq(schema.bookings.id, i.bookingId));
    if (!b) throw new UserError("Job not found.");
    await issueQuote({ bookingId: i.bookingId, actorId: u.id, gardenerId: g.id, amount: toMinor(i.amount, b.currency), estimatedHours: i.hours ?? null, note: i.note });
    return { ok: true, message: "Price sent to the customer for approval." };
  });
}

export async function startMyJob(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid() }), async (i) => {
    const { u, g } = await approvedGardener();
    const photos = await storeImages(fd.getAll("photos") as File[], "job-photos", u.id, 6);
    await startJob(i.bookingId, g.id, u.id, photos);
    return { ok: true, message: "Job started." };
  });
}

export async function completeMyJob(_: Prev, fd: FormData) {
  return run(fd, z.object({ bookingId: f.uuid(), note: f.text(1000).optional() }), async (i) => {
    const { u, g } = await approvedGardener();
    const photos = await storeImages(fd.getAll("photos") as File[], "job-photos", u.id, 8);
    await completeJob(i.bookingId, g.id, u.id, photos, i.note || undefined);
    return { ok: true, message: "Marked complete. The customer has been asked to confirm." };
  });
}

/* ---------------- Availability ---------------- */
export async function saveAvailability(_: Prev, fd: FormData) {
  return run(fd, z.object({ maxJobsPerDay: f.int(1, 10) }), async (i) => {
    const { g } = await gardener();
    const rows: { weekday: number; startTime: string; endTime: string }[] = [];
    for (let d = 0; d < 7; d++) {
      if (fd.get(`on_${d}`) !== "on") continue;
      const s = String(fd.get(`start_${d}`) ?? ""), e = String(fd.get(`end_${d}`) ?? "");
      if (!/^\d{2}:\d{2}$/.test(s) || !/^\d{2}:\d{2}$/.test(e) || e <= s) throw new UserError("Each working day needs a start time before its end time.");
      rows.push({ weekday: d, startTime: s, endTime: e });
    }
    await db.transaction(async (tx) => {
      await tx.delete(schema.gardenerAvailability).where(eq(schema.gardenerAvailability.gardenerId, g.id));
      if (rows.length) await tx.insert(schema.gardenerAvailability).values(rows.map((r) => ({ ...r, gardenerId: g.id })));
      await tx.update(schema.gardenerProfiles).set({ maxJobsPerDay: i.maxJobsPerDay }).where(eq(schema.gardenerProfiles.id, g.id));
    });
    return { ok: true, message: "Availability saved. Existing bookings are not affected." };
  });
}

export async function addTimeOff(_: Prev, fd: FormData) {
  return run(fd, z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: f.text(200).optional() }), async (i) => {
    const { g } = await gardener();
    if (i.to < i.from) throw new UserError("The end date must be after the start date.", "to");
    await db.insert(schema.gardenerTimeOff).values({ gardenerId: g.id, startsAt: new Date(`${i.from}T00:00:00Z`), endsAt: new Date(`${i.to}T23:59:59Z`), reason: i.reason || null });
    return { ok: true, message: "Time off added. You won't receive new jobs on these dates." };
  });
}
export async function removeTimeOff(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.uuid() }), async (i) => {
    const { g } = await gardener();
    await db.delete(schema.gardenerTimeOff).where(and(eq(schema.gardenerTimeOff.id, i.id), eq(schema.gardenerTimeOff.gardenerId, g.id)));
  });
}

/* ---------------- Services & areas ---------------- */
export async function saveServices(_: Prev, fd: FormData) {
  return run(fd, z.object({ services: z.array(z.string().uuid()).optional(), areas: z.array(z.coerce.number().int()).optional() }), async (i) => {
    const { g } = await gardener();
    const chosen = i.services ?? [];
    if (!chosen.length) throw new UserError("Offer at least one service.");
    await db.transaction(async (tx) => {
      await tx.delete(schema.gardenerServices).where(eq(schema.gardenerServices.gardenerId, g.id));
      await tx.insert(schema.gardenerServices).values(chosen.map((serviceId) => {
        const raw = String(fd.get(`price_${serviceId}`) ?? "").trim();
        return { gardenerId: g.id, serviceId, customPrice: g.type === "independent" && raw ? toMinor(raw, g.currency) : null };
      }));
      await tx.delete(schema.gardenerServiceAreas).where(eq(schema.gardenerServiceAreas.gardenerId, g.id));
      const areas = [...new Set((i.areas ?? []).filter((a) => a !== g.baseCityId))];
      if (areas.length) await tx.insert(schema.gardenerServiceAreas).values(areas.map((cityId) => ({ gardenerId: g.id, cityId })));
    });
    return { ok: true, message: "Services and areas updated." };
  });
}

/* ---------------- Profile & portfolio ---------------- */
export async function saveGardenerProfile(_: Prev, fd: FormData) {
  return run(fd, z.object({ headline: f.req("Headline", 120), bio: f.req("Bio", 2000), yearsExperience: f.int(0, 60), qualifications: f.text(500).optional(), hourlyRate: f.optAmount(), isPublic: f.bool() }), async (i) => {
    const { g } = await gardener();
    await db.update(schema.gardenerProfiles).set({
      headline: i.headline, bio: i.bio, yearsExperience: i.yearsExperience, qualifications: i.qualifications || null, isPublic: i.isPublic,
      ...(g.type === "independent" && i.hourlyRate ? { hourlyRate: toMinor(i.hourlyRate, g.currency) } : {}), updatedAt: new Date(),
    }).where(eq(schema.gardenerProfiles.id, g.id));
    return { ok: true, message: "Profile saved." };
  });
}

export async function uploadPortfolio(_: Prev, fd: FormData) {
  return run(fd, z.object({ caption: f.text(120).optional() }), async (i) => {
    const { u, g } = await gardener();
    const urls = await storeImages(fd.getAll("photos") as File[], "portfolio", u.id, 6);
    if (!urls.length) throw new UserError("Choose at least one photo.");
    await db.insert(schema.gardenerPortfolio).values(urls.map((imageUrl, idx) => ({ gardenerId: g.id, imageUrl, caption: i.caption || null, sort: 100 + idx })));
    return { ok: true, message: "Photos added." };
  });
}
export async function deletePortfolio(_: Prev, fd: FormData) {
  return run(fd, z.object({ id: f.uuid() }), async (i) => {
    const { g } = await gardener();
    await db.delete(schema.gardenerPortfolio).where(and(eq(schema.gardenerPortfolio.id, i.id), eq(schema.gardenerPortfolio.gardenerId, g.id)));
  });
}

export async function resubmitApplication(_: Prev, fd: FormData) {
  return run(fd, z.object({ note: f.req("Response", 1000) }), async (i) => {
    const { u, g } = await gardener();
    if (g.status !== "info_requested") throw new UserError("Your application is not waiting for information.");
    const docs = (fd.getAll("documents") as File[]).filter((x) => x.size > 0);
    const { storeUpload } = await import("@/server/storage");
    for (const d of docs.slice(0, 3)) {
      const file = await storeUpload(d, { kind: "document", visibility: "private", purpose: "gardener-cert", ownerId: u.id });
      await db.insert(schema.gardenerDocuments).values({ gardenerId: g.id, type: "other", fileId: file.id, note: i.note });
    }
    await db.update(schema.gardenerProfiles).set({ status: "pending", reviewNote: `Gardener response: ${i.note}`, submittedAt: new Date() }).where(eq(schema.gardenerProfiles.id, g.id));
    await notifyStaff("gardeners.review", "Gardener application updated", `${u.fullName} responded to an information request.`, `/admin/gardeners/${g.id}`);
    return { ok: true, message: "Thanks – your application is back with our team." };
  });
}

/* ---------------- Money ---------------- */
export async function savePayoutMethod(_: Prev, fd: FormData) {
  return run(fd, z.object({ method: z.enum(["momo", "bank"]), provider: f.req("Network or bank", 60), accountName: f.req("Account name", 120), accountNumber: f.req("Account number", 40) }), async (i) => {
    const { g } = await gardener();
    if (g.type !== "independent") throw new UserError("Company gardeners are paid through payroll.");
    const open = await db.select({ id: schema.payouts.id }).from(schema.payouts).where(and(eq(schema.payouts.gardenerId, g.id), inArray(schema.payouts.status, ["requested", "approved", "processing"])));
    if (open.length) throw new UserError("You can change payout details once your open payout request is processed.");
    await db.update(schema.gardenerProfiles).set({ payoutMethod: encrypt(JSON.stringify(i)), payoutMethodSummary: `${i.provider} ${mask(i.accountNumber)}` }).where(eq(schema.gardenerProfiles.id, g.id));
    return { ok: true, message: "Payout details updated." };
  });
}

export async function requestMyPayout(_: Prev, fd: FormData) {
  return run(fd, z.object({ amount: f.amount().refine((n) => n > 0, "Enter an amount"), currency: z.string().length(3) }), async (i) => {
    const { g } = await approvedGardener();
    const s = await getSettings();
    await releaseMaturedCommissions(g.id);
    await requestPayout(g.id, toMinor(i.amount, i.currency), i.currency, s.finance.minimumPayout);
    await notifyStaff("payouts.manage", "Payout requested", `${i.amount} ${i.currency}`, "/admin/payouts");
    return { ok: true, message: "Payout requested. Our finance team processes requests within 2 working days." };
  });
}
