import Link from "next/link";
import { consumeEmailToken } from "@/server/auth/verify-email";
import { getCurrentUser } from "@/server/auth/session";
import { ButtonLink } from "@/components/ui/button";
import { ResendVerification } from "../forms";

export const metadata = { title: "Verify email" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await consumeEmailToken(token) : false;
  const user = await getCurrentUser();
  return (
    <>
      <h1 className="text-2xl font-bold">{ok ? "Email confirmed" : token ? "Link expired" : "Verify your email"}</h1>
      <p className="mt-2 text-ink-muted">
        {ok ? "Thanks – your email address is confirmed." : token ? "This verification link is invalid or has expired." : "Open the link we emailed you to confirm your address."}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {ok ? <ButtonLink href={user ? "/account" : "/login"}>Continue</ButtonLink> : user && !user.emailVerified ? <ResendVerification /> : <Link href="/login" className="link">Sign in</Link>}
      </div>
    </>
  );
}
