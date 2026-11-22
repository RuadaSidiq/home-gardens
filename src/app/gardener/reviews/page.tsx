import { desc, eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireGardener } from "@/server/auth/session";
import { Card, EmptyState, PageHeader, Stars } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Reviews" };

export default async function GardenerReviews() {
  const u = await requireGardener();
  const [[g], rows] = await Promise.all([
    db.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.id, u.gardenerId)),
    db.select({ r: schema.reviews, author: schema.users.fullName }).from(schema.reviews).innerJoin(schema.users, eq(schema.users.id, schema.reviews.authorId)).where(and(eq(schema.reviews.gardenerId, u.gardenerId), eq(schema.reviews.status, "published"))).orderBy(desc(schema.reviews.createdAt)),
  ]);
  return (
    <>
      <PageHeader title="Reviews" description={g!.ratingCount ? undefined : "Reviews appear after customers confirm completed jobs."} actions={<Stars value={Number(g!.ratingAvg)} count={g!.ratingCount} size={16} />} />
      {rows.length === 0 ? <EmptyState title="No reviews yet" /> : (
        <div className="space-y-3">{rows.map(({ r, author }) => (
          <Card key={r.id} className="p-4">
            <div className="flex justify-between"><Stars value={r.rating} count={undefined} showValue={false} /><span className="text-xs text-ink-muted">{formatDate(r.createdAt)}</span></div>
            {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
            <p className="mt-1 text-sm text-ink-soft">{r.body}</p>
            <p className="mt-2 text-xs text-ink-muted">— {author.split(" ")[0]}</p>
          </Card>
        ))}</div>
      )}
    </>
  );
}
