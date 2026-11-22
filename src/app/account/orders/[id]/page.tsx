import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { providersFor } from "@/server/payments/registry";
import { Alert, Breadcrumbs, Card, CardHeader, DescriptionList, StatusBadge } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/form";
import { PaymentPanel } from "@/components/portal/payment-panel";
import { ReviewForm } from "@/components/portal/review-form";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, titleCase } from "@/lib/utils";
import { cancelMyOrder, reviewMyProduct } from "../../actions";
import { ReturnRequest } from "./order-actions";

export const metadata = { title: "Order" };

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const { payment } = await searchParams;
  const [o] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, id), eq(schema.orders.userId, u.id)));
  if (!o) notFound();
  const [items, events, returns, payments, reviews, settings] = await Promise.all([
    db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id)),
    db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, o.id)).orderBy(desc(schema.orderEvents.createdAt)),
    db.select().from(schema.returnRequests).where(eq(schema.returnRequests.orderId, o.id)).orderBy(desc(schema.returnRequests.createdAt)),
    db.select().from(schema.payments).where(eq(schema.payments.orderId, o.id)),
    db.select({ productId: schema.reviews.productId }).from(schema.reviews).where(eq(schema.reviews.authorId, u.id)),
    getSettings(),
  ]);
  const [country] = await db.select().from(schema.countries).where(eq(schema.countries.code, o.shippingAddress.countryCode ?? "GH"));
  const providers = providersFor(country?.paymentProviders ?? [], o.currency).map((p) => ({ key: p.key, label: p.label, description: p.description }));
  const pendingManual = payments.find((p) => p.provider === "manual" && p.status === "pending");
  const reviewed = new Set(reviews.map((r) => r.productId));
  const canReturn = o.status === "delivered" && o.deliveredAt && Date.now() - o.deliveredAt.getTime() < settings.commerce.returnWindowDays * 86400_000 && !returns.some((r) => ["requested", "approved"].includes(r.status));
  const a = o.shippingAddress;
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Orders", href: "/account/orders" }, { label: o.reference }]} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold">Order {o.reference}</h1><p className="mt-1 text-ink-muted">Placed {formatDateTime(o.createdAt)}</p></div>
        <div className="flex gap-2"><StatusBadge status={o.status} /><StatusBadge status={o.fulfilmentStatus} /></div>
      </div>
      {payment === "success" && <Alert tone="success">Payment confirmed – thank you! We're preparing your order.</Alert>}
      {payment === "failed" && <Alert tone="error">The payment did not go through. You can try again below.</Alert>}
      {payment === "pending" && <Alert tone="warning">Waiting for the payment provider to confirm.</Alert>}
      {payment === "error" && <Alert tone="error">We couldn't connect to the payment provider. Your items are reserved for 60 minutes – please try again.</Alert>}
      {pendingManual && <Alert tone="warning">Transfer {pendingManual.reference} is awaiting confirmation. <Link href={`/pay/manual/${pendingManual.reference}`} className="link">Payment details</Link></Alert>}
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {o.status === "pending_payment" && !pendingManual && (
            <Card><CardHeader title="Complete payment" description="Unpaid orders are cancelled after 60 minutes and items released." /><div className="p-5"><PaymentPanel purpose="order" subjectId={o.id} currency={o.currency} providers={providers} full={o.total - o.amountPaid} /></div></Card>
          )}
          <Card>
            <CardHeader title="Items" />
            <ul className="divide-y divide-sand-100">
              {items.map((i) => (
                <li key={i.id} className="flex gap-4 p-4">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-sand-100">{i.image && <Image src={i.image} alt="" fill sizes="64px" className="object-cover" />}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.name}</p>
                    <p className="text-sm text-ink-muted">{i.variantName ? `${i.variantName} · ` : ""}{i.quantity} × {formatMoney(i.unitPrice, o.currency)}{i.returnedQuantity ? ` · ${i.returnedQuantity} returned` : ""}</p>
                    {o.status === "delivered" && !reviewed.has(i.productId) && (
                      <details className="mt-2"><summary className="cursor-pointer text-sm link">Review this product</summary><div className="mt-3"><ReviewForm action={reviewMyProduct} hidden={{ orderId: o.id, productId: i.productId }} /></div></details>
                    )}
                  </div>
                  <p className="font-semibold tabular-nums">{formatMoney(i.lineTotal, o.currency)}</p>
                </li>
              ))}
            </ul>
          </Card>
          {returns.length > 0 && (
            <Card><CardHeader title="Returns" /><ul className="divide-y divide-sand-100">{returns.map((r) => <li key={r.id} className="flex items-center justify-between p-4 text-sm"><span>{formatDate(r.createdAt)} – {r.reason}{r.adminNote ? <span className="block text-ink-muted">Our note: {r.adminNote}</span> : null}</span><StatusBadge status={r.status} /></li>)}</ul></Card>
          )}
          <Card>
            <CardHeader title="Tracking" />
            <ol className="space-y-3 p-5">{events.map((e) => <li key={e.id} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-forest-500" /><span><strong>{titleCase(e.type)}</strong>{e.note ? ` – ${e.note}` : ""}<span className="block text-xs text-ink-muted">{formatDateTime(e.createdAt)}</span></span></li>)}</ol>
          </Card>
        </div>
        <div className="space-y-6">
          <Card><CardHeader title="Summary" /><div className="px-5 py-2"><DescriptionList items={[
            ["Subtotal", formatMoney(o.subtotal, o.currency)],
            ...(o.discount ? [["Discount", `−${formatMoney(o.discount, o.currency)}`] as [string, string]] : []),
            ["Delivery", o.shipping ? formatMoney(o.shipping, o.currency) : "Free"],
            ["Taxes", formatMoney(o.tax, o.currency)],
            ["Total", <strong key="t">{formatMoney(o.total, o.currency)}</strong>],
            ...(o.amountRefunded ? [["Refunded", formatMoney(o.amountRefunded, o.currency)] as [string, string]] : []),
          ]} /></div></Card>
          <Card><CardHeader title="Delivery" /><div className="space-y-1 p-5 text-sm">
            <p className="font-medium">{a.recipient}</p><p className="text-ink-soft">{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}{a.digitalAddress ? ` · ${a.digitalAddress}` : ""}</p><p className="text-ink-muted">{a.phone}</p>
            <p className="pt-2">{o.deliveryMethodName}</p>
            {o.trackingNumber && <p className="text-ink-muted">Tracking: {o.carrier} {o.trackingNumber}</p>}
          </div></Card>
          <div className="flex flex-wrap gap-2">
            {(o.status === "pending_payment" || o.status === "paid") && <ActionButton action={cancelMyOrder} fields={{ orderId: o.id }} variant="danger-outline" size="md" confirm="Cancel this order? Paid orders are refunded in full.">Cancel order</ActionButton>}
            {canReturn && <ReturnRequest orderId={o.id} items={items.filter((i) => i.quantity > i.returnedQuantity).map((i) => ({ id: i.id, name: i.name, max: i.quantity - i.returnedQuantity }))} />}
            {o.paymentState !== "unpaid" && <Link href={`/account/invoices/${o.reference}`} className="inline-flex h-8 items-center rounded-md border border-sand-300 px-3 text-[13px] font-semibold hover:bg-sand-50">Invoice</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}
