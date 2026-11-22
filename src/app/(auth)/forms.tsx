"use client";
import Link from "next/link";
import { ActionForm, Checkbox, Input, Select, SubmitButton } from "@/components/ui/form";
import { forgotPassword, login, register, resetPassword, verifyMfa, resendVerification } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={login} className="space-y-4" refresh={false}>
      <input type="hidden" name="next" value={next ?? ""} />
      <Input label="Email" name="email" type="email" autoComplete="email" required autoFocus />
      <div>
        <Input label="Password" name="password" type="password" autoComplete="current-password" required />
        <Link href="/forgot-password" className="mt-1.5 inline-block text-sm link">Forgot password?</Link>
      </div>
      <SubmitButton size="lg" className="w-full" pendingLabel="Signing in…">Sign in</SubmitButton>
    </ActionForm>
  );
}

export function MfaForm({ next }: { next?: string }) {
  return (
    <ActionForm action={verifyMfa} className="space-y-4" refresh={false}>
      <input type="hidden" name="next" value={next ?? ""} />
      <Input label="6-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={8} required autoFocus />
      <SubmitButton size="lg" className="w-full">Verify</SubmitButton>
    </ActionForm>
  );
}

export function RegisterForm({ next, countries }: { next?: string; countries: { code: string; name: string; phoneCode: string }[] }) {
  return (
    <ActionForm action={register} className="space-y-4" refresh={false}>
      <input type="hidden" name="next" value={next ?? ""} />
      <Input label="Full name" name="fullName" autoComplete="name" required />
      <Input label="Email" name="email" type="email" autoComplete="email" required />
      <div className="grid gap-4 sm:grid-cols-[1fr_1.3fr]">
        <Select label="Country" name="countryCode" defaultValue="GH" options={countries.map((c) => ({ value: c.code, label: c.name }))} />
        <Input label="Phone" name="phone" type="tel" autoComplete="tel" placeholder="+233 24 123 4567" required />
      </div>
      <Input label="Password" name="password" type="password" autoComplete="new-password" hint="At least 10 characters with a letter and a number." required />
      <Checkbox name="terms" label={<>I agree to the <Link href="/pages/terms" className="link" target="_blank">terms</Link> and <Link href="/pages/privacy" className="link" target="_blank">privacy policy</Link></>} />
      <SubmitButton size="lg" className="w-full" pendingLabel="Creating account…">Create account</SubmitButton>
    </ActionForm>
  );
}

export function ForgotForm() {
  return (
    <ActionForm action={forgotPassword} className="space-y-4" refresh={false}>
      <Input label="Email" name="email" type="email" autoComplete="email" required autoFocus />
      <SubmitButton size="lg" className="w-full">Send reset link</SubmitButton>
    </ActionForm>
  );
}

export function ResetForm({ token }: { token: string }) {
  return (
    <ActionForm action={resetPassword} className="space-y-4" refresh={false}>
      <input type="hidden" name="token" value={token} />
      <Input label="New password" name="password" type="password" autoComplete="new-password" hint="At least 10 characters with a letter and a number." required />
      <Input label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
      <SubmitButton size="lg" className="w-full">Change password</SubmitButton>
      <p className="text-center text-sm"><Link href="/login" className="link">Back to sign in</Link></p>
    </ActionForm>
  );
}

export function ResendVerification() {
  return (
    <ActionForm action={resendVerification} refresh={false}>
      <SubmitButton variant="outline">Resend verification email</SubmitButton>
    </ActionForm>
  );
}
