import { redirect } from "next/navigation";
import { getPendingMfaSession } from "@/server/auth/session";
import { MfaForm } from "../../forms";

export const metadata = { title: "Two-step verification" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await getPendingMfaSession())) redirect("/login");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold">Two-step verification</h1>
      <p className="mt-1 text-ink-muted">Enter the code from your authenticator app.</p>
      <div className="mt-8"><MfaForm next={next} /></div>
    </>
  );
}
