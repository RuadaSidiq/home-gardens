"use server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { UserError } from "@/server/errors";

export async function toggleSavedGardener(_: Prev, fd: FormData) {
  return run(fd, z.object({ gardenerId: f.uuid() }), async ({ gardenerId }) => {
    const u = await getCurrentUser();
    if (!u) throw new UserError("Sign in to save gardeners.");
    const where = and(eq(schema.savedGardeners.userId, u.id), eq(schema.savedGardeners.gardenerId, gardenerId));
    const existing = await db.select().from(schema.savedGardeners).where(where);
    if (existing.length) await db.delete(schema.savedGardeners).where(where);
    else await db.insert(schema.savedGardeners).values({ userId: u.id, gardenerId });
  });
}
