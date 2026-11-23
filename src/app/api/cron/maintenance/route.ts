import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runMaintenance } from "@/server/maintenance";

/** Call with `Authorization: Bearer $CRON_SECRET` (Vercel Cron, a Hostinger cron job, or any scheduler). */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json({ ok: true, ran: await runMaintenance() });
}
export const GET = handle;
export const POST = handle;
