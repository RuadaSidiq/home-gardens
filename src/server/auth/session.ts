import "server-only";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { token } from "@/lib/ids";
import type { Permission } from "./permissions";

export const SESSION_COOKIE = "hg_session";
const SESSION_DAYS = 30;

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  countryCode: string | null;
  preferredCurrency: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  roles: string[];
  permissions: Set<Permission>;
  gardenerId: string | null;
  gardenerType: "company" | "independent" | null;
  gardenerStatus: string | null;
  isStaff: boolean;
};

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createSession(userId: string, opts: { mfaPending?: boolean } = {}) {
  const raw = token(32);
  const h = await headers();
  await db.insert(schema.sessions).values({
    id: hashToken(raw),
    userId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
    mfaPending: opts.mfaPending ?? false,
    ip: clientIp(h),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  (await cookies()).set(SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(raw)));
  jar.delete(SESSION_COOKIE);
}

export function clientIp(h: Headers) {
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

async function loadSession() {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [s] = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, hashToken(raw)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  if (!s) return null;
  if (Date.now() - s.lastSeenAt.getTime() > 3600_000) {
    await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, s.id));
  }
  return s;
}

export async function loadUser(userId: string): Promise<CurrentUser | null> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!u || u.status !== "active") return null;
  const roleRows = await db
    .select({ key: schema.roles.key })
    .from(schema.userRoles)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
    .where(eq(schema.userRoles.userId, userId));
  const permRows = await db.execute<{ key: Permission }>(sql`
    select distinct p.key from user_roles ur
    join role_permissions rp on rp.role_id = ur.role_id
    join permissions p on p.id = rp.permission_id
    where ur.user_id = ${userId}`);
  const [g] = await db
    .select({ id: schema.gardenerProfiles.id, type: schema.gardenerProfiles.type, status: schema.gardenerProfiles.status })
    .from(schema.gardenerProfiles)
    .where(eq(schema.gardenerProfiles.userId, userId))
    .limit(1);
  const roles = roleRows.map((r) => r.key);
  const permissions = new Set(permRows.map((r) => r.key));
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    countryCode: u.countryCode,
    preferredCurrency: u.preferredCurrency,
    emailVerified: !!u.emailVerifiedAt,
    mfaEnabled: u.mfaEnabled,
    roles,
    permissions,
    gardenerId: g?.id ?? null,
    gardenerType: g?.type ?? null,
    gardenerStatus: g?.status ?? null,
    isStaff: permissions.has("dashboard.view"),
  };
}

/** Current user for this request (memoised per request). MFA-pending sessions count as signed out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await loadSession();
  if (!s || s.mfaPending) return null;
  return loadUser(s.userId);
});

export const getPendingMfaSession = cache(async () => {
  const s = await loadSession();
  return s?.mfaPending ? s : null;
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return u;
}

export async function requirePermission(p: Permission | Permission[]): Promise<CurrentUser> {
  const u = await requireUser("/admin");
  const list = Array.isArray(p) ? p : [p];
  if (!list.some((x) => u.permissions.has(x))) redirect("/admin/forbidden");
  return u;
}

export async function requireGardener(): Promise<CurrentUser & { gardenerId: string }> {
  const u = await requireUser("/gardener/dashboard");
  if (!u.gardenerId) redirect("/become-a-gardener");
  return u as CurrentUser & { gardenerId: string };
}

export function can(u: CurrentUser | null, p: Permission) {
  return !!u?.permissions.has(p);
}

/** For server actions: throws instead of redirecting so the caller can render an error. */
export class AuthError extends Error {}
export function assertPermission(u: CurrentUser | null, p: Permission): asserts u is CurrentUser {
  if (!u) throw new AuthError("Please sign in.");
  if (!u.permissions.has(p)) throw new AuthError("You do not have permission to do that.");
}
