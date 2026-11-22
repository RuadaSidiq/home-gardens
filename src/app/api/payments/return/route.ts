import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifyAndApply } from "@/server/payments/service";
import { reportError } from "@/server/errors";

/**
 * Customers land here after the provider checkout. The redirect itself proves nothing:
 * we verify the transaction server-side with the provider before showing success.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const ref = u.searchParams.get("reference") ?? u.searchParams.get("trxref") ?? "";
  const providerHint = u.searchParams.get("session_id") ?? u.searchParams.get("token") ?? null; // Stripe / PayPal
  const base = process.env.APP_URL ?? u.origin;
  const [p] = ref ? await db.select().from(schema.payments).where(eq(schema.payments.reference, ref)) : [];
  if (!p) return NextResponse.redirect(`${base}/account`);
  if (providerHint && !p.providerReference) await db.update(schema.payments).set({ providerReference: providerHint }).where(eq(schema.payments.id, p.id));
  let status = "pending";
  try {
    const v = await verifyAndApply(ref, providerHint);
    status = v.status === "succeeded" ? "success" : v.status === "failed" ? "failed" : "pending";
  } catch (e) {
    await reportError(e, { where: "payment-return", ref });
  }
  const dest = p.bookingId ? `/account/bookings/${p.bookingId}` : p.orderId ? `/account/orders/${p.orderId}` : "/account/activities";
  return NextResponse.redirect(`${base}${dest}?payment=${status}`);
}
