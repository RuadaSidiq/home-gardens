import Link from "next/link";
import { faqs } from "@/server/queries/catalog";

export const metadata = { title: "Frequently asked questions" };

export default async function FaqPage() {
  const list = await faqs();
  const groups = [...new Set(list.map((f) => f.category))];
  return (
    <div className="container max-w-4xl py-12 lg:py-16">
      <p className="eyebrow">Help</p>
      <h1 className="h-page mt-2">Frequently asked questions</h1>
      <p className="lead mt-3">Can't find your answer? <Link href="/contact" className="link">Contact us</Link> or try the <Link href="/assistant" className="link">garden assistant</Link>.</p>
      <div className="mt-10 space-y-10">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="text-lg font-bold">{g}</h2>
            <div className="mt-3 divide-y divide-sand-200 border-y border-sand-200">
              {list.filter((f) => f.category === g).map((f) => (
                <details key={f.id} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.question}<span className="text-xl leading-none text-ink-muted transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-ink-soft">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
