"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { run, f, type Prev } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { UserError } from "@/server/errors";
import { createBooking } from "@/server/bookings/engine";
import { storeImages } from "@/server/storage";
import { rateLimit } from "@/server/rate-limit";

const schema = z.object({
  serviceId: f.uuid(),
  countryCode: z.string().length(2),
  cityId: f.int(1),
  line1: f.req("Street address", 200),
  line2: f.text(200).optional(),
  digitalAddress: f.text(30).optional(),
  contactPhone: f.phone(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a time"),
  gardenSizeSqm: f.optInt(1, 1_000_000),
  hours: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(1).max(12).optional()),
  details: f.req("Job details", 3000).refine((s) => s.length >= 10, "Tell us a little more about the job"),
  customerNotes: f.text(1000).optional(),
  gardenerId: f.optUuid(),
  couponCode: f.text(40).optional(),
});

export async function submitBooking(_: Prev, fd: FormData) {
  return run(fd, schema, async (i) => {
    const user = await getCurrentUser();
    if (!user) throw new UserError("Please sign in to book.");
    if (!(await rateLimit(`booking:${user.id}`, 10, 3600))) throw new UserError("You've made several bookings in a short time. Please try again later or contact support.");
    const photos = await storeImages(fd.getAll("photos") as File[], "booking-requests", user.id, 6);
    const b = await createBooking({
      customerId: user.id,
      serviceId: i.serviceId,
      countryCode: i.countryCode,
      cityId: i.cityId,
      address: { line1: i.line1, line2: i.line2 || undefined, digitalAddress: i.digitalAddress || undefined },
      contactPhone: i.contactPhone,
      date: i.date,
      time: i.time,
      gardenSizeSqm: i.gardenSizeSqm ?? null,
      hours: i.hours ?? null,
      details: i.details,
      customerNotes: i.customerNotes || null,
      gardenerId: i.gardenerId ?? null,
      couponCode: i.couponCode || null,
      photos,
    });
    redirect(`/account/bookings/${b.id}?created=1`);
  });
}
