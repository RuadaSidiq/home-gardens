"use client";
import { ActionForm, Checkbox, SubmitButton } from "@/components/ui/form";
import { saveCommissionRule } from "../_actions/finance";

export function RuleForm({ r, categories, countries }: { r?: { id: number; name: string; serviceCategoryId: number | null; countryCode: string | null; rateBps: number; active: boolean }; categories: { id: number; name: string }[]; countries: string[] }) {
  const cls = "h-9 rounded-md border border-sand-300 px-2 text-sm";
  return (
    <ActionForm action={saveCommissionRule} resetOnSuccess={!r} className="flex flex-wrap items-center gap-2">
      {r && <input type="hidden" name="id" value={r.id} />}
      <input name="name" required defaultValue={r?.name} placeholder="Rule name" aria-label="Rule name" className={`${cls} w-56`} />
      <select name="serviceCategoryId" defaultValue={r?.serviceCategoryId ?? ""} aria-label="Service category" className={cls}><option value="">Any category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select name="countryCode" defaultValue={r?.countryCode ?? ""} aria-label="Country" className={cls}><option value="">Any country</option>{countries.map((c) => <option key={c}>{c}</option>)}</select>
      <label className="flex items-center gap-1 text-sm"><input name="rate" type="number" step="0.01" min={0} max={100} required defaultValue={r ? r.rateBps / 100 : ""} aria-label="Rate percent" className={`${cls} w-20`} />%</label>
      <Checkbox name="active" label="Active" defaultChecked={r?.active ?? true} />
      <SubmitButton size="sm" variant="outline">{r ? "Save" : "Add rule"}</SubmitButton>
    </ActionForm>
  );
}
