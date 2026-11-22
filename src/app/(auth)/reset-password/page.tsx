import Link from "next/link";
import { ResetForm } from "../forms";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      {token ? (
        <div className="mt-8"><ResetForm token={token} /></div>
      ) : (
        <p className="mt-4 text-ink-muted">This link is missing its token. <Link href="/forgot-password" className="link">Request a new reset link</Link>.</p>
      )}
    </>
  );
}
