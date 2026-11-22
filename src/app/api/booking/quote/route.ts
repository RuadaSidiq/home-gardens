import { NextResponse } from "next/server";
import { quoteServicePrice } from "@/server/bookings/engine";
import { UserError } from "@/server/errors";
import { getCurrentUser } from "@/server/auth/session";

export async function GET(req: Request) {
  const u = new URL(req.url);
  try {
    const user = await getCurrentUser();
    const args = {
      serviceId: u.searchParams.get("service") ?? "",
      countryCode: u.searchParams.get("country") ?? "GH",
      gardenSizeSqm: u.searchParams.get("size") ? Number(u.searchParams.get("size")) : null,
      hours: u.searchParams.get("hours") ? Number(u.searchParams.get("hours")) : null,
      gardenerId: u.searchParams.get("gardener") || null,
      couponCode: u.searchParams.get("coupon") || null,
      userId: user?.id ?? null,
    };
    let couponError: string | null = null;
    let q;
    try {
      q = await quoteServicePrice(args);
    } catch (e) {
      if (!(e instanceof UserError) || e.field !== "couponCode") throw e;
      couponError = e.message;
      q = await quoteServicePrice({ ...args, couponCode: null });
    }
    if (q.kind === "quote") return NextResponse.json({ kind: "quote", reason: q.reason, currency: q.currency });
    return NextResponse.json({ kind: "priced", currency: q.currency, subtotal: q.subtotal, discount: q.discount, tax: q.tax, taxLines: q.taxLines, total: q.total, deposit: q.deposit, isFinal: q.isFinal, breakdown: q.breakdown, depositPercent: q.service.depositPercent, couponError });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message, field: e.field }, { status: 422 });
    throw e;
  }
}
