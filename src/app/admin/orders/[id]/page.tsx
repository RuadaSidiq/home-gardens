import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { Breadcrumbs, Card, CardHeader, DescriptionList, StatusBadge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDateTime, titleCase } from "@/lib/utils";
import { FulfilmentControls, OrderNote, ReturnControls } from "./forms";

export const metadata = { title: "Order" };

export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("orders.manage");
  const { id } = await params;
  const [row] = await db.select({ o: schema.orders, customer: schema.users }).from(schema.orders).innerJoin(schema.users, eq(schema.users.id, schema.orders.userId)).where(eq(schema.orders.id, id));
  if (!row) notFound();
  const { o } = row;
  const [items, events, returns, payments] = await Promise.all([
    db.select({ i: schema.orderItems, vendor: schema.vendors.name, wh: schema.warehouses.code }).from(schema.orderItems).innerJoin(schema.vendors, eq(schema.vendors.id, schema.orderItems.vendorId)).leftJoin(schema.warehouses, eq(schema.warehouses.id, schema.orderItems.warehouseId)).where(eq(schema.orderItems.orderId, o.id)),
    db.select({ e: schema.orderEvents, actor: schema.users.fullName }).from(schema.orderEvents).leftJoin(schema.users, eq(schema.users.id, schema.orderEvents.actorId)).where(eq(schema.orderEvents.orderId, o.id)).orderBy(desc(schema.orderEvents.createdAt)),
    db.select().from(schema.returnRequests).where(eq(schema.returnRequests.orderId, o.id)),
    db.select().from(schema.payments).where(eq(schema.payments.orderId, o.id)),
  ]);
  const a = o.shippingAddress;
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Orders", href: "/admin/orders" }, { label: o.reference }]} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold">Order {o.reference}</h1><p className="text-ink-muted">{formatDateTime(o.createdAt)} · {row.customer.fullName}</p></div>
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={o.status} /><StatusBadge status={o.fulfilmentStatus} /></div>
      </div>
      <FulfilmentControls orderId={o.id} status={o.status} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Items" description="Pick from the warehouse shown." />
          <table className="rtable w-full text-sm"><thead className="border-b border-sand-200 text-left text-xs uppercase text-ink-muted"><tr><th className="px-5 py-2">Item</th><th className="px-5 py-2">SKU</th><th className="px-5 py-2">Pick from</th><th className="px-5 py-2 text-right">Qty</th><th className="px-5 py-2 text-right">Total</th></tr></thead>
            <tbody className="md:divide-y md:divide-sand-100">{items.map(({ i, vendor, wh }) => <tr key={i.id}><td data-label="" className="rt-primary px-5 py-2.5">{i.name}{i.variantName ? ` · ${i.variantName}` : ""}<span className="block text-xs font-normal text-ink-muted">{vendor}</span></td><td data-label="SKU" className="px-5 py-2.5">{i.sku}</td><td data-label="Pick from" className="px-5 py-2.5">{wh ?? "—"}</td><td data-label="Qty" className="px-5 py-2.5 md:text-right">{i.quantity}{i.returnedQuantity ? ` (${i.returnedQuantity} returned)` : ""}</td><td data-label="Total" className="px-5 py-2.5 tabular-nums md:text-right">{formatMoney(i.lineTotal, o.currency)}</td></tr>)}</tbody>
          </table>
          <div className="border-t border-sand-200 px-5 py-2"><DescriptionList items={[["Subtotal", formatMoney(o.subtotal, o.currency)], ["Discount", formatMoney(o.discount, o.currency)], ["Delivery", formatMoney(o.shipping, o.currency)], ["Tax", formatMoney(o.tax, o.currency)], ["Total", formatMoney(o.total, o.currency)], ["Paid", formatMoney(o.amountPaid, o.currency)], ["Refunded", formatMoney(o.amountRefunded, o.currency)], ["Exchange rate (base→order)", o.exchangeRate]]} /></div>
        </Card>
        <div className="space-y-6">
          <Card><CardHeader title="Customer & delivery" action={<Link href={`/admin/customers/${row.customer.id}`} className="text-sm link">Profile</Link>} /><div className="space-y-1 p-5 text-sm"><p className="font-medium">{a.recipient}</p><p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p><p>{a.city} · {a.countryCode}{a.digitalAddress ? ` · ${a.digitalAddress}` : ""}</p><p className="text-ink-muted">{o.phone} · {o.email}</p><p className="pt-2 font-medium">{o.deliveryMethodName}</p>{o.trackingNumber && <p className="text-ink-muted">{o.carrier} {o.trackingNumber}</p>}{o.customerNote && <p className="rounded bg-sand-50 p-2">Customer note: {o.customerNote}</p>}</div></Card>
          <Card><CardHeader title="Payments" /><ul className="divide-y divide-sand-100 text-sm">{payments.map((p) => <li key={p.id} className="flex justify-between px-5 py-2.5"><span>{formatMoney(p.amount, p.currency)} <span className="text-xs text-ink-muted">{titleCase(p.provider)} · {p.reference}</span></span><StatusBadge status={p.status} /></li>)}{!payments.length && <li className="px-5 py-3 text-ink-muted">None</li>}</ul></Card>
          <Card><CardHeader title="Internal note" /><div className="p-5"><OrderNote orderId={o.id} value={o.internalNote ?? ""} /></div></Card>
        </div>
        {returns.length > 0 && (
          <Card className="xl:col-span-3"><CardHeader title="Returns" /><ul className="divide-y divide-sand-100 text-sm">{returns.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><span><span className="font-medium">{r.items.map((x) => `${x.quantity} × ${items.find((i) => i.i.id === x.orderItemId)?.i.name}`).join(", ")}</span><span className="block text-ink-muted">{r.reason} · {formatDateTime(r.createdAt)}</span></span><span className="flex items-center gap-2"><StatusBadge status={r.status} /><ReturnControls returnId={r.id} status={r.status} /></span></li>)}</ul></Card>
        )}
        <Card className="xl:col-span-3"><CardHeader title="History" /><ol className="space-y-2 p-5 text-sm">{events.map(({ e, actor }) => <li key={e.id}><strong>{titleCase(e.type)}</strong>{e.note ? ` – ${e.note}` : ""} <span className="text-xs text-ink-muted">{formatDateTime(e.createdAt)} · {actor ?? "System"}</span></li>)}</ol></Card>
      </div>
    </div>
  );
}
