"use server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { UserError } from "@/server/errors";

export async function toggleWishlist(_: Prev, fd: FormData) {
  return run(fd, z.object({ productId: f.uuid() }), async ({ productId }) => {
    const u = await getCurrentUser();
    if (!u) throw new UserError("Sign in to save items to your wishlist.");
    const where = and(eq(schema.wishlistItems.userId, u.id), eq(schema.wishlistItems.productId, productId));
    if ((await db.select().from(schema.wishlistItems).where(where)).length) await db.delete(schema.wishlistItems).where(where);
    else await db.insert(schema.wishlistItems).values({ userId: u.id, productId });
  });
}

/** Comparison list lives in a cookie (max 4 products). */
export async function toggleCompare(_: Prev, fd: FormData) {
  return run(fd, z.object({ productId: f.uuid() }), async ({ productId }) => {
    const jar = await cookies();
    const list = (jar.get("hg_compare")?.value ?? "").split(",").filter(Boolean);
    const next = list.includes(productId) ? list.filter((x) => x !== productId) : [...list, productId].slice(-4);
    jar.set("hg_compare", next.join(","), { path: "/", maxAge: 7 * 86400, sameSite: "lax" });
    return { ok: true, message: list.includes(productId) ? "Removed from comparison." : "Added to comparison." };
  });
}
