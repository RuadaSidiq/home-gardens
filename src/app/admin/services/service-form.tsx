"use client";
import { useState } from "react";
import { ActionForm, Checkbox, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { saveService } from "../_actions/catalog";

type S = { id?: string; name: string; categoryId: number; summary: string; description: string; pricingModel: string; basePrice: number; minimumCharge: number; currency: string; durationMinutes: number; depositPercent: number; requirements: string | null; includes: string[]; featured: boolean; active: boolean; seoTitle: string | null; seoDescription: string | null; images: string[] };

const HELP: Record<string, string> = {
  fixed: "Customer pays the base price.", starting: "Base price is the minimum; gardeners may propose a revised price.", hourly: "Base price per hour × hours chosen, at least the minimum charge.",
  per_sqm: "Base price per m² × garden size, at least the minimum charge.", quote: "No upfront price; staff send a quote.", inspection: "A site visit happens first, then a quote.",
};

export function ServiceForm({ s, categories, cities, selectedAreas, currencies }: { s?: S; categories: { id: number; name: string }[]; cities: { id: number; name: string }[]; selectedAreas: number[]; currencies: string[] }) {
  const [model, setModel] = useState(s?.pricingModel ?? "fixed");
  const priced = ["fixed", "starting", "hourly", "per_sqm"].includes(model);
  return (
    <ActionForm action={saveService} className="space-y-6" encType="multipart/form-data">
      {s?.id && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" name="name" required defaultValue={s?.name} />
        <Select label="Category" name="categoryId" defaultValue={s?.categoryId} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        <Input label="Summary" name="summary" required defaultValue={s?.summary} wrapClassName="sm:col-span-2" />
        <Textarea label="Description" name="description" required rows={5} defaultValue={s?.description} wrapClassName="sm:col-span-2" />
      </div>
      <fieldset className="rounded-lg border border-sand-200 p-4">
        <legend className="px-1 text-sm font-semibold">Pricing</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Pricing model" name="pricingModel" value={model} onChange={(e) => setModel(e.target.value)} options={[{ value: "fixed", label: "Fixed price" }, { value: "starting", label: "Starting price" }, { value: "hourly", label: "Hourly" }, { value: "per_sqm", label: "Per square metre" }, { value: "quote", label: "Custom quotation" }, { value: "inspection", label: "Inspection required" }]} hint={HELP[model]} />
          <Select label="Currency" name="currency" defaultValue={s?.currency ?? "GHS"} options={currencies.map((c) => ({ value: c, label: c }))} />
          <Input label="Deposit %" name="depositPercent" type="number" min={0} max={100} defaultValue={s?.depositPercent ?? 30} hint="100 = full payment upfront" />
          <Input label={model === "hourly" ? "Rate per hour" : model === "per_sqm" ? "Rate per m²" : "Base price"} name="basePrice" type="number" step="0.01" min={0} defaultValue={s ? s.basePrice / 100 : 0} disabled={!priced} />
          <Input label="Minimum charge" name="minimumCharge" type="number" step="0.01" min={0} defaultValue={s ? s.minimumCharge / 100 : 0} disabled={!priced} />
          <Input label="Estimated duration (minutes)" name="durationMinutes" type="number" min={15} defaultValue={s?.durationMinutes ?? 120} />
        </div>
        {!priced && <><input type="hidden" name="basePrice" value="0" /><input type="hidden" name="minimumCharge" value="0" /></>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Textarea label="What's included (one per line)" name="includes" rows={4} defaultValue={s?.includes.join("\n")} />
        <Textarea label="Customer requirements" name="requirements" rows={4} defaultValue={s?.requirements ?? ""} />
        <Textarea label="Image URLs (one per line)" name="imageUrls" rows={3} defaultValue={s?.images.join("\n")} />
        <Input label="Upload images" name="images" type="file" accept="image/*" multiple />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Available in</legend>
        <div className="flex flex-wrap gap-2">{cities.map((c) => <label key={c.id} className="inline-flex items-center gap-1.5 rounded-md border border-sand-300 bg-white px-2.5 py-1.5 text-sm has-[:checked]:border-forest-600 has-[:checked]:bg-forest-50"><input type="checkbox" name="areas[]" value={c.id} defaultChecked={selectedAreas.includes(c.id)} className="accent-forest-600" />{c.name}</label>)}</div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="SEO title" name="seoTitle" defaultValue={s?.seoTitle ?? ""} />
        <Input label="SEO description" name="seoDescription" defaultValue={s?.seoDescription ?? ""} />
      </div>
      <div className="flex flex-wrap gap-6"><Checkbox name="active" label="Published" defaultChecked={s?.active ?? true} /><Checkbox name="featured" label="Featured on homepage" defaultChecked={s?.featured} /></div>
      <SubmitButton>Save service</SubmitButton>
    </ActionForm>
  );
}
