import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashToken } from "./session";
import { notify } from "../notify";
import { token } from "@/lib/ids";

export async function consumeEmailToken(raw: string) {
  const [t] = await db
    .select()
    .from(schema.authTokens)
    .where(and(eq(schema.authTokens.tokenHash, hashToken(raw)), eq(schema.authTokens.type, "verify_email"), isNull(schema.authTokens.usedAt), gt(schema.authTokens.expiresAt, new Date())));
  if (!t) return false;
  await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, t.userId));
  await db.update(schema.authTokens).set({ usedAt: new Date() }).where(eq(schema.authTokens.id, t.id));
  return true;
}

/** Not a server action: only callable from server code. */
export async function sendVerification(userId: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u || u.emailVerifiedAt) return;
  const raw = token(32);
  await db.insert(schema.authTokens).values({ userId, type: "verify_email", tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 86400_000) });
  await notify(userId, "verify_email", { link: `${process.env.APP_URL ?? "http://localhost:3000"}/verify-email?token=${raw}` });
}
