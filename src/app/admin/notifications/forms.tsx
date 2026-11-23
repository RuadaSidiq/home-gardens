"use client";
import { ActionForm, Checkbox, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { saveTemplate } from "../_actions/system";

export function TemplateForm({ t }: { t: { key: string; subject: string; body: string; sms: string | null; channels: string[]; active: boolean } }) {
  return (
    <ActionForm action={saveTemplate} className="grid gap-3">
      <input type="hidden" name="key" value={t.key} />
      <Input label="Subject / title" name="subject" required defaultValue={t.subject} />
      <Textarea label="Message" name="body" required rows={3} defaultValue={t.body} />
      <Input label="SMS text (optional, 320 chars)" name="sms" defaultValue={t.sms ?? ""} maxLength={320} />
      <div className="flex flex-wrap items-center gap-4">
        {["in_app", "email", "sms", "whatsapp"].map((c) => <label key={c} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="channels[]" value={c} defaultChecked={t.channels.includes(c)} className="accent-forest-600" />{c.replace("_", "-")}</label>)}
        <Checkbox name="active" label="Active" defaultChecked={t.active} />
        <SubmitButton size="sm" variant="outline">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}
