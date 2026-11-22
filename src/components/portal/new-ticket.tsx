"use client";
import { ActionForm, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { openTicket } from "@/app/account/actions";

export function NewTicketForm({ bookings, orders, defaultBooking }: { bookings: { id: string; reference: string }[]; orders: { id: string; reference: string }[]; defaultBooking?: string }) {
  return (
    <ActionForm action={openTicket} refresh={false} className="space-y-4">
      <Select label="Topic" name="category" defaultValue={defaultBooking ? "booking" : "general"} options={[{ value: "general", label: "General question" }, { value: "booking", label: "A booking" }, { value: "order", label: "A shop order" }, { value: "payment", label: "Payment or refund" }, { value: "account", label: "My account" }, { value: "gardener", label: "Gardener account" }]} />
      {bookings.length > 0 && <Select label="Related booking (optional)" name="bookingId" defaultValue={defaultBooking ?? ""} placeholder="None" options={bookings.map((b) => ({ value: b.id, label: b.reference }))} />}
      {orders.length > 0 && <Select label="Related order (optional)" name="orderId" placeholder="None" options={orders.map((o) => ({ value: o.id, label: o.reference }))} />}
      <Input label="Subject" name="subject" required />
      <Textarea label="How can we help?" name="body" required rows={4} />
      <SubmitButton>Send request</SubmitButton>
    </ActionForm>
  );
}
