import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-10 w-10", className)} aria-hidden>
      <circle cx="20" cy="20" r="20" className="fill-forest-600" />
      <path d="M20 8.5c-4.4 0-7.4 3-7.4 6.6-1.9.7-3.1 2.5-3.1 4.6 0 2.9 2.4 5.2 5.3 5.2h3.6v5.6h3.2v-5.6h3.6c2.9 0 5.3-2.3 5.3-5.2 0-2.1-1.2-3.9-3.1-4.6 0-3.6-3-6.6-7.4-6.6Z" className="fill-ink" />
      <path d="M20 21.5v-4.2m0 2.6-2.4-2m2.4 1 2.4-2" className="stroke-forest-100" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo({ name = "Home Gardens", href = "/", light, className }: { name?: string; href?: string; light?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label={`${name} home`}>
      <LogoMark />
      <span className={cn("font-display text-[22px] font-bold tracking-tight", light ? "text-white" : "text-ink")}>{name}</span>
    </Link>
  );
}
