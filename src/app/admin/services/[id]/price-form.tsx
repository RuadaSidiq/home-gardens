"use client";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { saveServicePrice } from "../../_actions/catalog";

export function CountryPriceForm({ serviceId, country, currency, base, min }: { serviceId: string; country: { code: string; name: string }; currency: string; base?: number; min?: number }) {
  const cls = "h-9 w-28 rounded-md border border-sand-300 px-2 text-sm";
  return (
    <ActionForm action={saveServicePrice} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="countryCode" value={country.code} />
      <span className="w-32 font-medium">{country.name}</span>
      <input name="basePrice" type="number" step="0.01" min={0} defaultValue={base != null ? base / 100 : ""} placeholder="Converted" aria-label={`${country.name} base price`} className={cls} />
      <input name="minimumCharge" type="number" step="0.01" min={0} defaultValue={min != null ? min / 100 : ""} placeholder="Min." aria-label={`${country.name} minimum`} className={cls} />
      <span className="text-ink-muted">{currency}</span>
      <SubmitButton size="sm" variant="outline">Save</SubmitButton>
    </ActionForm>
  );
}
