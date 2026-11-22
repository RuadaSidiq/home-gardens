import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "My orders" };

export default async function MyOrders() {
  const u = await requireUser();
  const rows = await db.select({ o: schema.orders, items: sql<number>`(select coalesce(sum(quantity),0) from order_items where order_id = ${schema.orders.id})`.mapWith(Number) }).from(schema.orders).where(eq(schema.orders.userId, u.id)).orderBy(desc(schema.orders.createdAt));
  return (
    <>
      <PageHeader title="Orders" />
      {rows.length === 0 ? <EmptyState title="No orders yet" action={<ButtonLink href="/shop" size="sm">Visit the shop</ButtonLink>} /> : (
        <table className="rtable w-full text-sm">
          <thead className="border-b border-sand-200 text-left text-xs uppercase tracking-wide text-ink-muted"><tr><th className="py-2 pr-4">Order</th><th className="py-2 pr-4">Placed</th><th className="py-2 pr-4">Items</th><th className="py-2 pr-4">Total</th><th className="py-2">Status</th></tr></thead>
          <tbody className="md:divide-y md:divide-sand-100">
            {rows.map(({ o, items }) => (
              <tr key={o.id} className="md:hover:bg-sand-50">
                <td data-label="" className="rt-primary py-3 pr-4"><Link href={`/account/orders/${o.id}`} className="font-medium hover:text-forest-700">{o.reference}</Link></td>
                <td data-label="Placed" className="py-3 pr-4">{formatDate(o.createdAt)}</td>
                <td data-label="Items" className="py-3 pr-4">{items}</td>
                <td data-label="Total" className="py-3 pr-4 tabular-nums">{formatMoney(o.total, o.currency)}</td>
                <td data-label="Status" className="py-3"><StatusBadge status={o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
