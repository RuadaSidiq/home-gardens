"use client";
import { ActionForm, Checkbox, Input, Select, SubmitButton } from "@/components/ui/form";
import { ActionButton } from "@/components/ui/form";
import { beginMfa, changePassword, disableMfa, enableMfa, signOutOtherSessions, updatePrefs, updateProfile } from "@/app/account/actions";

export function ProfileForm({ u, countries }: { u: { fullName: string; phone: string | null; countryCode: string | null; preferredCurrency: string | null; email: string }; countries: { code: string; name: string }[] }) {
  return (
    <ActionForm action={updateProfile} className="grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
      <Input label="Full name" name="fullName" required defaultValue={u.fullName} />
      <Input label="Email" value={u.email} disabled hint="Contact support to change your email." />
      <Input label="Phone" name="phone" type="tel" required defaultValue={u.phone ?? ""} />
      <Select label="Country" name="countryCode" defaultValue={u.countryCode ?? "GH"} options={countries.map((c) => ({ value: c.code, label: c.name }))} />
      <Select label="Preferred currency" name="preferredCurrency" defaultValue={u.preferredCurrency ?? "GHS"} options={["GHS", "USD", "GBP", "EUR", "NGN"].map((c) => ({ value: c, label: c }))} />
      <Input label="Profile photo" name="avatar" type="file" accept="image/*" />
      <div className="sm:col-span-2"><SubmitButton>Save profile</SubmitButton></div>
    </ActionForm>
  );
}

export function PrefsForm({ prefs }: { prefs: { email: boolean; sms: boolean; whatsapp: boolean; marketing: boolean } }) {
  return (
    <ActionForm action={updatePrefs} className="space-y-3">
      <Checkbox name="email" defaultChecked={prefs.email} label="Email" description="Booking, order and payment updates." />
      <Checkbox name="sms" defaultChecked={prefs.sms} label="SMS" description="Important reminders and job alerts." />
      <Checkbox name="whatsapp" defaultChecked={prefs.whatsapp} label="WhatsApp" description="Where available." />
      <Checkbox name="marketing" defaultChecked={prefs.marketing} label="Offers and garden tips" />
      <SubmitButton>Save preferences</SubmitButton>
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePassword} resetOnSuccess className="grid gap-4 sm:max-w-md">
      <Input label="Current password" name="current" type="password" autoComplete="current-password" required />
      <Input label="New password" name="password" type="password" autoComplete="new-password" required hint="10+ characters with a letter and a number." />
      <Input label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
      <div><SubmitButton>Change password</SubmitButton></div>
    </ActionForm>
  );
}

export function MfaSection({ enabled, secret, otpauth }: { enabled: boolean; secret: string | null; otpauth: string | null }) {
  if (enabled) {
    return (
      <ActionForm action={disableMfa} className="flex flex-wrap items-end gap-3">
        <p className="w-full text-sm text-forest-700">Two-step verification is on.</p>
        <Input label="Code to turn off" name="code" inputMode="numeric" required wrapClassName="w-40" />
        <SubmitButton variant="danger-outline">Turn off</SubmitButton>
      </ActionForm>
    );
  }
  if (!secret) return <ActionButton action={beginMfa} variant="outline" size="md">Set up two-step verification</ActionButton>;
  return (
    <div className="space-y-3 text-sm">
      <p>Add this key to an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password), then enter the 6-digit code.</p>
      <p className="break-all rounded bg-sand-100 p-3 font-mono text-base tracking-wider">{secret.match(/.{1,4}/g)?.join(" ")}</p>
      {otpauth && <a href={otpauth} className="link">Open in authenticator app</a>}
      <ActionForm action={enableMfa} className="flex flex-wrap items-end gap-3">
        <Input label="6-digit code" name="code" inputMode="numeric" required wrapClassName="w-40" />
        <SubmitButton>Turn on</SubmitButton>
      </ActionForm>
    </div>
  );
}

export function SessionsButton() {
  return <ActionButton action={signOutOtherSessions} variant="outline" size="md" confirm="Sign out of every other device?">Sign out other devices</ActionButton>;
}
