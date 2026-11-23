"use client";
import { useState } from "react";
import { ServiceIcon } from "./cards";
import { ExploreLink } from "./landing";

type Cat = { id: number; slug: string; name: string; description: string; icon: string };

/** Mint service cards; shows four, "Load more" reveals the next four. */
export function ServiceCards({ categories }: { categories: Cat[] }) {
  const [shown, setShown] = useState(4);
  return (
    <>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {categories.slice(0, shown).map((c) => (
          <li key={c.id} className="flex flex-col rounded-[22px] rounded-br-[56px] border border-mint-line bg-mint p-7 transition-shadow hover:shadow-pop">
            <span className="inline-flex h-[60px] w-[60px] items-center justify-center rounded-[14px] rounded-br-[22px] bg-forest-600 text-white">
              <ServiceIcon name={c.icon} className="h-7 w-7" />
            </span>
            <h3 className="mt-12 text-[1.3rem] font-semibold leading-snug">{c.name}</h3>
            <p className="mt-3 flex-1 text-[15px] leading-relaxed text-ink-soft">{c.description}</p>
            <div className="mt-6"><ExploreLink href={`/services?category=${c.slug}`} /></div>
          </li>
        ))}
      </ul>
      {shown < categories.length && (
        <div className="mt-12 flex justify-center">
          <button type="button" onClick={() => setShown((n) => n + 4)} className="inline-flex h-[52px] items-center rounded-[14px] rounded-br-[22px] bg-ink px-9 text-[14px] font-bold uppercase tracking-[0.12em] text-white hover:bg-forest-950">
            Load more
          </button>
        </div>
      )}
    </>
  );
}
