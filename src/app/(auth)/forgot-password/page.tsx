import Link from "next/link";
import { ForgotForm } from "../forms";

export const metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Reset your password</h1>
      <p className="mt-1 text-ink-muted">Enter your email and we'll send you a link to choose a new password.</p>
      <div className="mt-8"><ForgotForm /></div>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="link">Back to sign in</Link></p>
    </>
  );
}
