import Link from "next/link";
import { asc, eq, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, StatusBadge, Card, CardHeader } from "@/components/ui/primitives";
import { DataTable } from "@/components/admin/table";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { NewStaff } from "./forms";

export const metadata = { title: "Staff" };

export default async function Staff() {
  await requirePermission("staff.manage");
  const [staff, roles, company] = await Promise.all([
    db.select({ s: schema.staffProfiles, u: schema.users, roles: sql<string>`(select string_agg(r.name, ', ') from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = ${schema.users.id})` })
      .from(schema.staffProfiles).innerJoin(schema.users, eq(schema.users.id, schema.staffProfiles.userId)).orderBy(asc(schema.staffProfiles.employeeId)),
    db.select().from(schema.roles).where(notInArray(schema.roles.key, ["customer", "gardener"])),
    db.select({ g: schema.gardenerProfiles, name: schema.users.fullName, status: schema.users.status }).from(schema.gardenerProfiles).innerJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId)).where(eq(schema.gardenerProfiles.type, "company")).orderBy(asc(schema.gardenerProfiles.employeeId)),
  ]);
  return (
    <>
      <PageHeader title="Staff" description="Office staff and company gardeners." actions={<NewStaff roles={roles} />} />
      <DataTable rows={staff} rowKey={(r) => r.u.id} empty="No staff yet" columns={[
        { header: "Name", primary: true, cell: (r) => <Link href={`/admin/users/${r.u.id}`} className="font-medium hover:text-forest-700">{r.u.fullName}<span className="block text-xs font-normal text-ink-muted">{r.u.email}</span></Link> },
        { header: "Employee ID", cell: (r) => r.s.employeeId },
        { header: "Department", cell: (r) => `${r.s.department} · ${r.s.jobTitle}` },
        { header: "Roles", cell: (r) => r.roles },
        { header: "2-step", cell: (r) => r.u.mfaEnabled ? "On" : <span className="text-amber-600">Off</span> },
        { header: "Last sign-in", cell: (r) => formatDate(r.u.lastLoginAt) },
        { header: "Status", cell: (r) => <StatusBadge status={r.u.status} /> },
      ]} />
      <Card className="mt-8">
        <CardHeader title="Company gardeners" action={<ButtonLink href="/admin/gardeners/new" size="sm" variant="outline">Add company gardener</ButtonLink>} />
        <ul className="divide-y divide-sand-100 text-sm">{company.map((c) => <li key={c.g.id}><Link href={`/admin/gardeners/${c.g.id}`} className="flex justify-between px-5 py-3 hover:bg-sand-50"><span>{c.name} <span className="text-ink-muted">· {c.g.employeeId} · {c.g.jobsCompleted} jobs</span></span><StatusBadge status={c.g.status} /></Link></li>)}</ul>
      </Card>
    </>
  );
}
