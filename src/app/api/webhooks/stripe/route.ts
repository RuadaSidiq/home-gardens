import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyStripeSignature } from "@/server/payments/stripe";
import { markWebhookProcessed, recordWebhookEvent, verifyAndApply } from "@/server/payments/service";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"))) return new NextResponse("Invalid signature", { status: 401 });
  const body = JSON.parse(raw) as { id: string; type: string; data: { object: { id: string; client_reference_id?: string; metadata?: { reference?: string } } } };
  const ev = await recordWebhookEvent("stripe", body.id, body.type, body);
  if (!ev) return NextResponse.json({ received: true, duplicate: true });
  try {
    if (body.type === "checkout.session.completed" || body.type === "checkout.session.async_payment_succeeded") {
      const obj = body.data.object;
      const ref = obj.client_reference_id ?? obj.metadata?.reference;
      if (ref) {
        await db.update(schema.payments).set({ providerReference: obj.id }).where(eq(schema.payments.reference, ref));
        await verifyAndApply(ref, obj.id);
      }
    }
    await markWebhookProcessed(ev.id);
  } catch (e) {
    await markWebhookProcessed(ev.id, (e as Error).message);
    return new NextResponse("Processing error", { status: 500 });
  }
  return NextResponse.json({ received: true });
}
