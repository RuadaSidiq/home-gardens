import { NextResponse } from "next/server";
import { markWebhookProcessed, recordWebhookEvent, verifyAndApply } from "@/server/payments/service";

/**
 * Hubtel callbacks are not signed, so the payload is only used as a trigger:
 * the transaction is always re-checked against Hubtel's status API.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { Data?: { ClientReference?: string; CheckoutId?: string; Status?: string } } | null;
  const ref = body?.Data?.ClientReference;
  if (!ref) return new NextResponse("Bad request", { status: 400 });
  const ev = await recordWebhookEvent("hubtel", `${ref}:${body?.Data?.Status ?? ""}`, body?.Data?.Status ?? "callback", body);
  if (!ev) return NextResponse.json({ ok: true, duplicate: true });
  try {
    await verifyAndApply(ref);
    await markWebhookProcessed(ev.id);
  } catch (e) {
    await markWebhookProcessed(ev.id, (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
