"use client";
import { ActionForm, Checkbox, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { saveAnnouncement, saveFaq, saveHero, savePage, saveProject, savePromo, saveSeo, saveTestimonial } from "../_actions/system";

type Hero = { eyebrow: string; title: string; subtitle: string; image: string; primaryLabel: string; secondaryLabel: string };
export function HeroForm({ v }: { v: Hero }) {
  return (
    <ActionForm action={saveHero} className="grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
      <Input label="Eyebrow" name="eyebrow" defaultValue={v.eyebrow} />
      <Input label="Headline" name="title" required defaultValue={v.title} />
      <Textarea label="Introduction" name="subtitle" rows={2} defaultValue={v.subtitle} wrapClassName="sm:col-span-2" />
      <Input label="Image URL" name="image" defaultValue={v.image} />
      <Input label="…or upload image" name="imageFile" type="file" accept="image/*" />
      <Input label="Primary button label" name="primaryLabel" defaultValue={v.primaryLabel} />
      <Input label="Secondary link label" name="secondaryLabel" defaultValue={v.secondaryLabel} />
      <div className="sm:col-span-2"><SubmitButton>Save hero</SubmitButton></div>
    </ActionForm>
  );
}

export function PromoForm({ v }: { v: { title: string; body: string; image: string; ctaLabel: string; ctaHref: string; active: boolean } }) {
  return (
    <ActionForm action={savePromo} className="grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
      <Input label="Title" name="title" defaultValue={v.title} />
      <Input label="Button label" name="ctaLabel" defaultValue={v.ctaLabel} />
      <Textarea label="Text" name="body" rows={2} defaultValue={v.body} wrapClassName="sm:col-span-2" />
      <Input label="Button link (internal, e.g. /services)" name="ctaHref" defaultValue={v.ctaHref} />
      <Input label="Image URL" name="image" defaultValue={v.image} />
      <Input label="…or upload image" name="imageFile" type="file" accept="image/*" />
      <Checkbox name="active" label="Show on homepage" defaultChecked={v.active} className="self-end" />
      <div className="sm:col-span-2"><SubmitButton>Save banner</SubmitButton></div>
    </ActionForm>
  );
}

export function AnnouncementForm({ v }: { v: { text: string; active: boolean } }) {
  return (
    <ActionForm action={saveAnnouncement} className="flex flex-wrap items-end gap-3">
      <Input label="Site-wide announcement bar" name="text" defaultValue={v.text} wrapClassName="min-w-[18rem] flex-1" />
      <Checkbox name="active" label="Show" defaultChecked={v.active} />
      <SubmitButton variant="outline">Save</SubmitButton>
    </ActionForm>
  );
}

export function SeoForm({ v }: { v: { title: string; description: string } }) {
  return (
    <ActionForm action={saveSeo} className="grid gap-3">
      <Input label="Default page title" name="title" required defaultValue={v.title} />
      <Textarea label="Default meta description" name="description" required rows={2} defaultValue={v.description} />
      <div><SubmitButton variant="outline">Save SEO</SubmitButton></div>
    </ActionForm>
  );
}

export function TestimonialForm({ t }: { t?: { id: string; name: string; location: string; quote: string; serviceLabel: string | null; sort: number; active: boolean } }) {
  return (
    <ActionForm action={saveTestimonial} resetOnSuccess={!t} className="grid gap-3 sm:grid-cols-4">
      {t && <input type="hidden" name="id" value={t.id} />}
      <Input label="Name" name="name" required defaultValue={t?.name} />
      <Input label="Location" name="location" required defaultValue={t?.location} />
      <Input label="Service" name="serviceLabel" defaultValue={t?.serviceLabel ?? ""} />
      <Input label="Order" name="sort" type="number" defaultValue={t?.sort ?? 0} />
      <Textarea label="Quote" name="quote" required rows={2} defaultValue={t?.quote} wrapClassName="sm:col-span-4" />
      <div className="flex flex-wrap items-center gap-4 sm:col-span-4"><Checkbox name="active" label="Active" defaultChecked={t?.active ?? true} />{t && <Checkbox name="delete" label="Delete" />}<SubmitButton size="sm" variant="outline">{t ? "Save" : "Add testimonial"}</SubmitButton></div>
    </ActionForm>
  );
}

export function FaqForm({ q }: { q?: { id: string; category: string; question: string; answer: string; sort: number; active: boolean } }) {
  return (
    <ActionForm action={saveFaq} resetOnSuccess={!q} className="grid gap-3 sm:grid-cols-4">
      {q && <input type="hidden" name="id" value={q.id} />}
      <Input label="Category" name="category" required defaultValue={q?.category ?? "Bookings"} />
      <Input label="Question" name="question" required defaultValue={q?.question} wrapClassName="sm:col-span-2" />
      <Input label="Order" name="sort" type="number" defaultValue={q?.sort ?? 0} />
      <Textarea label="Answer" name="answer" required rows={2} defaultValue={q?.answer} wrapClassName="sm:col-span-4" />
      <div className="flex flex-wrap items-center gap-4 sm:col-span-4"><Checkbox name="active" label="Active" defaultChecked={q?.active ?? true} />{q && <Checkbox name="delete" label="Delete" />}<SubmitButton size="sm" variant="outline">{q ? "Save" : "Add FAQ"}</SubmitButton></div>
    </ActionForm>
  );
}

export function ProjectForm({ p, categories }: { p?: { id: string; title: string; location: string; summary: string; beforeUrl: string; afterUrl: string; durationLabel: string | null; serviceCategoryId: number | null; sort: number; featured: boolean }; categories: { id: number; name: string }[] }) {
  return (
    <ActionForm action={saveProject} resetOnSuccess={!p} className="grid gap-3 sm:grid-cols-3" encType="multipart/form-data">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Input label="Title" name="title" required defaultValue={p?.title} />
      <Input label="Location" name="location" required defaultValue={p?.location} />
      <Select label="Service" name="serviceCategoryId" defaultValue={p?.serviceCategoryId ?? ""} placeholder="None" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
      <Textarea label="Summary" name="summary" required rows={2} defaultValue={p?.summary} wrapClassName="sm:col-span-3" />
      <Input label="Before photo URL" name="beforeUrl" defaultValue={p?.beforeUrl} />
      <Input label="After photo URL" name="afterUrl" defaultValue={p?.afterUrl} />
      <Input label="Duration" name="durationLabel" defaultValue={p?.durationLabel ?? ""} placeholder="3 days" />
      <Input label="…or upload before" name="beforeFile" type="file" accept="image/*" />
      <Input label="…or upload after" name="afterFile" type="file" accept="image/*" />
      <Input label="Order" name="sort" type="number" defaultValue={p?.sort ?? 0} />
      <div className="flex flex-wrap items-center gap-4 sm:col-span-3"><Checkbox name="featured" label="Show on homepage" defaultChecked={p?.featured ?? true} />{p && <Checkbox name="delete" label="Delete" />}<SubmitButton size="sm" variant="outline">{p ? "Save" : "Add project"}</SubmitButton></div>
    </ActionForm>
  );
}

export function PageForm({ p }: { p?: { slug: string; title: string; body: string; seoTitle: string | null; seoDescription: string | null; published: boolean } }) {
  return (
    <ActionForm action={savePage} resetOnSuccess={!p} className="grid gap-3 sm:grid-cols-2">
      <Input label="Slug" name="slug" required defaultValue={p?.slug} readOnly={!!p} hint="Page URL: /pages/slug" />
      <Input label="Title" name="title" required defaultValue={p?.title} />
      <Textarea label="Content (## headings, *italic*, **bold**, - lists)" name="body" required rows={8} defaultValue={p?.body} wrapClassName="sm:col-span-2" />
      <Input label="SEO title" name="seoTitle" defaultValue={p?.seoTitle ?? ""} />
      <Input label="SEO description" name="seoDescription" defaultValue={p?.seoDescription ?? ""} />
      <div className="flex items-center gap-4 sm:col-span-2"><Checkbox name="published" label="Published" defaultChecked={p?.published ?? true} /><SubmitButton size="sm" variant="outline">Save page</SubmitButton></div>
    </ActionForm>
  );
}
