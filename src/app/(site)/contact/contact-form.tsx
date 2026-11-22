"use client";
import { ActionForm, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { sendContact } from "../actions";

export function ContactForm() {
  return (
    <ActionForm action={sendContact} resetOnSuccess refresh={false} className="grid gap-4 sm:grid-cols-2">
      <Input label="Name" name="name" required autoComplete="name" />
      <Input label="Email" name="email" type="email" required autoComplete="email" />
      <Input label="Phone (optional)" name="phone" type="tel" autoComplete="tel" />
      <Select label="Topic" name="topic" required options={["Booking or quote", "Shop order", "Corporate or estate contract", "Becoming a gardener", "Partnership", "Something else"].map((t) => ({ value: t, label: t }))} />
      <Textarea label="Message" name="message" required rows={6} wrapClassName="sm:col-span-2" />
      <div className="sm:col-span-2"><SubmitButton size="lg">Send message</SubmitButton></div>
    </ActionForm>
  );
}
