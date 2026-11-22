import Image from "next/image";
import { pexels, unsplash } from "@/lib/images";
import { trustStats } from "@/server/queries/catalog";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "About us" };

export default async function AboutPage() {
  const s = await trustStats();
  return (
    <>
      <section className="container grid gap-10 py-12 lg:grid-cols-2 lg:items-center lg:py-16">
        <div>
          <p className="eyebrow">About Home Gardens</p>
          <h1 className="h-page mt-2">Garden care that turns up on time and does the job properly</h1>
          <p className="lead mt-4">We started with a simple frustration: finding a reliable gardener in Accra meant asking around, agreeing a price on the spot and hoping for the best. Home Gardens brings trained company gardeners and vetted independent professionals together on one platform with clear prices, secure payment and support when something isn't right.</p>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-sand-100"><Image src={pexels(4920266, 1400)} alt="Gardeners discussing plants in a nursery" fill sizes="50vw" className="object-cover" priority /></div>
      </section>
      <section className="border-y border-sand-200 bg-sand-50">
        <div className="container grid gap-8 py-12 sm:grid-cols-3">
          <div><p className="font-display text-4xl font-bold text-forest-700">{s.verifiedGardeners}</p><p className="mt-1 text-sm text-ink-soft">Verified gardeners on the platform</p></div>
          <div><p className="font-display text-4xl font-bold text-forest-700">{s.cities}</p><p className="mt-1 text-sm text-ink-soft">Areas served in Greater Accra and Kumasi</p></div>
          <div><p className="font-display text-4xl font-bold text-forest-700">{s.jobsCompleted}</p><p className="mt-1 text-sm text-ink-soft">Jobs completed and confirmed by customers</p></div>
        </div>
      </section>
      <section className="container grid gap-12 py-14 lg:grid-cols-3">
        {[
          { t: "Two kinds of gardener, one standard", d: "Our company gardeners are employed, trained and insured by us. Independent gardeners run their own businesses – we check their identity, experience and work before approving them, and keep an eye on reviews." },
          { t: "Fair to customers and gardeners", d: "Customers see the price before paying. Independent gardeners keep the job value minus a published commission and are paid out to Mobile Money or bank after each job is confirmed." },
          { t: "Supplies we actually use", d: "The shop stocks the tools, feeds and plants our teams rely on, from Volta Region terracotta to irrigation parts – so you can keep your garden going between visits." },
        ].map((x) => <div key={x.t}><h2 className="text-xl font-bold">{x.t}</h2><p className="mt-2 text-ink-soft">{x.d}</p></div>)}
      </section>
      <section className="container pb-16">
        <div className="grid overflow-hidden rounded-xl bg-forest-900 text-white md:grid-cols-[1.2fr_1fr]">
          <div className="p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-white">Are you a gardener?</h2>
            <p className="mt-2 text-forest-100">Get regular jobs in your area, set your own rates and availability, and get paid reliably.</p>
            <ButtonLink href="/become-a-gardener" variant="light" className="mt-6">Apply to join</ButtonLink>
          </div>
          <div className="relative min-h-[200px]"><Image src={unsplash("1617576683096-00fc8eecb3af", 1000)} alt="" fill sizes="40vw" className="object-cover" /></div>
        </div>
      </section>
    </>
  );
}
