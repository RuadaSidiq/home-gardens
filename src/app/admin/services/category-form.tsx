"use client";
import { ActionForm, Checkbox, SubmitButton } from "@/components/ui/form";
import { saveServiceCategory } from "../_actions/catalog";

export function CategoryForm({ c }: { c?: { id: number; name: string; description: string; icon: string; sort: number; active: boolean } }) {
  const cls = "h-9 rounded-md border border-sand-300 px-2 text-sm";
  return (
    <ActionForm action={saveServiceCategory} resetOnSuccess={!c} className="flex flex-wrap items-center gap-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input name="name" defaultValue={c?.name} required placeholder="Name" aria-label="Name" className={`${cls} w-52`} />
      <input name="description" defaultValue={c?.description} placeholder="Description" aria-label="Description" className={`${cls} min-w-[16rem] flex-1`} />
      <select name="icon" defaultValue={c?.icon ?? "leaf"} aria-label="Icon" className={cls}>{["lawn", "landscape", "design", "tree", "sprout", "broom", "weed", "droplet", "shears", "flask", "clipboard", "leaf", "bug"].map((i) => <option key={i}>{i}</option>)}</select>
      <input name="sort" type="number" defaultValue={c?.sort ?? 99} aria-label="Sort order" className={`${cls} w-16`} />
      <Checkbox name="active" label="Active" defaultChecked={c?.active ?? true} />
      <SubmitButton size="sm" variant="outline">{c ? "Save" : "Add"}</SubmitButton>
    </ActionForm>
  );
}
