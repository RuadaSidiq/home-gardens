import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "./auth/session";
import { CART_COOKIE } from "./site";
import { token } from "@/lib/ids";

export async function cartOwnerForWrite() {
  const u = await getCurrentUser();
  if (u) return { userId: u.id } as const;
  const jar = await cookies();
  let t = jar.get(CART_COOKIE)?.value;
  if (!t) {
    t = token(24);
    jar.set(CART_COOKIE, t, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 30 * 86400 });
  }
  return { guestToken: t } as const;
}
