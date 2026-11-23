import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { Breadcrumbs, Card, CardHeader, DescriptionList, StatusBadge } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/form";
import { formatDate, formatDateTime } from "@/lib/utils";
import { setUserRole, setUserStatus } from "../../_actions/access";

export const metadata = { title: "User" };

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePermission("users.manage");
  const { id } = await params;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) notFound();
  const [roles, mine, logs, [g]] = await Promise.all([
    db.select().from(schema.roles),
    db.select({ roleId: schema.userRoles.roleId }).from(schema.userRoles).where(eq(schema.userRoles.userId, id)),
    db.select().from(schema.auditLogs).where(eq(schema.auditLogs.actorId, id)).orderBy(desc(schema.auditLogs.createdAt)).limit(10),
    db.select().from(schema.gardenerProfiles).where(eq(schema.gardenerProfiles.userId, id)),
  ]);
  const has = new Set(mine.map((m) => m.roleId));
  const self = me.id === u.id;
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Users", href: "/admin/users" }, { label: u.fullName }]} />
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{u.fullName}</h1><p className="text-ink-muted">{u.email} · {u.phone}</p></div><StatusBadge status={u.status} /></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Account" /><div className="px-5 py-2"><DescriptionList items={[["Joined", formatDate(u.createdAt)], ["Last sign-in", formatDateTime(u.lastLoginAt)], ["Email verified", u.emailVerifiedAt ? formatDate(u.emailVerifiedAt) : "No"], ["Two-step verification", u.mfaEnabled ? "On" : "Off"], ["Country / currency", `${u.countryCode ?? "—"} / ${u.preferredCurrency ?? "—"}`], ["Gardener profile", g ? <Link key="g" href={`/admin/gardeners/${g.id}`} className="link">{g.type} · {g.status}</Link> : "—"]]} /></div>
          {!self && <div className="flex flex-wrap gap-2 border-t border-sand-200 p-5">{u.status === "active" ? <ActionButton action={setUserStatus} fields={{ userId: u.id, status: "suspended" }} variant="danger-outline" confirm="Suspend and sign out this user?">Suspend</ActionButton> : <ActionButton action={setUserStatus} fields={{ userId: u.id, status: "active" }} variant="primary">Reactivate</ActionButton>}<Link href={`/admin/customers/${u.id}`} className="inline-flex h-8 items-center px-3 text-[13px] font-semibold link">Customer history</Link></div>}
        </Card>
        <Card>
          <CardHeader title="Roles" description={self ? "You can't change your own roles." : "Changes take effect on the user's next request."} />
          <ul className="divide-y divide-sand-100">{roles.map((r) => <li key={r.id} className="flex items-center justify-between px-5 py-2.5 text-sm"><span><span className="font-medium">{r.name}</span><span className="block text-xs text-ink-muted">{r.description}</span></span>{!self && (has.has(r.id) ? <ActionButton action={setUserRole} fields={{ userId: u.id, role: r.key, grant: "0" }} variant="ghost">Remove</ActionButton> : <ActionButton action={setUserRole} fields={{ userId: u.id, role: r.key, grant: "1" }} variant="secondary">Grant</ActionButton>)}{self && has.has(r.id) && <StatusBadge status="active" label="Assigned" />}</li>)}</ul>
        </Card>
        <Card className="lg:col-span-2"><CardHeader title="Recent activity by this user" action={<Link href={`/admin/audit-logs?actor=${u.id}`} className="text-sm link">Full log</Link>} /><ul className="divide-y divide-sand-100 text-sm">{logs.map((l) => <li key={l.id} className="px-5 py-2.5">{l.action} <span className="text-ink-muted">· {l.entityType} {l.entityId?.slice(0, 8)} · {formatDateTime(l.createdAt)}</span></li>)}{!logs.length && <li className="px-5 py-3 text-ink-muted">No recorded actions.</li>}</ul></Card>
      </div>
    </div>
  );
}
