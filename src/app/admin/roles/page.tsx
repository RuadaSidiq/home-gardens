import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/server/auth/session";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { NewRole, RoleForm } from "./forms";

export const metadata = { title: "Roles & permissions" };

export default async function Roles() {
  await requirePermission("roles.manage");
  const [roles, perms, rp] = await Promise.all([
    db.select().from(schema.roles).orderBy(asc(schema.roles.id)),
    db.select().from(schema.permissions).orderBy(asc(schema.permissions.group), asc(schema.permissions.key)),
    db.select({ roleId: schema.rolePermissions.roleId, key: schema.permissions.key }).from(schema.rolePermissions).innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId)),
  ]);
  return (
    <>
      <PageHeader title="Roles & permissions" description="Permissions are enforced on the server for every page and action." />
      <Card className="mb-6 p-5"><NewRole /></Card>
      <div className="space-y-6">
        {roles.filter((r) => r.key !== "customer" && r.key !== "gardener").map((r) => (
          <Card key={r.id}><CardHeader title={r.name} description={r.description ?? undefined} /><div className="p-5"><RoleForm roleId={r.id} perms={perms} granted={rp.filter((x) => x.roleId === r.id).map((x) => x.key)} locked={r.key === "super_admin"} /></div></Card>
        ))}
      </div>
    </>
  );
}
