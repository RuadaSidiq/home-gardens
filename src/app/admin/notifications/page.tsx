import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { channelStatus } from "@/server/notify/channels";
import { Badge, Card, CardHeader, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { DataTable } from "@/components/admin/table";
import { formatDateTime, cn } from "@/lib/utils";
import { TemplateForm } from "./forms";

export const metadata = { title: "Notifications" };

export default async function Notifications({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePermission("notifications.manage");
  const tab = (await searchParams).tab === "log" ? "log" : "templates";
  const ch = channelStatus();
  return (
    <>
      <PageHeader title="Notifications" description="Placeholders like {{name}}, {{reference}}, {{date}}, {{amount}} are filled in automatically." />
      <Card className="mb-6">
        <CardHeader title="Delivery channels" description="Configure providers with environment variables. Unconfigured channels are skipped and logged, never faked." />
        <ul className="grid gap-px bg-sand-200 sm:grid-cols-4">
          <li className="bg-white p-4 text-sm"><p className="font-semibold">In-app</p><Badge tone="green">Always on</Badge></li>
          {(["email", "sms", "whatsapp"] as const).map((k) => <li key={k} className="bg-white p-4 text-sm"><p className="font-semibold capitalize">{k}</p>{ch[k] ? <Badge tone="green">{ch[k]}</Badge> : <Badge>Not configured</Badge>}</li>)}
        </ul>
      </Card>
      <nav className="mb-4 flex gap-1">{[["templates", "Templates"], ["log", "Delivery log"]].map(([k, l]) => <Link key={k} href={`/admin/notifications?tab=${k}`} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === k ? "bg-ink text-white" : "text-ink-soft hover:bg-white")}>{l}</Link>)}</nav>
      {tab === "templates" ? <Templates /> : <Log />}
    </>
  );
}

async function Templates() {
  const list = await db.select().from(schema.notificationTemplates).orderBy(asc(schema.notificationTemplates.name));
  return <div className="grid gap-4 xl:grid-cols-2">{list.map((t) => <Card key={t.key}><CardHeader title={t.name} description={t.key} /><div className="p-5"><TemplateForm t={t} /></div></Card>)}</div>;
}
async function Log() {
  const rows = await db.select({ d: schema.notificationDeliveries, user: schema.users.fullName }).from(schema.notificationDeliveries).leftJoin(schema.users, eq(schema.users.id, schema.notificationDeliveries.userId)).orderBy(desc(schema.notificationDeliveries.createdAt)).limit(100);
  return <DataTable rows={rows} rowKey={(r) => r.d.id} empty="No external deliveries yet" columns={[
    { header: "When", cell: (r) => formatDateTime(r.d.createdAt) },
    { header: "Recipient", primary: true, cell: (r) => r.user ?? r.d.recipient ?? "—" },
    { header: "Channel", cell: (r) => `${r.d.channel}${r.d.provider ? ` · ${r.d.provider}` : ""}` },
    { header: "Status", cell: (r) => <StatusBadge status={r.d.status === "sent" ? "succeeded" : r.d.status === "failed" ? "failed" : "hidden"} label={r.d.status} /> },
    { header: "Detail", cell: (r) => <span className="text-xs text-ink-muted">{r.d.error}</span> },
  ]} />;
}
