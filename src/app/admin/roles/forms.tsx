"use client";
import { ActionForm, Input, SubmitButton } from "@/components/ui/form";
import { createRole, saveRolePermissions } from "../_actions/access";

export function RoleForm({ roleId, perms, granted, locked }: { roleId: number; perms: { key: string; description: string; group: string }[]; granted: string[]; locked: boolean }) {
  const groups = [...new Set(perms.map((p) => p.group))];
  return (
    <ActionForm action={saveRolePermissions} className="space-y-4">
      <input type="hidden" name="roleId" value={roleId} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <fieldset key={g}><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{g}</legend>
            {perms.filter((p) => p.group === g).map((p) => <label key={p.key} className="flex items-start gap-2 py-0.5 text-sm"><input type="checkbox" name="permissions[]" value={p.key} defaultChecked={granted.includes(p.key)} disabled={locked} className="mt-1 accent-forest-600" /><span>{p.description}</span></label>)}
          </fieldset>
        ))}
      </div>
      {!locked && <SubmitButton size="sm">Save permissions</SubmitButton>}
    </ActionForm>
  );
}

export function NewRole() {
  return (
    <ActionForm action={createRole} resetOnSuccess className="flex flex-wrap items-end gap-2">
      <Input label="New role name" name="name" required />
      <Input label="Description" name="description" wrapClassName="min-w-[16rem]" />
      <SubmitButton variant="outline">Create role</SubmitButton>
    </ActionForm>
  );
}
