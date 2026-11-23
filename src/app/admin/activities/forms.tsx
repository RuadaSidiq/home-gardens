"use client";
import { ActionForm, ActionButton, Checkbox, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { addSessions, markAttendance, saveActivity, staffCancelRegistration, updateSession } from "../_actions/catalog";

type A = { id: string; title: string; type: string; summary: string; description: string; organizer: string; venue: string; address: string; cityId: number | null; price: number; currency: string; defaultCapacity: number; maxPerBooking: number; bookingDeadlineHours: number; requirements: string | null; recurrence: string; requiresPayment: boolean; featured: boolean; active: boolean; images: string[] };
const TYPES = ["workshop", "tour", "exhibition", "lesson", "community", "class", "school", "family", "corporate"];

export function ActivityForm({ a, cities }: { a?: A; cities: { id: number; name: string }[] }) {
  return (
    <ActionForm action={saveActivity} className="grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
      {a && <input type="hidden" name="id" value={a.id} />}
      <Input label="Title" name="title" required defaultValue={a?.title} />
      <Select label="Type" name="type" defaultValue={a?.type ?? "workshop"} options={TYPES.map((t) => ({ value: t, label: t }))} />
      <Input label="Summary" name="summary" required defaultValue={a?.summary} wrapClassName="sm:col-span-2" />
      <Textarea label="Description" name="description" required rows={5} defaultValue={a?.description} wrapClassName="sm:col-span-2" />
      <Input label="Organiser" name="organizer" required defaultValue={a?.organizer ?? "Home Gardens"} />
      <Input label="Venue" name="venue" required defaultValue={a?.venue} />
      <Input label="Address" name="address" required defaultValue={a?.address} />
      <Select label="City" name="cityId" defaultValue={a?.cityId ?? ""} options={cities.map((c) => ({ value: c.id, label: c.name }))} />
      <Input label="Ticket price (0 = free)" name="price" type="number" step="0.01" min={0} defaultValue={a ? a.price / 100 : 0} />
      <Select label="Currency" name="currency" defaultValue={a?.currency ?? "GHS"} options={["GHS", "USD", "GBP", "EUR", "NGN"].map((c) => ({ value: c, label: c }))} />
      <Input label="Default seats per session" name="defaultCapacity" type="number" min={1} defaultValue={a?.defaultCapacity ?? 20} />
      <Input label="Max seats per registration" name="maxPerBooking" type="number" min={1} defaultValue={a?.maxPerBooking ?? 6} />
      <Input label="Registration closes (hours before)" name="bookingDeadlineHours" type="number" min={0} defaultValue={a?.bookingDeadlineHours ?? 24} />
      <Select label="Recurrence label" name="recurrence" defaultValue={a?.recurrence ?? "none"} options={[{ value: "none", label: "One-time" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />
      <Textarea label="Requirements" name="requirements" rows={2} defaultValue={a?.requirements ?? ""} />
      <Textarea label="Image URLs (one per line)" name="imageUrls" rows={2} defaultValue={a?.images.join("\n")} />
      <Input label="Upload images" name="images" type="file" accept="image/*" multiple wrapClassName="sm:col-span-2" />
      <div className="flex flex-wrap gap-6 sm:col-span-2"><Checkbox name="requiresPayment" label="Collect payment" defaultChecked={a?.requiresPayment ?? true} /><Checkbox name="featured" label="Featured" defaultChecked={a?.featured} /><Checkbox name="active" label="Published" defaultChecked={a?.active ?? true} /></div>
      <div className="sm:col-span-2"><SubmitButton>Save activity</SubmitButton></div>
    </ActionForm>
  );
}

export function AddSessions({ activityId, capacity }: { activityId: string; capacity: number }) {
  return (
    <ActionForm action={addSessions} resetOnSuccess className="grid gap-3 sm:grid-cols-6 sm:items-end">
      <input type="hidden" name="activityId" value={activityId} />
      <Input label="Date" name="date" type="date" required wrapClassName="sm:col-span-2" />
      <Input label="Start" name="start" type="time" required />
      <Input label="End" name="end" type="time" required />
      <Input label="Seats" name="capacity" type="number" min={1} defaultValue={capacity} />
      <Select label="Repeat" name="repeat" options={[{ value: "none", label: "Once" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />
      <Input label="Occurrences" name="count" type="number" min={1} max={12} defaultValue={1} />
      <div className="sm:col-span-5"><SubmitButton variant="outline">Add session(s)</SubmitButton></div>
    </ActionForm>
  );
}

export function SessionControls({ sessionId, capacity, status }: { sessionId: string; capacity: number; status: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionForm action={updateSession} className="flex items-center gap-1">
        <input type="hidden" name="sessionId" value={sessionId} />
        <input name="capacity" type="number" min={1} defaultValue={capacity} aria-label="Capacity" className="h-8 w-20 rounded-md border border-sand-300 px-2 text-sm" />
        <SubmitButton size="sm" variant="ghost">Set seats</SubmitButton>
      </ActionForm>
      {status === "scheduled" && <ActionButton action={updateSession} fields={{ sessionId, status: "cancelled" }} variant="danger-outline" confirm="Cancel this session and refund every paid registration?">Cancel session</ActionButton>}
      {status === "scheduled" && <ActionButton action={updateSession} fields={{ sessionId, status: "completed" }} variant="ghost">Mark completed</ActionButton>}
    </div>
  );
}

export function Attendance({ registrationId, status }: { registrationId: string; status: string }) {
  return (
    <div className="flex gap-1">
      {status !== "attended" && <ActionButton action={markAttendance} fields={{ registrationId, status: "attended" }} variant="secondary">Attended</ActionButton>}
      {status !== "no_show" && <ActionButton action={markAttendance} fields={{ registrationId, status: "no_show" }} variant="ghost">No-show</ActionButton>}
      <ActionButton action={staffCancelRegistration} fields={{ registrationId }} variant="ghost" confirm="Cancel and refund this registration?">Cancel</ActionButton>
    </div>
  );
}
