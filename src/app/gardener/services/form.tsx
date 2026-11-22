"use client";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { saveServices } from "../actions";

type S = { id: string; name: string; category: string; pricingModel: string; on: boolean; customPrice: string };

export function ServicesForm({ services, cities, areas, baseCityId, independent, currency }: { services: S[]; cities: { id: number; name: string }[]; areas: number[]; baseCityId: number | null; independent: boolean; currency: string }) {
  const grouped = services.reduce<Record<string, S[]>>((a, s) => ((a[s.category] ??= []).push(s), a), {});
  return (
    <ActionForm action={saveServices} className="space-y-8">
      <div className="space-y-5">
        {Object.entries(grouped).map(([cat, list]) => (
          <fieldset key={cat}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{cat}</legend>
            <div className="divide-y divide-sand-100 rounded-lg border border-sand-200 bg-white">
              {list.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <label className="flex items-center gap-2.5 text-sm font-medium"><input type="checkbox" name="services[]" value={s.id} defaultChecked={s.on} className="h-4 w-4 accent-forest-600" />{s.name}</label>
                  {independent && ["fixed", "starting", "hourly", "per_sqm"].includes(s.pricingModel) && (
                    <label className="flex items-center gap-2 text-xs text-ink-muted">Your price ({currency}{s.pricingModel === "hourly" ? "/h" : s.pricingModel === "per_sqm" ? "/m²" : ""})
                      <input name={`price_${s.id}`} type="number" min={0} step="0.01" defaultValue={s.customPrice} placeholder="Platform price" className="h-8 w-28 rounded-md border border-sand-300 px-2 text-sm" />
                    </label>
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <fieldset>
        <legend className="mb-2 font-semibold">Areas you cover</legend>
        <p className="mb-3 text-sm text-ink-muted">Your home base is always included.</p>
        <div className="flex flex-wrap gap-2">
          {cities.filter((c) => c.id !== baseCityId).map((c) => (
            <label key={c.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-sand-300 bg-white px-2.5 py-1.5 text-sm has-[:checked]:border-forest-600 has-[:checked]:bg-forest-50">
              <input type="checkbox" name="areas[]" value={c.id} defaultChecked={areas.includes(c.id)} className="accent-forest-600" />{c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton>Save services & areas</SubmitButton>
    </ActionForm>
  );
}
