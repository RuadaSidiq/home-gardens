"use client";
import { ActionForm, Checkbox, SubmitButton } from "@/components/ui/form";
import { saveBrand, saveProductCategory } from "../_actions/catalog";

export function ProductCategoryForm({ c }: { c?: { id: number; name: string; description: string | null; imageUrl: string | null; sort: number; active: boolean } }) {
  const cls = "h-9 rounded-md border border-sand-300 px-2 text-sm";
  return (
    <ActionForm action={saveProductCategory} resetOnSuccess={!c} className="flex flex-wrap items-center gap-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input name="name" required defaultValue={c?.name} placeholder="Name" aria-label="Name" className={`${cls} w-48`} />
      <input name="description" defaultValue={c?.description ?? ""} placeholder="Description" aria-label="Description" className={`${cls} w-56`} />
      <input name="imageUrl" defaultValue={c?.imageUrl ?? ""} placeholder="Image URL" aria-label="Image URL" className={`${cls} min-w-[12rem] flex-1`} />
      <input name="sort" type="number" defaultValue={c?.sort ?? 99} aria-label="Sort" className={`${cls} w-16`} />
      <Checkbox name="active" label="Active" defaultChecked={c?.active ?? true} />
      <SubmitButton size="sm" variant="outline">{c ? "Save" : "Add"}</SubmitButton>
    </ActionForm>
  );
}

export function BrandForm() {
  return (
    <ActionForm action={saveBrand} resetOnSuccess className="flex gap-2">
      <input name="name" required placeholder="New brand" aria-label="Brand name" className="h-9 rounded-md border border-sand-300 px-2 text-sm" />
      <SubmitButton size="sm" variant="outline">Add brand</SubmitButton>
    </ActionForm>
  );
}
