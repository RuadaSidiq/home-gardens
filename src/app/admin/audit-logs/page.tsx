import { and, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Pagination } from "@/components/ui/primitives";
import { DataTable, FilterBar, pageParams } from "@/components/admin/table";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Audit log" };

export default async function AuditLogs({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string; actor?: string; page?: string }> }) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const { page, limit, offset } = pageParams(sp, 50);
  const where: (SQL | undefined)[] = [];
  if (sp.action) where.push(ilike(schema.auditLogs.action, `%${sp.action}%`));
  if (sp.entity) where.push(eq(schema.auditLogs.entityType, sp.entity));
  if (sp.actor && /^[0-9a-f-]{36}$/.test(sp.actor)) where.push(eq(schema.auditLogs.actorId, sp.actor));
  const [rows, [count]] = await Promise.all([
    db.select({ l: schema.auditLogs, actor: schema.users.fullName }).from(schema.auditLogs).leftJoin(schema.users, eq(schema.users.id, schema.auditLogs.actorId)).where(and(...where)).orderBy(desc(schema.auditLogs.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.auditLogs).where(and(...where)),
  ]);
  return (
    <>
      <PageHeader title="Audit log" description="Security-relevant and administrative actions. Entries cannot be edited." />
      <FilterBar action="/admin/audit-logs" values={sp} filters={[{ name: "action", label: "Action contains" }, { name: "entity", label: "Entity", type: "select", options: ["user", "booking", "gardener", "order", "payment", "payout", "product", "service", "role", "file", "conversation", "settings", "coupon", "inventory"].map((v) => ({ value: v, label: v })) }]} />
      <DataTable rows={rows} rowKey={(r) => r.l.id} columns={[
        { header: "When", cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.l.createdAt)}</span> },
        { header: "Actor", primary: true, cell: (r) => r.actor ?? "System" },
        { header: "Action", cell: (r) => <code className="text-xs">{r.l.action}</code> },
        { header: "Entity", cell: (r) => `${r.l.entityType} ${r.l.entityId?.slice(0, 8) ?? ""}` },
        { header: "Details", cell: (r) => <span className="line-clamp-2 max-w-sm break-all text-xs text-ink-muted">{Object.keys(r.l.meta).length ? JSON.stringify(r.l.meta) : ""}</span> },
        { header: "IP", cell: (r) => <span className="text-xs">{r.l.ip ?? ""}</span> },
      ]} />
      <Pagination page={page} pageCount={Math.ceil((count?.n ?? 0) / limit)} params={sp} basePath="/admin/audit-logs" />
    </>
  );
}
