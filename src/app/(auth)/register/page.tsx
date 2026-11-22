import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { RegisterForm } from "../forms";

export const metadata = { title: "Create an account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const countries = await db.select({ code: schema.countries.code, name: schema.countries.name, phoneCode: schema.countries.phoneCode }).from(schema.countries).where(eq(schema.countries.active, true));
  return (
    <>
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mt-1 text-ink-muted">One account for bookings, the shop and activities.</p>
      <div className="mt-8"><RegisterForm next={next} countries={countries} /></div>
      <p className="mt-6 text-center text-sm text-ink-muted">Already have an account? <Link href="/login" className="link">Sign in</Link></p>
    </>
  );
}
