import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { PageHeader, StatusBadge, Badge } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, FilterBar } from "@/components/admin/table";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Gardeners" };

export default async function AdminGardeners({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; type?: string }> }) {
  const u = await requirePermission("gardeners.view");
  const sp = await searchParams;
  const where: (SQL | undefined)[] = [];
  if (sp.status) where.push(sql`${schema.gardenerProfiles.status} = ${sp.status}`);
  if (sp.type) where.push(sql`${schema.gardenerProfiles.type} = ${sp.type}`);
  if (sp.q) where.push(or(ilike(schema.users.fullName, `%${sp.q}%`), ilike(schema.users.email, `%${sp.q}%`), ilike(schema.gardenerProfiles.employeeId, `%${sp.q}%`)));
  const rows = await db
    .select({
      g: schema.gardenerProfiles, name: schema.users.fullName, email: schema.users.email, city: schema.cities.name,
      upcoming: sql<number>`(select count(*) from bookings b where b.gardener_id = ${schema.gardenerProfiles.id} and b.status in ('assigned','accepted'))`.mapWith(Number),
    })
    .from(schema.gardenerProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.gardenerProfiles.userId))
    .leftJoin(schema.cities, eq(schema.cities.id, schema.gardenerProfiles.baseCityId))
    .where(and(...where))
    .orderBy(sql`case when ${schema.gardenerProfiles.status} = 'pending' then 0 when ${schema.gardenerProfiles.status} = 'info_requested' then 1 else 2 end`, desc(schema.gardenerProfiles.submittedAt));
  return (
    <>
      <PageHeader title="Gardeners" description="Applications, company gardeners and independent professionals." actions={u.permissions.has("staff.manage") && <ButtonLink href="/admin/gardeners/new" size="sm">Add company gardener</ButtonLink>} />
      <FilterBar action="/admin/gardeners" values={sp} filters={[
        { name: "q", label: "Search", placeholder: "Name, email, employee ID" },
        { name: "status", label: "Status", type: "select", options: schema.gardenerStatus.enumValues.map((s) => ({ value: s, label: s.replace("_", " ") })) },
        { name: "type", label: "Type", type: "select", options: [{ value: "company", label: "Company" }, { value: "independent", label: "Independent" }] },
      ]} />
      <DataTable rows={rows} rowKey={(r) => r.g.id} empty="No gardeners match" columns={[
        { header: "Gardener", primary: true, cell: (r) => <Link href={`/admin/gardeners/${r.g.id}`} className="font-medium hover:text-forest-700">{r.name}<span className="block text-xs font-normal text-ink-muted">{r.email}</span></Link> },
        { header: "Type", cell: (r) => <Badge tone={r.g.type === "company" ? "dark" : "neutral"}>{r.g.type === "company" ? `Company${r.g.employeeId ? ` · ${r.g.employeeId}` : ""}` : "Independent"}</Badge> },
        { header: "Base", cell: (r) => r.city ?? "—" },
        { header: "Rating", cell: (r) => r.g.ratingCount ? `${Number(r.g.ratingAvg).toFixed(1)} (${r.g.ratingCount})` : "—" },
        { header: "Jobs done", align: "right", cell: (r) => r.g.jobsCompleted },
        { header: "Upcoming", align: "right", cell: (r) => r.upcoming },
        { header: "Submitted", cell: (r) => formatDate(r.g.submittedAt ?? r.g.createdAt) },
        { header: "Status", cell: (r) => <StatusBadge status={r.g.status} /> },
      ]} />
    </>
  );
}
