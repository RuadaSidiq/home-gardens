"use client";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  if (!images.length) return <div className="aspect-square rounded-xl bg-sand-100" />;
  return (
    <div className="grid gap-3 sm:grid-cols-[4.5rem_1fr]">
      <div className="order-2 flex gap-2 sm:order-1 sm:flex-col">
        {images.map((src, idx) => (
          <button key={src} type="button" onClick={() => setI(idx)} aria-label={`Show image ${idx + 1}`} aria-pressed={i === idx} className={cn("relative h-16 w-16 overflow-hidden rounded-md border-2 bg-sand-100", i === idx ? "border-forest-600" : "border-transparent opacity-70 hover:opacity-100")}>
            <Image src={src} alt="" fill sizes="64px" className="object-cover" />
          </button>
        ))}
      </div>
      <div className="relative order-1 aspect-square overflow-hidden rounded-xl bg-sand-100 sm:order-2">
        <Image src={images[i]!} alt={alt} fill priority sizes="(min-width:1024px) 45vw, 100vw" className="object-cover" />
      </div>
    </div>
  );
}
