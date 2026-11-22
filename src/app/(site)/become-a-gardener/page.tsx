import Image from "next/image";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { serviceCities } from "@/server/queries/catalog";
import { pexels } from "@/lib/images";
import { ButtonLink } from "@/components/ui/button";
import { ApplicationForm } from "./application-form";

export const metadata = { title: "Become a gardener", description: "Join Home Gardens as an independent gardener: steady jobs in your area, your own rates and reliable payouts." };

export default async function BecomeGardener() {
  const user = await getCurrentUser();
  const settings = await getSettings();
  const [cities, services, countries] = await Promise.all([
    serviceCities(),
    db.select({ id: schema.services.id, name: schema.services.name, category: schema.serviceCategories.name }).from(schema.services).innerJoin(schema.serviceCategories, eq(schema.serviceCategories.id, schema.services.categoryId)).where(eq(schema.services.active, true)).orderBy(asc(schema.serviceCategories.sort), asc(schema.services.name)),
    db.select().from(schema.countries).where(eq(schema.countries.servicesEnabled, true)),
  ]);
  return (
    <>
      <section className="border-b border-sand-200 bg-sand-50">
        <div className="container grid gap-10 py-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow">For gardeners</p>
            <h1 className="h-page mt-2">Grow your gardening business with steady, paid work</h1>
            <p className="lead mt-4">Customers book and pay through the platform. You accept the jobs that suit you, do great work and get paid to Mobile Money or your bank.</p>
            <ul className="mt-6 space-y-2.5 text-ink-soft">
              {[`Keep ${100 - settings.finance.defaultCommissionBps / 100}% of the job value on most services`, "Set your own hourly rate, working days and service areas", "Accept or decline every job – no penalties for saying no", `Earnings released ${settings.finance.payoutHoldDays} days after the customer confirms`].map((x) => (
                <li key={x} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-forest-600" />{x}</li>
              ))}
            </ul>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-sand-200"><Image src={pexels(7156447, 1200)} alt="Gardener repotting a plant" fill priority sizes="50vw" className="object-cover" /></div>
        </div>
      </section>
      <div className="container max-w-4xl py-12">
        {user?.gardenerId ? (
          <div className="rounded-lg border border-sand-200 p-8 text-center">
            <h2 className="text-xl font-bold">You already have a gardener profile</h2>
            <ButtonLink href="/gardener/dashboard" className="mt-4">Go to your dashboard</ButtonLink>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold">Apply in about 10 minutes</h2>
            <p className="mt-1 text-ink-muted">Our team reviews applications within 3 working days. You'll need a photo, an ID document and some photos of your work. {!user && <>Already have a customer account? <Link href="/login?next=/become-a-gardener" className="link">Sign in first</Link>.</>}</p>
            <ApplicationForm signedIn={!!user} defaults={{ name: user?.fullName ?? "", email: user?.email ?? "", phone: user?.phone ?? "" }} cities={cities} services={services} countries={countries.map((c) => ({ code: c.code, name: c.name, currency: c.currency }))} />
          </>
        )}
      </div>
    </>
  );
}
