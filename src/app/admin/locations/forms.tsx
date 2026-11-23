"use client";
import { ActionForm, ActionButton, Checkbox, Input, Select, SubmitButton } from "@/components/ui/form";
import { saveCity, saveCountry, saveRate, saveTax, toggleCurrency } from "../_actions/system";

type Country = { code: string; name: string; currency: string; phoneCode: string; timezone: string; addressFormat: { postalCodeRequired: boolean; regionLabel: string; postalLabel?: string }; paymentProviders: string[]; servicesEnabled: boolean; shippingEnabled: boolean; active: boolean };
const PROVIDERS = ["paystack", "hubtel", "stripe", "paypal", "manual"];

export function CountryForm({ c, currencies }: { c?: Country; currencies: string[] }) {
  return (
    <ActionForm action={saveCountry} resetOnSuccess={!c} className="grid gap-3 sm:grid-cols-4">
      <Input label="ISO code" name="code" required maxLength={2} defaultValue={c?.code} readOnly={!!c} />
      <Input label="Name" name="name" required defaultValue={c?.name} />
      <Select label="Currency" name="currency" defaultValue={c?.currency ?? "USD"} options={currencies.map((x) => ({ value: x, label: x }))} />
      <Input label="Phone code" name="phoneCode" required defaultValue={c?.phoneCode} placeholder="+233" />
      <Input label="Time zone" name="timezone" required defaultValue={c?.timezone} placeholder="Africa/Accra" />
      <Input label="Region label" name="regionLabel" defaultValue={c?.addressFormat.regionLabel} placeholder="Region / State" />
      <Input label="Postal code label" name="postalLabel" defaultValue={c?.addressFormat.postalLabel ?? ""} />
      <Checkbox name="postalCodeRequired" label="Postal code required" defaultChecked={c?.addressFormat.postalCodeRequired} className="self-end" />
      <div className="sm:col-span-4"><p className="mb-1 text-xs font-medium text-ink-muted">Payment providers offered</p><div className="flex flex-wrap gap-3">{PROVIDERS.map((p) => <label key={p} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="providers[]" value={p} defaultChecked={c?.paymentProviders.includes(p)} className="accent-forest-600" />{p}</label>)}</div></div>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-4"><Checkbox name="servicesEnabled" label="Garden services offered" defaultChecked={c?.servicesEnabled} /><Checkbox name="shippingEnabled" label="Shop delivery" defaultChecked={c?.shippingEnabled} /><Checkbox name="active" label="Active" defaultChecked={c?.active ?? true} /><SubmitButton size="sm" variant="outline">{c ? "Save" : "Add country"}</SubmitButton></div>
    </ActionForm>
  );
}

export function CityForm({ c, countries }: { c?: { id: number; name: string; countryCode: string; region: string | null; serviceAvailable: boolean; active: boolean }; countries: string[] }) {
  const cls = "h-9 rounded-md border border-sand-300 px-2 text-sm";
  return (
    <ActionForm action={saveCity} resetOnSuccess={!c} className="flex flex-wrap items-center gap-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input name="name" required defaultValue={c?.name} placeholder="City / area" aria-label="City" className={`${cls} w-44`} />
      <select name="countryCode" defaultValue={c?.countryCode ?? "GH"} aria-label="Country" className={cls}>{countries.map((x) => <option key={x}>{x}</option>)}</select>
      <input name="regionName" defaultValue={c?.region ?? ""} placeholder="Region" aria-label="Region" className={`${cls} w-40`} />
      <Checkbox name="serviceAvailable" label="Services" defaultChecked={c?.serviceAvailable} />
      <Checkbox name="active" label="Active" defaultChecked={c?.active ?? true} />
      <SubmitButton size="sm" variant="ghost">{c ? "Save" : "Add"}</SubmitButton>
    </ActionForm>
  );
}

export function RateForm({ currencies }: { currencies: string[] }) {
  return (
    <ActionForm action={saveRate} resetOnSuccess className="flex flex-wrap items-end gap-2">
      <span className="pb-2 text-sm">1</span>
      <Select label="Base" name="base" defaultValue="USD" options={currencies.map((c) => ({ value: c, label: c }))} />
      <span className="pb-2 text-sm">=</span>
      <Input label="Rate" name="rate" type="number" step="0.00000001" min={0} required wrapClassName="w-36" />
      <Select label="Quote" name="quote" defaultValue="GHS" options={currencies.map((c) => ({ value: c, label: c }))} />
      <SubmitButton variant="outline">Save rate</SubmitButton>
    </ActionForm>
  );
}

export function CurrencyToggle({ code, active }: { code: string; active: boolean }) {
  return <ActionButton action={toggleCurrency} fields={{ code, active: active ? "0" : "1" }} variant="ghost">{active ? "Disable" : "Enable"}</ActionButton>;
}

export function TaxForm({ t, countries }: { t?: { id: number; countryCode: string; name: string; rateBps: number; scope: string; inclusive: boolean; active: boolean }; countries: string[] }) {
  const cls = "h-9 rounded-md border border-sand-300 px-2 text-sm";
  return (
    <ActionForm action={saveTax} resetOnSuccess={!t} className="flex flex-wrap items-center gap-2">
      {t && <input type="hidden" name="id" value={t.id} />}
      <select name="countryCode" defaultValue={t?.countryCode ?? "GH"} aria-label="Country" className={cls}>{countries.map((x) => <option key={x}>{x}</option>)}</select>
      <input name="name" required defaultValue={t?.name} placeholder="Tax name" aria-label="Tax name" className={`${cls} w-44`} />
      <label className="flex items-center gap-1 text-sm"><input name="rate" type="number" step="0.01" min={0} max={100} required defaultValue={t ? t.rateBps / 100 : ""} aria-label="Rate" className={`${cls} w-20`} />%</label>
      <select name="scope" defaultValue={t?.scope ?? "all"} aria-label="Applies to" className={cls}>{["all", "products", "services", "activities"].map((x) => <option key={x}>{x}</option>)}</select>
      <Checkbox name="inclusive" label="Included in prices" defaultChecked={t?.inclusive} />
      <Checkbox name="active" label="Active" defaultChecked={t?.active ?? true} />
      <SubmitButton size="sm" variant="ghost">{t ? "Save" : "Add"}</SubmitButton>
    </ActionForm>
  );
}
