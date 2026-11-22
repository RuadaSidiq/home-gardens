"use client";
import { ActionForm, Checkbox, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { saveGardenerProfile, uploadPortfolio } from "../actions";

export function ProfileForm({ g, independent }: { g: { headline: string; bio: string; yearsExperience: number; qualifications: string | null; hourlyRate: string; isPublic: boolean }; independent: boolean }) {
  return (
    <ActionForm action={saveGardenerProfile} className="grid gap-4 sm:grid-cols-2">
      <Input label="Headline" name="headline" required defaultValue={g.headline} wrapClassName="sm:col-span-2" />
      <Textarea label="About you" name="bio" required defaultValue={g.bio} rows={5} wrapClassName="sm:col-span-2" />
      <Input label="Years of experience" name="yearsExperience" type="number" min={0} defaultValue={g.yearsExperience} />
      {independent && <Input label="Hourly rate" name="hourlyRate" type="number" step="0.01" min={1} defaultValue={g.hourlyRate} />}
      <Input label="Qualifications" name="qualifications" defaultValue={g.qualifications ?? ""} wrapClassName="sm:col-span-2" />
      <Checkbox name="isPublic" defaultChecked={g.isPublic} label="Show my profile in Find a gardener" description="If off, you can still be assigned jobs by our team." className="sm:col-span-2" />
      <div className="sm:col-span-2"><SubmitButton>Save profile</SubmitButton></div>
    </ActionForm>
  );
}

export function PortfolioUpload() {
  return (
    <ActionForm action={uploadPortfolio} resetOnSuccess className="flex flex-wrap items-end gap-3" encType="multipart/form-data">
      <Input label="Add photos" name="photos" type="file" accept="image/*" multiple required wrapClassName="flex-1 min-w-[14rem]" />
      <Input label="Caption (optional)" name="caption" wrapClassName="flex-1 min-w-[10rem]" />
      <SubmitButton variant="outline">Upload</SubmitButton>
    </ActionForm>
  );
}
