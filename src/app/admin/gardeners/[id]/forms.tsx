"use client";
import { ActionForm, ActionButton, Checkbox, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { decideGardener, reactivateGardener, reviewDocument, updateCompanyGardener } from "../../_actions/gardeners";

export function DecisionForm({ gardenerId, status }: { gardenerId: string; status: string }) {
  if (status === "suspended" || status === "rejected") return <ActionButton action={reactivateGardener} fields={{ gardenerId }} variant="primary" size="md" confirm="Reactivate and make this gardener available for jobs?">Reactivate</ActionButton>;
  const options = status === "approved"
    ? [{ value: "suspended", label: "Suspend" }]
    : [{ value: "approved", label: "Approve" }, { value: "info_requested", label: "Request more information" }, { value: "rejected", label: "Reject" }];
  return (
    <ActionForm action={decideGardener} className="space-y-3">
      <input type="hidden" name="gardenerId" value={gardenerId} />
      <Select label="Decision" name="decision" options={options} />
      <Textarea label="Note to the gardener" name="note" rows={3} hint="Required for anything except approval." />
      <SubmitButton>Save decision</SubmitButton>
    </ActionForm>
  );
}

export function DocActions({ documentId }: { documentId: string }) {
  return (
    <div className="flex gap-1">
      <ActionButton action={reviewDocument} fields={{ documentId, status: "verified" }} variant="secondary">Verify</ActionButton>
      <ActionButton action={reviewDocument} fields={{ documentId, status: "rejected" }} variant="ghost">Reject</ActionButton>
    </div>
  );
}

export function CompanyForm({ g }: { g: { id: string; employeeId: string | null; compensationNote: string | null; isPublic: boolean; maxJobsPerDay: number } }) {
  return (
    <ActionForm action={updateCompanyGardener} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="gardenerId" value={g.id} />
      <Input label="Employee ID" name="employeeId" defaultValue={g.employeeId ?? ""} />
      <Input label="Max jobs per day" name="maxJobsPerDay" type="number" min={1} max={10} defaultValue={g.maxJobsPerDay} />
      <Textarea label="Compensation notes (staff only)" name="compensationNote" defaultValue={g.compensationNote ?? ""} rows={2} wrapClassName="sm:col-span-2" />
      <Checkbox name="isPublic" defaultChecked={g.isPublic} label="Show public profile" className="sm:col-span-2" />
      <div className="sm:col-span-2"><SubmitButton variant="outline">Save</SubmitButton></div>
    </ActionForm>
  );
}
