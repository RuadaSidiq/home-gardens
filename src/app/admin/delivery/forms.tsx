"use client";
import { ActionForm, Checkbox, Input, Select, SubmitButton } from "@/components/ui/form";
import { saveDeliveryMethod, saveZone } from "../_actions/commerce";

export function ZoneForm({ z, cities, countries }: { z?: { id: number; name: string; countryCode: string; cityIds: number[]; active: boolean }; cities: { id: number; name: string; countryCode: string }[]; countries: string[] }) {
  return (
    <ActionForm action={saveZone} resetOnSuccess={!z} className="space-y-3">
      {z && <input type="hidden" name="id" value={z.id} />}
      <div className="flex flex-wrap items-end gap-3">
        <Input label="Zone name" name="name" required defaultValue={z?.name} />
        <Select label="Country" name="countryCode" defaultValue={z?.countryCode ?? "GH"} options={countries.map((c) => ({ value: c, label: c }))} />
        <Checkbox name="active" label="Active" defaultChecked={z?.active ?? true} />
      </div>
      <div><p className="mb-1 text-xs text-ink-muted">Cities (none selected = whole country)</p><div className="flex flex-wrap gap-1.5">{cities.filter((c) => !z || c.countryCode === z.countryCode).map((c) => <label key={c.id} className="inline-flex items-center gap-1 rounded border border-sand-300 px-2 py-1 text-xs has-[:checked]:border-forest-600 has-[:checked]:bg-forest-50"><input type="checkbox" name="cityIds[]" value={c.id} defaultChecked={z?.cityIds.includes(c.id)} className="accent-forest-600" />{c.name}</label>)}</div></div>
      <SubmitButton size="sm" variant="outline">{z ? "Save zone" : "Add zone"}</SubmitButton>
    </ActionForm>
  );
}

type M = { id: number; name: string; type: string; price: number; pricePerKg: number; currency: string; freeOver: number | null; minDays: number; maxDays: number; active: boolean };
export function MethodForm({ zoneId, m }: { zoneId: number; m?: M }) {
  const cls = "h-8 rounded-md border border-sand-300 px-2 text-sm";
  return (
    <ActionForm action={saveDeliveryMethod} resetOnSuccess={!m} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="zoneId" value={zoneId} />
      {m && <input type="hidden" name="id" value={m.id} />}
      <input name="name" required defaultValue={m?.name} placeholder="Method name" aria-label="Method name" className={`${cls} w-56`} />
      <select name="type" defaultValue={m?.type ?? "flat"} aria-label="Type" className={cls}><option value="flat">Flat</option><option value="weight">By weight</option><option value="pickup">Pickup</option></select>
      <input name="price" type="number" step="0.01" min={0} defaultValue={m ? m.price / 100 : 0} aria-label="Base price" title="Base price" className={`${cls} w-20`} />
      <input name="pricePerKg" type="number" step="0.01" min={0} defaultValue={m ? m.pricePerKg / 100 : 0} aria-label="Per kg" title="Per kg" className={`${cls} w-20`} />
      <select name="currency" defaultValue={m?.currency ?? "GHS"} aria-label="Currency" className={cls}>{["GHS", "USD", "GBP", "EUR", "NGN"].map((c) => <option key={c}>{c}</option>)}</select>
      <input name="freeOver" type="number" step="0.01" min={0} defaultValue={m?.freeOver != null ? m.freeOver / 100 : ""} placeholder="Free over" aria-label="Free over" className={`${cls} w-24`} />
      <input name="minDays" type="number" min={0} defaultValue={m?.minDays ?? 1} aria-label="Min days" title="Min days" className={`${cls} w-14`} />
      <input name="maxDays" type="number" min={0} defaultValue={m?.maxDays ?? 3} aria-label="Max days" title="Max days" className={`${cls} w-14`} />
      <Checkbox name="active" label="Active" defaultChecked={m?.active ?? true} />
      <SubmitButton size="sm" variant="ghost">{m ? "Save" : "Add"}</SubmitButton>
    </ActionForm>
  );
}
