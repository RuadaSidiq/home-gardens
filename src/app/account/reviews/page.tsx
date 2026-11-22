import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { Card, EmptyState, PageHeader, Stars, StatusBadge } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "My reviews" };

export default async function MyReviews() {
  const u = await requireUser();
  const rows = await db
    .select({ r: schema.reviews, gardener: schema.gardenerProfiles.slug, product: schema.products.name, productSlug: schema.products.slug })
    .from(schema.reviews)
    .leftJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.reviews.gardenerId))
    .leftJoin(schema.products, eq(schema.products.id, schema.reviews.productId))
    .where(eq(schema.reviews.authorId, u.id))
    .orderBy(desc(schema.reviews.createdAt));
  return (
    <>
      <PageHeader title="Reviews" description="Leave reviews from completed bookings and delivered orders." />
      {rows.length === 0 ? <EmptyState title="You haven't written any reviews" /> : (
        <div className="space-y-3">{rows.map(({ r, gardener, product, productSlug }) => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={gardener ? `/gardeners/${gardener}` : `/shop/${productSlug}`} className="font-semibold hover:text-forest-700">{gardener ? "Gardener review" : product}</Link>
              <span className="flex items-center gap-2"><Stars value={r.rating} count={undefined} showValue={false} />{r.status !== "published" && <StatusBadge status={r.status} />}</span>
            </div>
            {r.title && <p className="mt-2 font-medium">{r.title}</p>}
            <p className="mt-1 text-sm text-ink-soft">{r.body}</p>
            <p className="mt-2 text-xs text-ink-muted">{formatDate(r.createdAt)}</p>
            {r.response && <p className="mt-2 rounded bg-sand-50 p-2 text-sm"><strong>Response:</strong> {r.response}</p>}
          </Card>
        ))}</div>
      )}
    </>
  );
}
