"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { run, f, type Prev } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { UserError } from "@/server/errors";
import { registerForActivity } from "@/server/activities";

export async function registerActivity(_: Prev, fd: FormData) {
  return run(fd, z.object({ sessionId: f.uuid(), quantity: f.int(1, 30), names: f.text(1000).optional() }), async (i) => {
    const u = await getCurrentUser();
    if (!u) throw new UserError("Please sign in to register.");
    const reg = await registerForActivity({ userId: u.id, sessionId: i.sessionId, quantity: i.quantity, attendeeNames: (i.names ?? "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean) });
    redirect(`/account/activities?registered=${reg.id}`);
  });
}
