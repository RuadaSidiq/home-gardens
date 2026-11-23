import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { providerStatus } from "@/server/payments/registry";
import { Card, CardHeader, PageHeader, Pagination, StatusBadge, Badge } from "@/components/ui/primitives";
import { DataTable, FilterBar, pageParams } from "@/components/admin/table";
import { formatMoney } from "@/lib/money";
import { formatDateTime, titleCase } from "@/lib/utils";
import { ManualConfirm, Recheck, Refund, SettleRefund } from "./forms";

export const metadata = { title: "Payments" };

export default async function Payments({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; provider?: string; purpose?: string; page?: string }> }) {
  const u = await requirePermission("payments.view");
  const canRefund = u.permissions.has("payments.refund");
  const sp = await searchParams;
  const { page, limit, offset } = pageParams(sp);
  const where: (SQL | undefined)[] = [sql`${schema.payments.status} <> 'initiated'`];
  if (sp.q) where.push(or(ilike(schema.payments.reference, `%${sp.q}%`), ilike(schema.payments.providerReference, `%${sp.q}%`), ilike(schema.users.fullName, `%${sp.q}%`)));
  if (sp.status) where.push(sql`${schema.payments.status} = ${sp.status}`);
  if (sp.provider) where.push(eq(schema.payments.provider, sp.provider));
  if (sp.purpose) where.push(sql`${schema.payments.purpose} = ${sp.purpose}`);
  const [rows, [count], pendingRefunds] = await Promise.all([
    db.select({ p: schema.payments, user: schema.users.fullName }).from(schema.payments).innerJoin(schema.users, eq(schema.users.id, schema.payments.userId)).where(and(...where)).orderBy(desc(schema.payments.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.payments).innerJoin(schema.users, eq(schema.users.id, schema.payments.userId)).where(and(...where)),
    db.select({ r: schema.refunds, ref: schema.payments.reference, provider: schema.payments.provider }).from(schema.refunds).innerJoin(schema.payments, eq(schema.payments.id, schema.refunds.paymentId)).where(eq(schema.refunds.status, "pending")).orderBy(desc(schema.refunds.createdAt)),
  ]);
  const providers = providerStatus();
  return (
    <>
      <PageHeader title="Payments" description="Payments are only marked successful after server-side verification with the provider, or staff confirmation of a manual transfer." />
      <Card className="mb-6">
        <CardHeader title="Payment providers" description="Configure credentials as environment variables (see .env.example). Unconfigured providers are hidden from customers." />
        <ul className="grid gap-px bg-sand-200 sm:grid-cols-5">{providers.map((p) => <li key={p.key} className="bg-white p-4 text-sm"><p className="font-semibold">{titleCase(p.key)}</p><p className="text-xs text-ink-muted">{p.currencies.join(", ")}</p><div className="mt-2">{p.configured ? <Badge tone="green">Configured</Badge> : <Badge tone="neutral">Not configured</Badge>}</div></li>)}</ul>
      </Card>
      {pendingRefunds.length > 0 && (
        <Card className="mb-6 border-amber-400/60"><CardHeader title="Refunds to complete manually" /><ul className="divide-y divide-sand-100 text-sm">{pendingRefunds.map(({ r, ref, provider }) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5"><span>{formatMoney(r.amount, r.currency)} · {ref} via {titleCase(provider)} <span className="text-ink-muted">· {r.reason}{r.failureReason ? ` · ${r.failureReason}` : ""}</span></span>{canRefund && <SettleRefund refundId={r.id} />}</li>)}</ul></Card>
      )}
      <FilterBar action="/admin/payments" values={sp} filters={[{ name: "q", label: "Search", placeholder: "Reference or customer" }, { name: "status", label: "Status", type: "select", options: schema.paymentStatus.enumValues.map((s) => ({ value: s, label: s })) }, { name: "provider", label: "Provider", type: "select", options: providers.map((p) => ({ value: p.key, label: titleCase(p.key) })) }, { name: "purpose", label: "For", type: "select", options: [{ value: "booking", label: "Bookings" }, { value: "order", label: "Orders" }, { value: "activity", label: "Activities" }] }]} />
      <DataTable rows={rows} rowKey={(r) => r.p.id} columns={[
        { header: "Reference", primary: true, cell: (r) => <span className="font-mono text-xs">{r.p.reference}<span className="block font-sans text-xs text-ink-muted">{r.p.providerReference}</span></span> },
        { header: "Date", cell: (r) => formatDateTime(r.p.createdAt) },
        { header: "Customer", cell: (r) => r.user },
        { header: "For", cell: (r) => `${titleCase(r.p.purpose)} · ${r.p.kind}` },
        { header: "Provider", cell: (r) => `${titleCase(r.p.provider)}${r.p.channel ? ` · ${r.p.channel}` : ""}` },
        { header: "Amount", align: "right", cell: (r) => <span className="tabular-nums">{formatMoney(r.p.amount, r.p.currency)}{r.p.amountRefunded ? <span className="block text-xs text-ink-muted">−{formatMoney(r.p.amountRefunded, r.p.currency)}</span> : null}{r.p.fee ? <span className="block text-xs text-ink-muted">fee {formatMoney(r.p.fee, r.p.currency)}</span> : null}</span> },
        { header: "Status", cell: (r) => <span><StatusBadge status={r.p.status} />{r.p.failureReason && <span className="block max-w-[12rem] text-xs text-clay-600">{r.p.failureReason}</span>}</span> },
        { header: "", cell: (r) => canRefund ? (r.p.provider === "manual" && r.p.status === "pending" ? <ManualConfirm paymentId={r.p.id} /> : ["succeeded", "partially_refunded"].includes(r.p.status) ? <Refund paymentId={r.p.id} max={r.p.amount - r.p.amountRefunded} currency={r.p.currency} /> : r.p.status === "pending" ? <Recheck reference={r.p.reference} /> : null) : null },
      ]} />
      <Pagination page={page} pageCount={Math.ceil((count?.n ?? 0) / limit)} params={sp} basePath="/admin/payments" />
    </>
  );
}
