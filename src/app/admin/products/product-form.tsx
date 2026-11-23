"use client";
import { ActionForm, Checkbox, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { saveProduct, saveVariant } from "../_actions/catalog";

type P = { id?: string; name: string; sku: string; summary: string; description: string; categoryId: number; brandId: number | null; vendorId: string; price: number; salePrice: number | null; currency: string; weightGrams: number; lowStockThreshold: number; specs: Record<string, string>; images: string[]; featured: boolean; active: boolean; allowBackorder: boolean; taxable: boolean; shippable: boolean; seoTitle: string | null; seoDescription: string | null };

export function ProductForm({ p, categories, brands, vendors, currencies }: { p?: P; categories: { id: number; name: string }[]; brands: { id: number; name: string }[]; vendors: { id: string; name: string }[]; currencies: string[] }) {
  return (
    <ActionForm action={saveProduct} className="space-y-6" encType="multipart/form-data">
      {p?.id && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" name="name" required defaultValue={p?.name} />
        <Input label="SKU" name="sku" required defaultValue={p?.sku} />
        <Select label="Category" name="categoryId" defaultValue={p?.categoryId} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        <Select label="Brand" name="brandId" defaultValue={p?.brandId ?? ""} placeholder="None" options={brands.map((b) => ({ value: b.id, label: b.name }))} />
        <Select label="Sold by" name="vendorId" defaultValue={p?.vendorId} options={vendors.map((v) => ({ value: v.id, label: v.name }))} />
        <Select label="Currency" name="currency" defaultValue={p?.currency ?? "GHS"} options={currencies.map((c) => ({ value: c, label: c }))} />
        <Input label="Regular price" name="price" type="number" step="0.01" min={0} required defaultValue={p ? p.price / 100 : ""} />
        <Input label="Sale price (optional)" name="salePrice" type="number" step="0.01" min={0} defaultValue={p?.salePrice != null ? p.salePrice / 100 : ""} />
        <Input label="Weight (grams)" name="weightGrams" type="number" min={0} defaultValue={p?.weightGrams ?? 0} hint="Used for weight-based delivery." />
        <Input label="Low-stock alert at" name="lowStockThreshold" type="number" min={0} defaultValue={p?.lowStockThreshold ?? 5} />
        {!p && <Input label="Opening stock (default warehouse)" name="initialStock" type="number" min={0} defaultValue={0} />}
        <Input label="Short summary" name="summary" defaultValue={p?.summary} wrapClassName="sm:col-span-2" />
        <Textarea label="Description" name="description" required rows={5} defaultValue={p?.description} wrapClassName="sm:col-span-2" />
        <Textarea label="Specifications (Name: value, one per line)" name="specs" rows={5} defaultValue={p ? Object.entries(p.specs).map(([k, v]) => `${k}: ${v}`).join("\n") : ""} />
        <Textarea label="Image URLs (one per line)" name="imageUrls" rows={5} defaultValue={p?.images.join("\n")} />
        <Input label="Upload images" name="images" type="file" accept="image/*" multiple wrapClassName="sm:col-span-2" />
        <Input label="SEO title" name="seoTitle" defaultValue={p?.seoTitle ?? ""} />
        <Input label="SEO description" name="seoDescription" defaultValue={p?.seoDescription ?? ""} />
      </div>
      <div className="flex flex-wrap gap-6">
        <Checkbox name="active" label="Active" defaultChecked={p?.active ?? true} />
        <Checkbox name="featured" label="Featured" defaultChecked={p?.featured} />
        <Checkbox name="taxable" label="Taxable" defaultChecked={p?.taxable ?? true} />
        <Checkbox name="shippable" label="Requires delivery" defaultChecked={p?.shippable ?? true} />
        <Checkbox name="allowBackorder" label="Allow backorders (sell when out of stock)" defaultChecked={p?.allowBackorder} />
      </div>
      <SubmitButton>Save product</SubmitButton>
    </ActionForm>
  );
}

export function VariantForm({ productId, v }: { productId: string; v?: { id: string; name: string; sku: string; optionName?: string; price: number | null; salePrice: number | null; active: boolean } }) {
  const cls = "h-9 rounded-md border border-sand-300 px-2 text-sm";
  return (
    <ActionForm action={saveVariant} resetOnSuccess={!v} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="productId" value={productId} />
      {v && <input type="hidden" name="id" value={v.id} />}
      <input name="name" required defaultValue={v?.name} placeholder="Variant, e.g. 35 cm" aria-label="Variant name" className={`${cls} w-36`} />
      <input name="optionName" defaultValue={v?.optionName} placeholder="Option, e.g. Size" aria-label="Option name" className={`${cls} w-28`} />
      <input name="sku" required defaultValue={v?.sku} placeholder="SKU" aria-label="SKU" className={`${cls} w-36`} />
      <input name="price" type="number" step="0.01" defaultValue={v?.price != null ? v.price / 100 : ""} placeholder="Price override" aria-label="Price override" className={`${cls} w-32`} />
      <input name="salePrice" type="number" step="0.01" defaultValue={v?.salePrice != null ? v.salePrice / 100 : ""} placeholder="Sale override" aria-label="Sale price override" className={`${cls} w-28`} />
      <Checkbox name="active" label="Active" defaultChecked={v?.active ?? true} />
      <SubmitButton size="sm" variant="outline">{v ? "Save" : "Add variant"}</SubmitButton>
    </ActionForm>
  );
}
