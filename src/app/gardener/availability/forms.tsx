"use client";
import { ActionForm, Input, SubmitButton } from "@/components/ui/form";
import { addTimeOff, saveAvailability } from "../actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function WeeklyHours({ rows, maxJobs }: { rows: { weekday: number; startTime: string; endTime: string }[]; maxJobs: number }) {
  return (
    <ActionForm action={saveAvailability} className="space-y-3">
      {DAYS.map((d, i) => {
        const r = rows.find((x) => x.weekday === i);
        return (
          <div key={d} className="grid grid-cols-[7rem_1fr] items-center gap-3 sm:grid-cols-[9rem_auto_auto]">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name={`on_${i}`} defaultChecked={!!r} className="h-4 w-4 accent-forest-600" />{d}</label>
            <div className="col-start-2 flex items-center gap-2 sm:col-start-auto">
              <input aria-label={`${d} start`} type="time" name={`start_${i}`} defaultValue={r?.startTime.slice(0, 5) ?? "07:00"} className="h-9 rounded-md border border-sand-300 px-2 text-sm" />
              <span className="text-ink-muted">to</span>
              <input aria-label={`${d} end`} type="time" name={`end_${i}`} defaultValue={r?.endTime.slice(0, 5) ?? "17:00"} className="h-9 rounded-md border border-sand-300 px-2 text-sm" />
            </div>
          </div>
        );
      })}
      <Input label="Maximum jobs per day" name="maxJobsPerDay" type="number" min={1} max={10} defaultValue={maxJobs} wrapClassName="max-w-[12rem] pt-2" />
      <SubmitButton>Save weekly hours</SubmitButton>
    </ActionForm>
  );
}

export function TimeOffForm() {
  return (
    <ActionForm action={addTimeOff} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto] sm:items-end">
      <Input label="From" name="from" type="date" required />
      <Input label="To" name="to" type="date" required />
      <Input label="Reason (optional)" name="reason" />
      <SubmitButton variant="outline">Add</SubmitButton>
    </ActionForm>
  );
}
