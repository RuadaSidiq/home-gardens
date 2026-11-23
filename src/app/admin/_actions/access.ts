"use server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { run, f, type Prev } from "@/server/action";
import { getCurrentUser, assertPermission } from "@/server/auth/session";
import { UserError } from "@/server/errors";
import { audit } from "@/server/audit";
import { hashPassword } from "@/server/auth/password";
import { token } from "@/lib/ids";

export async function createStaff(_: Prev, fd: FormData) {
  return run(fd, z.object({ fullName: f.req("Name", 120), email: f.email(), phone: f.phone(), employeeId: f.req("Employee ID", 30), department: f.req("Department", 60), jobTitle: f.req("Job title", 80), role: f.req("Role", 40) }), async (i) => {
    const u = await getCurrentUser();
    assertPermission(u, "staff.manage");
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.key, i.role));
    if (!role || role.key === "customer" || role.key === "gardener") throw new UserError("Choose a staff role.", "role");
    if (role.key === "super_admin" && !u.roles.includes("super_admin")) throw new UserError("Only a super administrator can create super administrators.");
    const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${i.email}`);
    if (exists) throw new UserError("A user with this email already exists. Assign the role from Users instead.", "email");
    const [nu] = await db.insert(schema.users).values({ email: i.email, fullName: i.fullName, phone: i.phone, countryCode: "GH", passwordHash: await hashPassword(token(24)), emailVerifiedAt: new Date() }).returning();
    await db.insert(schema.userRoles).values({ userId: nu!.id, roleId: role.id, grantedBy: u.id });
    await db.insert(schema.staffProfiles).values({ userId: nu!.id, employeeId: i.employeeId, department: i.department, jobTitle: i.jobTitle });
    await audit({ actorId: u.id, action: "staff.create", entityType: "user", entityId: nu!.id, meta: { role: i.role } });
    return { ok: true, message: `${i.fullName} added. They should use "Forgot password" to set a password, then enable two-step verification.` };
  });
}

/** Grant or revoke a role. Users with users.manage cannot change their own roles, and only super admins can grant super admin. */
export async function setUserRole(_: Prev, fd: FormData) {
  return run(fd, z.object({ userId: f.uuid(), role: f.req("Role", 40), grant: z.enum(["1", "0"]) }), async (i) => {
    const u = await getCurrentUser();
    assertPermission(u, "users.manage");
    if (i.userId === u.id) throw new UserError("You can't change your own roles.");
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.key, i.role));
    if (!role) throw new UserError("Unknown role.");
    if (role.key === "super_admin" && !u.roles.includes("super_admin")) throw new UserError("Only a super administrator can change that role.");
    if (i.grant === "1") await db.insert(schema.userRoles).values({ userId: i.userId, roleId: role.id, grantedBy: u.id }).onConflictDoNothing();
    else {
      if (role.key === "super_admin") {
        const [n] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.userRoles).where(eq(schema.userRoles.roleId, role.id));
        if ((n?.n ?? 0) <= 1) throw new UserError("There must be at least one super administrator.");
      }
      await db.delete(schema.userRoles).where(and(eq(schema.userRoles.userId, i.userId), eq(schema.userRoles.roleId, role.id)));
    }
    await audit({ actorId: u.id, action: i.grant === "1" ? "role.grant" : "role.revoke", entityType: "user", entityId: i.userId, meta: { role: i.role } });
  });
}

export async function setUserStatus(_: Prev, fd: FormData) {
  return run(fd, z.object({ userId: f.uuid(), status: z.enum(["active", "suspended", "deactivated"]) }), async (i) => {
    const u = await getCurrentUser();
    if (!u?.permissions.has("users.manage") && !u?.permissions.has("customers.manage")) throw new UserError("You do not have permission to do that.");
    if (i.userId === u.id) throw new UserError("You can't change your own account status.");
    const target = await db.execute<{ staff: boolean }>(sql`select exists(select 1 from user_roles ur join role_permissions rp on rp.role_id = ur.role_id join permissions p on p.id = rp.permission_id where ur.user_id = ${i.userId} and p.key = 'dashboard.view') as staff`);
    if (target[0]?.staff && !u.permissions.has("users.manage")) throw new UserError("Only user administrators can suspend staff accounts.");
    await db.update(schema.users).set({ status: i.status, updatedAt: new Date() }).where(eq(schema.users.id, i.userId));
    if (i.status !== "active") await db.delete(schema.sessions).where(eq(schema.sessions.userId, i.userId)); // sign out immediately
    await audit({ actorId: u.id, action: `user.${i.status}`, entityType: "user", entityId: i.userId });
  });
}

export async function saveRolePermissions(_: Prev, fd: FormData) {
  return run(fd, z.object({ roleId: f.int(1), permissions: z.array(z.string()).optional() }), async (i) => {
    const u = await getCurrentUser();
    assertPermission(u, "roles.manage");
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, i.roleId));
    if (!role) throw new UserError("Role not found.");
    if (role.key === "super_admin") throw new UserError("The super administrator role always has every permission.");
    const perms = await db.select().from(schema.permissions);
    const chosen = perms.filter((p) => (i.permissions ?? []).includes(p.key));
    await db.transaction(async (tx) => {
      await tx.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, role.id));
      if (chosen.length) await tx.insert(schema.rolePermissions).values(chosen.map((p) => ({ roleId: role.id, permissionId: p.id })));
    });
    await audit({ actorId: u.id, action: "role.permissions", entityType: "role", entityId: String(role.id), meta: { permissions: chosen.map((c) => c.key) } });
    return { ok: true, message: `${role.name} updated.` };
  });
}

export async function createRole(_: Prev, fd: FormData) {
  return run(fd, z.object({ name: f.req("Name", 60), description: f.text(200).optional() }), async (i) => {
    const u = await getCurrentUser();
    assertPermission(u, "roles.manage");
    const key = i.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const [exists] = await db.select().from(schema.roles).where(eq(schema.roles.key, key));
    if (exists) throw new UserError("A role with that name exists.", "name");
    const [r] = await db.insert(schema.roles).values({ key, name: i.name, description: i.description || null }).returning();
    const [dash] = await db.select().from(schema.permissions).where(eq(schema.permissions.key, "dashboard.view"));
    await db.insert(schema.rolePermissions).values({ roleId: r!.id, permissionId: dash!.id });
    await audit({ actorId: u.id, action: "role.create", entityType: "role", entityId: String(r!.id) });
    return { ok: true, message: "Role created." };
  });
}
