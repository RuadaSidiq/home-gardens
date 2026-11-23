"use client";
import { ActionForm, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { updateTicket } from "../../_actions/system";

export function TicketForm({ t, staff }: { t: { id: string; status: string; priority: string; assignedTo: string | null; resolution: string | null }; staff: { id: string; name: string }[] }) {
  return (
    <ActionForm action={updateTicket} className="space-y-3">
      <input type="hidden" name="ticketId" value={t.id} />
      <Select label="Status" name="status" defaultValue={t.status} options={["open", "pending", "resolved", "closed"].map((s) => ({ value: s, label: s }))} />
      <Select label="Priority" name="priority" defaultValue={t.priority} options={["low", "normal", "high", "urgent"].map((s) => ({ value: s, label: s }))} />
      <Select label="Assigned to" name="assignedTo" defaultValue={t.assignedTo ?? ""} placeholder="Unassigned" options={staff.map((s) => ({ value: s.id, label: s.name }))} />
      <Textarea label="Resolution (shown to customer)" name="resolution" rows={2} defaultValue={t.resolution ?? ""} />
      <SubmitButton size="sm">Update ticket</SubmitButton>
    </ActionForm>
  );
}
