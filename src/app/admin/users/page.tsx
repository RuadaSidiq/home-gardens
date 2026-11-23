import Link from "next/link";
import { and, desc, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, Pagination, StatusBadge } from "@/components/ui/primitives";
import { DataTable, FilterBar, pageParams } from "@/components/admin/table";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Users" };

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }> }) {
  await requirePermission("users.manage");
  const sp = await searchParams;
  const { page, limit, offset } = pageParams(sp);
  const where: (SQL | undefined)[] = [];
  if (sp.q) where.push(or(ilike(schema.users.fullName, `%${sp.q}%`), ilike(schema.users.email, `%${sp.q}%`), ilike(schema.users.phone, `%${sp.q}%`)));
  if (sp.status) where.push(sql`${schema.users.status} = ${sp.status}`);
  if (sp.role) where.push(sql`exists (select 1 from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = ${schema.users.id} and r.key = ${sp.role})`);
  const [rows, [count], roles] = await Promise.all([
    db.select({ u: schema.users, roles: sql<string>`(select string_agg(r.name, ', ') from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = ${schema.users.id})` }).from(schema.users).where(and(...where)).orderBy(desc(schema.users.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.users).where(and(...where)),
    db.select().from(schema.roles),
  ]);
  return (
    <>
      <PageHeader title="Users" description={`${count?.n ?? 0} accounts`} />
      <FilterBar action="/admin/users" values={sp} filters={[{ name: "q", label: "Search", placeholder: "Name, email, phone" }, { name: "role", label: "Role", type: "select", options: roles.map((r) => ({ value: r.key, label: r.name })) }, { name: "status", label: "Status", type: "select", options: schema.userStatus.enumValues.map((s) => ({ value: s, label: s })) }]} />
      <DataTable rows={rows} rowKey={(r) => r.u.id} columns={[
        { header: "User", primary: true, cell: (r) => <Link href={`/admin/users/${r.u.id}`} className="font-medium hover:text-forest-700">{r.u.fullName}<span className="block text-xs font-normal text-ink-muted">{r.u.email}</span></Link> },
        { header: "Roles", cell: (r) => r.roles ?? "—" },
        { header: "Email verified", cell: (r) => (r.u.emailVerifiedAt ? "Yes" : "No") },
        { header: "Joined", cell: (r) => formatDate(r.u.createdAt) },
        { header: "Last sign-in", cell: (r) => formatDate(r.u.lastLoginAt) },
        { header: "Status", cell: (r) => <StatusBadge status={r.u.status} /> },
      ]} />
      <Pagination page={page} pageCount={Math.ceil((count?.n ?? 0) / limit)} params={sp} basePath="/admin/users" />
    </>
  );
}
