"use client";
import Image from "next/image";
import { useState } from "react";

/** Drag/keyboard accessible before-and-after comparison. */
export function BeforeAfter({ before, after, alt }: { before: string; after: string; alt: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative aspect-[4/3] select-none overflow-hidden rounded-xl bg-sand-200">
      <Image src={after} alt={`${alt} – after`} fill sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <Image src={before} alt={`${alt} – before`} fill sizes="(min-width:1024px) 50vw, 100vw" className="object-cover" />
      </div>
      <span className="absolute left-3 top-3 rounded-sm bg-ink/80 px-2 py-0.5 text-xs font-semibold text-white">Before</span>
      <span className="absolute right-3 top-3 rounded-sm bg-forest-700 px-2 py-0.5 text-xs font-semibold text-white">After</span>
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-white shadow" />
        <div className="absolute top-1/2 -ml-4 -mt-4 flex h-8 w-8 items-center justify-center rounded-full bg-white text-ink shadow-pop">⇆</div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Drag to compare before and after"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
