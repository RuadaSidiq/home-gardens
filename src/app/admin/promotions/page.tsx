import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, StatusBadge } from "@/components/ui/primitives";
import { DataTable } from "@/components/admin/table";
import { formatMoney } from "@/lib/money";
import { formatDate, titleCase } from "@/lib/utils";
import { CouponModal } from "./forms";

export const metadata = { title: "Promotions" };

export default async function Promotions() {
  await requirePermission("promotions.manage");
  const rows = await db.select({ c: schema.coupons, discounted: sql<string>`(select string_agg(cur || ' ' || (total/100.0)::text, ', ') from (select currency as cur, sum(amount) as total from coupon_redemptions r where r.coupon_id = ${schema.coupons.id} group by currency) x)` }).from(schema.coupons).orderBy(desc(schema.coupons.createdAt));
  const now = new Date();
  return (
    <>
      <PageHeader title="Promotions" description="Coupon codes are validated at checkout and booking; redemptions are recorded when payment succeeds." actions={<CouponModal />} />
      <DataTable rows={rows} rowKey={(r) => r.c.id} columns={[
        { header: "Code", primary: true, cell: (r) => <span className="font-mono font-semibold">{r.c.code}<span className="block font-sans text-xs font-normal text-ink-muted">{r.c.description}</span></span> },
        { header: "Discount", cell: (r) => (r.c.type === "percent" ? `${r.c.value}%` : formatMoney(r.c.value, r.c.currency ?? "GHS")) },
        { header: "Applies to", cell: (r) => titleCase(r.c.scope) },
        { header: "Used", align: "right", cell: (r) => `${r.c.uses}${r.c.maxUses ? ` / ${r.c.maxUses}` : ""}` },
        { header: "Given away", cell: (r) => r.discounted ?? "—" },
        { header: "Valid", cell: (r) => `${r.c.startsAt ? formatDate(r.c.startsAt) : "Now"} – ${r.c.endsAt ? formatDate(r.c.endsAt) : "No end"}` },
        { header: "Status", cell: (r) => <StatusBadge status={!r.c.active ? "hidden" : r.c.endsAt && r.c.endsAt < now ? "expired" : "active"} label={!r.c.active ? "Inactive" : undefined} /> },
        { header: "", cell: (r) => <CouponModal c={r.c} /> },
      ]} />
    </>
  );
}
