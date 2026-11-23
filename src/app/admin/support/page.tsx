import Link from "next/link";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, StatusBadge, Badge } from "@/components/ui/primitives";
import { DataTable, FilterBar } from "@/components/admin/table";
import { ActionButton } from "@/components/ui/form";
import { formatDateTime, titleCase, cn } from "@/lib/utils";
import { markEnquiry } from "../_actions/system";

export const metadata = { title: "Support" };

export default async function Support({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; category?: string }> }) {
  await requirePermission("support.manage");
  const sp = await searchParams;
  const tab = sp.tab === "enquiries" ? "enquiries" : "tickets";
  return (
    <>
      <PageHeader title="Support" />
      <nav className="mb-4 flex gap-1">{[["tickets", "Tickets & disputes"], ["enquiries", "Website enquiries"]].map(([k, l]) => <Link key={k} href={`/admin/support?tab=${k}`} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === k ? "bg-ink text-white" : "text-ink-soft hover:bg-white")}>{l}</Link>)}</nav>
      {tab === "tickets" ? <Tickets sp={sp} /> : <Enquiries />}
    </>
  );
}

async function Tickets({ sp }: { sp: { status?: string; category?: string } }) {
  const where: (SQL | undefined)[] = [];
  if (sp.status) where.push(sql`${schema.supportTickets.status} = ${sp.status}`);
  else where.push(sql`${schema.supportTickets.status} in ('open','pending')`);
  if (sp.category) where.push(sql`${schema.supportTickets.category} = ${sp.category}`);
  const rows = await db.select({ t: schema.supportTickets, user: schema.users.fullName, assignee: sql<string | null>`(select full_name from users where id = ${schema.supportTickets.assignedTo})` }).from(schema.supportTickets).innerJoin(schema.users, eq(schema.users.id, schema.supportTickets.userId)).where(and(...where))
    .orderBy(sql`case ${schema.supportTickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`, desc(schema.supportTickets.updatedAt));
  return (
    <>
      <FilterBar action="/admin/support" values={sp} filters={[{ name: "status", label: "Status (default: open & pending)", type: "select", options: schema.ticketStatus.enumValues.map((s) => ({ value: s, label: s })) }, { name: "category", label: "Category", type: "select", options: schema.ticketCategory.enumValues.map((s) => ({ value: s, label: s })) }]} />
      <DataTable rows={rows} rowKey={(r) => r.t.id} empty="No tickets" columns={[
        { header: "Ticket", primary: true, cell: (r) => <Link href={`/admin/support/${r.t.id}`} className="font-medium hover:text-forest-700">{r.t.subject}<span className="block text-xs font-normal text-ink-muted">{r.t.reference}</span></Link> },
        { header: "From", cell: (r) => r.user },
        { header: "Category", cell: (r) => titleCase(r.t.category) },
        { header: "Priority", cell: (r) => <Badge tone={r.t.priority === "urgent" || r.t.priority === "high" ? "red" : "neutral"}>{r.t.priority}</Badge> },
        { header: "Assigned", cell: (r) => r.assignee ?? "—" },
        { header: "Updated", cell: (r) => formatDateTime(r.t.updatedAt) },
        { header: "Status", cell: (r) => <StatusBadge status={r.t.status} label={r.t.status === "pending" ? "Awaiting customer" : undefined} /> },
      ]} />
    </>
  );
}

async function Enquiries() {
  const rows = await db.select().from(schema.contactEnquiries).orderBy(desc(schema.contactEnquiries.createdAt)).limit(100);
  return <DataTable rows={rows} rowKey={(r) => r.id} empty="No enquiries" columns={[
    { header: "From", primary: true, cell: (r) => <span>{r.name}<span className="block text-xs font-normal text-ink-muted"><a href={`mailto:${r.email}`} className="link">{r.email}</a>{r.phone ? ` · ${r.phone}` : ""}</span></span> },
    { header: "Topic", cell: (r) => r.topic },
    { header: "Message", cell: (r) => <p className="max-w-md whitespace-pre-wrap text-left text-sm">{r.message}</p> },
    { header: "Received", cell: (r) => formatDateTime(r.createdAt) },
    { header: "Status", cell: (r) => r.status === "new" ? <ActionButton action={markEnquiry} fields={{ id: r.id }} variant="secondary">Mark handled</ActionButton> : <StatusBadge status="handled" /> },
  ]} />;
}
