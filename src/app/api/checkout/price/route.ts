import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { getDisplayCurrency } from "@/server/site";
import { priceCheckout } from "@/server/commerce/orders";
import { UserError } from "@/server/errors";

/** Live checkout totals for the signed-in user's cart. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const u = new URL(req.url);
  const currency = await getDisplayCurrency();
  const run = (coupon: string | null) => priceCheckout({
      userId: user.id,
      currency,
      address: { recipient: "-", phone: "-", line1: "-", city: "-", cityId: Number(u.searchParams.get("city")) || null, countryCode: u.searchParams.get("country") ?? "GH" },
      deliveryMethodId: Number(u.searchParams.get("method")) || null,
      couponCode: coupon,
    });
  try {
    let couponError: string | null = null;
    let p;
    try {
      p = await run(u.searchParams.get("coupon") || null);
    } catch (e) {
      if (!(e instanceof UserError) || e.field !== "couponCode") throw e;
      couponError = e.message;
      p = await run(null);
    }
    return NextResponse.json({ subtotal: p.subtotal, discount: p.discount, shipping: p.shipping, tax: p.tax, taxLines: p.taxLines, total: p.total, hasMethod: !!p.method, couponError });
  } catch (e) {
    if (e instanceof UserError) return NextResponse.json({ error: e.message, field: e.field }, { status: 422 });
    throw e;
  }
}
