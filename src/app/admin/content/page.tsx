import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { getContent } from "@/server/settings";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { AnnouncementForm, FaqForm, HeroForm, PageForm, ProjectForm, PromoForm, SeoForm, TestimonialForm } from "./forms";

export const metadata = { title: "Website content" };
const TABS = [["home", "Homepage"], ["testimonials", "Testimonials"], ["projects", "Projects"], ["faqs", "FAQs"], ["pages", "Pages"], ["seo", "SEO"]] as const;

export default async function Content({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission("content.manage");
  const tab = (await searchParams).tab ?? "home";
  return (
    <>
      <PageHeader title="Website content" description="Changes are live immediately. Featured services and products are set on each service/product." />
      <nav className="scrollbar-none -mx-4 mb-5 flex gap-1 overflow-x-auto px-4">{TABS.map(([k, l]) => <Link key={k} href={`/admin/content?tab=${k}`} className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm font-medium", tab === k ? "bg-ink text-white" : "text-ink-soft hover:bg-white")}>{l}</Link>)}</nav>
      {tab === "home" && <HomeTab />}
      {tab === "testimonials" && <TestimonialsTab />}
      {tab === "projects" && <ProjectsTab />}
      {tab === "faqs" && <FaqsTab />}
      {tab === "pages" && <PagesTab />}
      {tab === "seo" && <SeoTab />}
    </>
  );
}

async function HomeTab() {
  const [hero, promo, ann] = await Promise.all([
    getContent("home.hero", { eyebrow: "", title: "", subtitle: "", image: "", primaryLabel: "", secondaryLabel: "" }),
    getContent("home.promo", { title: "", body: "", image: "", ctaLabel: "", ctaHref: "", active: false }),
    getContent("site.announcement", { text: "", active: false }),
  ]);
  return (
    <div className="space-y-6">
      <Card><CardHeader title="Announcement bar" /><div className="p-5"><AnnouncementForm v={ann} /></div></Card>
      <Card><CardHeader title="Hero" /><div className="p-5"><HeroForm v={hero} /></div></Card>
      <Card><CardHeader title="Promotion banner" /><div className="p-5"><PromoForm v={promo} /></div></Card>
    </div>
  );
}
async function TestimonialsTab() {
  const list = await db.select().from(schema.testimonials).orderBy(asc(schema.testimonials.sort));
  return <Card><CardHeader title="Testimonials" description="Only publish testimonials from real customers, with their permission." /><div className="divide-y divide-sand-100">{list.map((t) => <div key={t.id} className="p-5"><TestimonialForm t={t} /></div>)}<div className="bg-sand-50 p-5"><TestimonialForm /></div></div></Card>;
}
async function ProjectsTab() {
  const [list, cats] = await Promise.all([db.select().from(schema.gardenProjects).orderBy(asc(schema.gardenProjects.sort)), db.select({ id: schema.serviceCategories.id, name: schema.serviceCategories.name }).from(schema.serviceCategories)]);
  return <Card><CardHeader title="Before & after projects" description="Use photos of the same site taken before and after the work." /><div className="divide-y divide-sand-100">{list.map((p) => <div key={p.id} className="p-5"><ProjectForm p={p} categories={cats} /></div>)}<div className="bg-sand-50 p-5"><ProjectForm categories={cats} /></div></div></Card>;
}
async function FaqsTab() {
  const list = await db.select().from(schema.faqs).orderBy(asc(schema.faqs.sort));
  return <Card><CardHeader title="FAQs" /><div className="divide-y divide-sand-100">{list.map((q) => <div key={q.id} className="p-5"><FaqForm q={q} /></div>)}<div className="bg-sand-50 p-5"><FaqForm /></div></div></Card>;
}
async function PagesTab() {
  const list = await db.select().from(schema.pages).orderBy(asc(schema.pages.slug));
  return <div className="space-y-6">{list.map((p) => <Card key={p.slug}><CardHeader title={p.title} action={<a href={`/pages/${p.slug}`} target="_blank" className="text-sm link">View</a>} /><div className="p-5"><PageForm p={p} /></div></Card>)}<Card><CardHeader title="New page" /><div className="p-5"><PageForm /></div></Card></div>;
}
async function SeoTab() {
  const seo = await getContent("seo.default", { title: "", description: "" });
  return <Card><CardHeader title="Default SEO" description="Service, product and page SEO fields override these." /><div className="p-5"><SeoForm v={seo} /></div></Card>;
}
