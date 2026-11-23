"use client";
import { ActionForm, Input, Modal, Select, SubmitButton } from "@/components/ui/form";
import { createStaff } from "../_actions/access";
export function NewStaff({ roles }: { roles: { key: string; name: string }[] }) {
  return (
    <Modal trigger="Add staff member" title="Add staff member" triggerVariant="primary" wide>
      {(close) => (
        <ActionForm action={createStaff} onSuccess={() => setTimeout(close, 1500)} className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" name="fullName" required />
          <Input label="Email" name="email" type="email" required />
          <Input label="Phone" name="phone" type="tel" required />
          <Input label="Employee ID" name="employeeId" required />
          <Input label="Department" name="department" required />
          <Input label="Job title" name="jobTitle" required />
          <Select label="Role" name="role" options={roles.map((r) => ({ value: r.key, label: r.name }))} wrapClassName="sm:col-span-2" />
          <div className="sm:col-span-2"><SubmitButton>Add staff member</SubmitButton></div>
        </ActionForm>
      )}
    </Modal>
  );
}
