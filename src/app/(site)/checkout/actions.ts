"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { UserError } from "@/server/errors";
import { createOrder } from "@/server/commerce/orders";
import { initiatePayment } from "@/server/payments/service";
import { getDisplayCurrency } from "@/server/site";

const checkoutSchema = z.object({
  addressId: f.optUuid(),
  recipient: f.text(120).optional(),
  phone: f.text(30).optional(),
  line1: f.text(200).optional(),
  line2: f.text(200).optional(),
  cityId: f.optInt(1),
  digitalAddress: f.text(30).optional(),
  countryCode: z.string().length(2),
  saveAddress: f.bool().optional(),
  deliveryMethodId: f.int(1),
  couponCode: f.text(40).optional(),
  note: f.text(500).optional(),
  provider: f.req("Payment method", 20),
});

export async function placeOrder(_: Prev, fd: FormData) {
  return run(fd, checkoutSchema, async (i) => {
    const user = await getCurrentUser();
    if (!user) throw new UserError("Please sign in.");
    let address;
    if (i.addressId) {
      const [a] = await db.select().from(schema.addresses).where(and(eq(schema.addresses.id, i.addressId), eq(schema.addresses.userId, user.id)));
      if (!a) throw new UserError("Choose a delivery address.");
      address = { recipient: a.recipient, phone: a.phone, line1: a.line1, line2: a.line2 ?? undefined, city: a.city, cityId: a.cityId, region: a.region ?? undefined, digitalAddress: a.digitalAddress ?? undefined, countryCode: a.countryCode };
    } else {
      if (!i.recipient || !i.phone || !i.line1 || !i.cityId) throw new UserError("Complete the delivery address.");
      const [city] = await db.select().from(schema.cities).where(eq(schema.cities.id, i.cityId));
      if (!city) throw new UserError("Choose a city.", "cityId");
      address = { recipient: i.recipient, phone: i.phone, line1: i.line1, line2: i.line2 || undefined, city: city.name, cityId: city.id, digitalAddress: i.digitalAddress || undefined, countryCode: city.countryCode };
      if (i.saveAddress) {
        await db.insert(schema.addresses).values({ userId: user.id, recipient: i.recipient, phone: i.phone, line1: i.line1, line2: i.line2 || null, city: city.name, cityId: city.id, digitalAddress: i.digitalAddress || null, countryCode: city.countryCode });
      }
    }
    const currency = await getDisplayCurrency();
    const order = await createOrder({ userId: user.id, email: user.email, currency, address, deliveryMethodId: i.deliveryMethodId, couponCode: i.couponCode || null, note: i.note || null });
    let url: string;
    try {
      url = (await initiatePayment({ purpose: "order", subjectId: order.id, userId: user.id, email: user.email, provider: i.provider })).url;
    } catch (e) {
      // order exists with stock reserved; send the customer to it to retry payment
      redirect(`/account/orders/${order.id}?payment=error`);
    }
    redirect(url);
  });
}
