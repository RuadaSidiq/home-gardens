import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Stars, StatusBadge } from "@/components/ui/primitives";
import { DataTable, FilterBar } from "@/components/admin/table";
import { formatDate } from "@/lib/utils";
import { ReviewControls } from "./forms";

export const metadata = { title: "Reviews" };

export default async function Reviews({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; rating?: string }> }) {
  await requirePermission("reviews.moderate");
  const sp = await searchParams;
  const gu = alias(schema.users, "gu");
  const where: (SQL | undefined)[] = [];
  if (sp.type) where.push(sql`${schema.reviews.subjectType} = ${sp.type}`);
  if (sp.status) where.push(sql`${schema.reviews.status} = ${sp.status}`);
  if (sp.rating) where.push(sql`${schema.reviews.rating} <= ${Number(sp.rating)}`);
  const rows = await db.select({ r: schema.reviews, author: schema.users.fullName, gardener: gu.fullName, product: schema.products.name })
    .from(schema.reviews).innerJoin(schema.users, eq(schema.users.id, schema.reviews.authorId))
    .leftJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.reviews.gardenerId)).leftJoin(gu, eq(gu.id, schema.gardenerProfiles.userId))
    .leftJoin(schema.products, eq(schema.products.id, schema.reviews.productId))
    .where(and(...where)).orderBy(desc(schema.reviews.createdAt)).limit(200);
  return (
    <>
      <PageHeader title="Reviews" description="Reviews can only be written after a completed booking or a delivered order. Hidden reviews don't count toward ratings." />
      <FilterBar action="/admin/reviews" values={sp} filters={[{ name: "type", label: "About", type: "select", options: [{ value: "gardener", label: "Gardeners" }, { value: "product", label: "Products" }] }, { name: "status", label: "Status", type: "select", options: [{ value: "published", label: "Published" }, { value: "hidden", label: "Hidden" }] }, { name: "rating", label: "Rating", type: "select", options: [{ value: "2", label: "2 stars or less" }, { value: "3", label: "3 stars or less" }] }]} />
      <DataTable rows={rows} rowKey={(r) => r.r.id} empty="No reviews yet" columns={[
        { header: "Review", primary: true, cell: (r) => <div className="max-w-md text-left"><Stars value={r.r.rating} count={undefined} showValue={false} />{r.r.title && <p className="mt-1 font-medium">{r.r.title}</p>}<p className="mt-0.5 text-sm font-normal text-ink-soft">{r.r.body}</p></div> },
        { header: "About", cell: (r) => r.gardener ?? r.product ?? "—" },
        { header: "By", cell: (r) => `${r.author} · ${formatDate(r.r.createdAt)}` },
        { header: "Status", cell: (r) => <StatusBadge status={r.r.status} /> },
        { header: "", cell: (r) => <ReviewControls reviewId={r.r.id} status={r.r.status} response={r.r.response} /> },
      ]} />
    </>
  );
}
