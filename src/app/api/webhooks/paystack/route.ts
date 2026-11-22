import { NextResponse } from "next/server";
import { verifyPaystackSignature } from "@/server/payments/paystack";
import { markWebhookProcessed, recordWebhookEvent, verifyAndApply } from "@/server/payments/service";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyPaystackSignature(raw, req.headers.get("x-paystack-signature"))) return new NextResponse("Invalid signature", { status: 401 });
  const body = JSON.parse(raw) as { event: string; data: { id: number; reference: string } };
  const ev = await recordWebhookEvent("paystack", `${body.event}:${body.data.id}`, body.event, body);
  if (!ev) return NextResponse.json({ ok: true, duplicate: true });
  try {
    // Even with a valid signature we re-verify with the API before applying.
    if (body.event === "charge.success") await verifyAndApply(body.data.reference);
    await markWebhookProcessed(ev.id);
  } catch (e) {
    await markWebhookProcessed(ev.id, (e as Error).message);
    return new NextResponse("Processing error", { status: 500 }); // provider retries
  }
  return NextResponse.json({ ok: true });
}
