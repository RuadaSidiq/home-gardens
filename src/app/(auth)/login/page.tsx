import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "../forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(next?.startsWith("/") ? next : "/account");
  return (
    <>
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="mt-1 text-ink-muted">Sign in to manage bookings, orders and workshops.</p>
      <div className="mt-8"><LoginForm next={next} /></div>
      <p className="mt-6 text-center text-sm text-ink-muted">
        New here? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">Create an account</Link>
      </p>
      <p className="mt-2 text-center text-sm text-ink-muted">
        Want to work with us? <Link href="/become-a-gardener" className="link">Apply as a gardener</Link>
      </p>
    </>
  );
}
