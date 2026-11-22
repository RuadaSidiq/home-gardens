import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate } from "@/lib/utils";

async function load(slug: string) {
  const [p] = await db.select().from(schema.pages).where(and(eq(schema.pages.slug, slug), eq(schema.pages.published, true)));
  return p;
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await load((await params).slug);
  return p ? { title: p.seoTitle ?? p.title, description: p.seoDescription ?? undefined } : {};
}
export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await load((await params).slug);
  if (!p) notFound();
  return (
    <article className="container max-w-3xl py-12 lg:py-16">
      <h1 className="h-page">{p.title}</h1>
      <p className="mt-2 text-sm text-ink-muted">Last updated {formatDate(p.updatedAt)}</p>
      <div className="prose-content mt-8" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.body) }} />
    </article>
  );
}
