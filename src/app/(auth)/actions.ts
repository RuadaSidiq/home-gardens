"use server";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { UserError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { hashPassword, verifyPassword, passwordProblem } from "@/server/auth/password";
import { createSession, destroySession, clientIp, hashToken, getPendingMfaSession, SESSION_COOKIE } from "@/server/auth/session";
import { verifyTotp } from "@/server/auth/totp";
import { notify } from "@/server/notify";
import { audit } from "@/server/audit";
import { token } from "@/lib/ids";
import { sendVerification } from "@/server/auth/verify-email";
import { mergeGuestCart } from "@/server/commerce/cart";
import { CART_COOKIE } from "@/server/site";

const APP = () => process.env.APP_URL ?? "http://localhost:3000";
const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : null);

async function landingFor(userId: string) {
  const rows = await db.execute<{ staff: boolean; gardener: boolean }>(sql`
    select exists(select 1 from user_roles ur join role_permissions rp on rp.role_id = ur.role_id join permissions p on p.id = rp.permission_id where ur.user_id = ${userId} and p.key = 'dashboard.view') as staff,
           exists(select 1 from gardener_profiles g where g.user_id = ${userId}) as gardener`);
  const r = rows[0]!;
  return r.staff ? "/admin" : r.gardener ? "/gardener/dashboard" : "/account";
}

async function afterLogin(userId: string) {
  const jar = await cookies();
  const guest = jar.get(CART_COOKIE)?.value;
  if (guest) {
    await mergeGuestCart(guest, userId);
    jar.delete(CART_COOKIE);
  }
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, userId));
}

export async function login(_: Prev, fd: FormData) {
  return run(fd, z.object({ email: f.email(), password: z.string().min(1, "Enter your password").max(200), next: f.text(300).optional() }), async (i) => {
    const ip = clientIp(await headers());
    if (!(await rateLimit(`login:ip:${ip}`, 20, 900)) || !(await rateLimit(`login:email:${i.email}`, 8, 900))) {
      throw new UserError("Too many sign-in attempts. Please wait 15 minutes and try again.");
    }
    const [u] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${i.email}`);
    // Always run a hash comparison so response time doesn't reveal whether the email exists.
    const ok = await verifyPassword(i.password, u?.passwordHash ?? "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.Jm8b0C5a8m4m8f4bA6d8k1Q2w3eW");
    if (!u || !ok) throw new UserError("Email or password is incorrect.");
    if (u.status !== "active") throw new UserError("This account is suspended. Contact support for help.");
    if (u.mfaEnabled && u.mfaSecret) {
      await createSession(u.id, { mfaPending: true });
      redirect(`/login/mfa${i.next ? `?next=${encodeURIComponent(i.next)}` : ""}`);
    }
    await createSession(u.id);
    await afterLogin(u.id);
    await audit({ actorId: u.id, action: "auth.login", entityType: "user", entityId: u.id, ip });
    redirect(safeNext(i.next) ?? (await landingFor(u.id)));
  });
}

export async function verifyMfa(_: Prev, fd: FormData) {
  return run(fd, z.object({ code: z.string().trim().min(6).max(8), next: f.text(300).optional() }), async (i) => {
    const s = await getPendingMfaSession();
    if (!s) redirect("/login");
    if (!(await rateLimit(`mfa:${s.userId}`, 6, 600))) throw new UserError("Too many attempts. Sign in again in 10 minutes.");
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, s.userId));
    if (!u?.mfaSecret || !verifyTotp(u.mfaSecret, i.code)) throw new UserError("That code is not valid. Check your authenticator app.", "code");
    await db.update(schema.sessions).set({ mfaPending: false }).where(eq(schema.sessions.id, s.id));
    await afterLogin(u.id);
    await audit({ actorId: u.id, action: "auth.login_mfa", entityType: "user", entityId: u.id });
    redirect(safeNext(i.next) ?? (await landingFor(u.id)));
  });
}

const registerSchema = z.object({
  fullName: f.req("Full name", 120),
  email: f.email(),
  phone: f.phone(),
  countryCode: z.string().length(2),
  password: z.string().max(200),
  terms: f.bool().refine((v) => v, "Please accept the terms to continue"),
  next: f.text(300).optional(),
});

export async function register(_: Prev, fd: FormData) {
  return run(fd, registerSchema, async (i) => {
    const ip = clientIp(await headers());
    if (!(await rateLimit(`register:${ip}`, 6, 3600))) throw new UserError("Too many sign-ups from this network. Please try again later.");
    const problem = passwordProblem(i.password);
    if (problem) throw new UserError(problem, "password");
    const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${i.email}`);
    if (exists) throw new UserError("An account with this email already exists. Sign in instead.", "email");
    const [country] = await db.select().from(schema.countries).where(eq(schema.countries.code, i.countryCode));
    const [u] = await db
      .insert(schema.users)
      .values({ email: i.email, fullName: i.fullName, phone: i.phone, countryCode: country?.code ?? null, preferredCurrency: country?.currency ?? "GHS", passwordHash: await hashPassword(i.password) })
      .returning();
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.key, "customer"));
    await db.insert(schema.userRoles).values({ userId: u!.id, roleId: role!.id });
    await db.insert(schema.customerProfiles).values({ userId: u!.id });
    await createSession(u!.id);
    await afterLogin(u!.id);
    await sendVerification(u!.id);
    await notify(u!.id, "welcome", {}, "/account");
    redirect(safeNext(i.next) ?? "/account?welcome=1");
  });
}

export async function forgotPassword(_: Prev, fd: FormData) {
  return run(fd, z.object({ email: f.email() }), async ({ email }) => {
    const ip = clientIp(await headers());
    if (!(await rateLimit(`forgot:${ip}`, 5, 3600)) || !(await rateLimit(`forgot:${email}`, 3, 3600))) throw new UserError("Too many requests. Please try again later.");
    const [u] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`);
    if (u && u.status === "active") {
      const raw = token(32);
      await db.insert(schema.authTokens).values({ userId: u.id, type: "reset_password", tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 3600_000) });
      await notify(u.id, "password_reset", { link: `${APP()}/reset-password?token=${raw}` });
    }
    // Same response either way so the form can't be used to discover accounts.
    return { ok: true, message: "If an account exists for that email, we've sent a link to reset your password. It expires in 1 hour." };
  });
}

export async function resetPassword(_: Prev, fd: FormData) {
  return run(fd, z.object({ token: z.string().min(20).max(200), password: z.string().max(200), confirm: z.string().max(200) }), async (i) => {
    const problem = passwordProblem(i.password);
    if (problem) throw new UserError(problem, "password");
    if (i.password !== i.confirm) throw new UserError("Passwords do not match.", "confirm");
    const [t] = await db
      .select()
      .from(schema.authTokens)
      .where(and(eq(schema.authTokens.tokenHash, hashToken(i.token)), eq(schema.authTokens.type, "reset_password"), isNull(schema.authTokens.usedAt), gt(schema.authTokens.expiresAt, new Date())));
    if (!t) throw new UserError("This reset link is invalid or has expired. Request a new one.");
    await db.transaction(async (tx) => {
      await tx.update(schema.users).set({ passwordHash: await hashPassword(i.password), updatedAt: new Date() }).where(eq(schema.users.id, t.userId));
      await tx.update(schema.authTokens).set({ usedAt: new Date() }).where(eq(schema.authTokens.id, t.id));
      await tx.delete(schema.sessions).where(eq(schema.sessions.userId, t.userId)); // sign out everywhere
    });
    await audit({ actorId: t.userId, action: "auth.password_reset", entityType: "user", entityId: t.userId });
    return { ok: true, message: "Your password has been changed. You can now sign in." };
  });
}

export async function logout() {
  await destroySession();
  redirect("/");
}

export async function resendVerification(_: Prev, fd: FormData) {
  return run(fd, z.object({}), async () => {
    const jar = await cookies();
    const raw = jar.get(SESSION_COOKIE)?.value;
    if (!raw) throw new UserError("Please sign in.");
    const [s] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, hashToken(raw)));
    if (!s) throw new UserError("Please sign in.");
    if (!(await rateLimit(`verify:${s.userId}`, 3, 3600))) throw new UserError("We've already sent several emails. Please check your inbox and spam folder.");
    await sendVerification(s.userId);
    return { ok: true, message: "Verification email sent." };
  });
}
