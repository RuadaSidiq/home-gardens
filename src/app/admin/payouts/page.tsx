import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, StatusBadge } from "@/components/ui/primitives";
import { DataTable, FilterBar } from "@/components/admin/table";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { PayoutControls } from "./forms";

export const metadata = { title: "Payouts" };

export default async function Payouts({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("payouts.manage");
  const sp = await searchParams;
  const where: (SQL | undefined)[] = [];
  if (sp.status) where.push(sql`${schema.payouts.status} = ${sp.status}`);
  const rows = await db.select({ p: schema.payouts, name: schema.users.fullName, gid: schema.gardenerProfiles.id, by: sql<string | null>`(select full_name from users where id = ${schema.payouts.processedBy})` })
    .from(schema.payouts).innerJoin(schema.gardenerProfiles, eq(schema.gardenerProfiles.id, schema.payouts.gardenerId)).innerJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId))
    .where(and(...where)).orderBy(sql`case when ${schema.payouts.status} in ('requested','approved') then 0 else 1 end`, desc(schema.payouts.createdAt));
  return (
    <>
      <PageHeader title="Payouts" description="Requested amounts are reserved from the gardener's available balance until paid or rejected." />
      <FilterBar action="/admin/payouts" values={sp} filters={[{ name: "status", label: "Status", type: "select", options: schema.payoutStatus.enumValues.map((s) => ({ value: s, label: s })) }]} />
      <DataTable rows={rows} rowKey={(r) => r.p.id} empty="No payout requests" columns={[
        { header: "Reference", primary: true, cell: (r) => r.p.reference },
        { header: "Gardener", cell: (r) => <Link href={`/admin/gardeners/${r.gid}`} className="hover:text-forest-700">{r.name}</Link> },
        { header: "Requested", cell: (r) => formatDateTime(r.p.createdAt) },
        { header: "Amount", align: "right", cell: (r) => <span className="font-semibold tabular-nums">{formatMoney(r.p.amount, r.p.currency)}</span> },
        { header: "To", cell: (r) => r.p.methodSummary },
        { header: "Status", cell: (r) => <span><StatusBadge status={r.p.status} />{r.p.providerReference && <span className="block text-xs text-ink-muted">Ref {r.p.providerReference}{r.by ? ` · ${r.by}` : ""}</span>}</span> },
        { header: "", cell: (r) => ["requested", "approved"].includes(r.p.status) ? <PayoutControls payoutId={r.p.id} status={r.p.status} /> : null },
      ]} />
    </>
  );
}
