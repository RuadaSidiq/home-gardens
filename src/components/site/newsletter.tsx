"use client";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { subscribeNewsletter } from "@/app/(site)/actions";

export function NewsletterForm({ dark, stacked }: { dark?: boolean; stacked?: boolean }) {
  return (
    <ActionForm action={subscribeNewsletter} resetOnSuccess refresh={false} className="w-full">
      <div className={stacked ? "flex flex-col gap-2" : "flex flex-col gap-2 sm:flex-row"}>
        <label htmlFor="nl-email" className="sr-only">Email address</label>
        <input id="nl-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={dark ? "h-11 flex-1 rounded-md border border-forest-700 bg-forest-900 px-3 text-white placeholder:text-forest-300 focus:border-forest-300 focus:outline-none" : "h-11 flex-1 rounded-md border border-sand-300 px-3 focus:border-forest-500 focus:outline-none"} />
        <SubmitButton variant={dark ? "light" : "primary"} size="lg" className="h-11">Subscribe</SubmitButton>
      </div>
    </ActionForm>
  );
}
