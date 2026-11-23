"use client";
import { ActionForm, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { adminCreateBooking } from "../../_actions/bookings";

export function NewBookingForm({ services, cities }: { services: { id: string; name: string }[]; cities: { id: number; name: string }[] }) {
  return (
    <ActionForm action={adminCreateBooking} refresh={false} className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Input label="Customer email" name="customerEmail" type="email" required />
      <Select label="Service" name="serviceId" required placeholder="Choose" options={services.map((s) => ({ value: s.id, label: s.name }))} />
      <Select label="Area" name="cityId" required placeholder="Choose" options={cities.map((c) => ({ value: c.id, label: c.name }))} />
      <Input label="Site phone" name="contactPhone" type="tel" required />
      <Input label="Street address" name="line1" required wrapClassName="sm:col-span-2" />
      <Input label="Date" name="date" type="date" required />
      <Input label="Start time" name="time" type="time" required />
      <Input label="Garden size m² (per-area services)" name="gardenSizeSqm" type="number" min={1} />
      <Input label="Hours (hourly services)" name="hours" type="number" min={1} max={12} />
      <Textarea label="Job details" name="details" required wrapClassName="sm:col-span-2" />
      <p className="text-xs text-ink-muted sm:col-span-2">Staff bookings skip the minimum notice period. The customer pays from their account (or you can record a bank transfer in Payments).</p>
      <div className="sm:col-span-2"><SubmitButton>Create booking</SubmitButton></div>
    </ActionForm>
  );
}
