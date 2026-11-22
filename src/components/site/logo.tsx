import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-forest-700" />
      <path d="M16 6.5 6.5 14v11.5h7v-6.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5v6.5h7V14L16 6.5Z" className="fill-forest-50" />
      <path d="M16 12.2c2.9 0 4.6 1.8 4.6 4.3-2.6.1-4.6-1.5-4.6-4.3Z" className="fill-forest-300" />
    </svg>
  );
}

export function Logo({ name = "Home Gardens", href = "/", light, className }: { name?: string; href?: string; light?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label={`${name} home`}>
      <LogoMark />
      <span className={cn("font-display text-[19px] font-bold tracking-tight", light ? "text-white" : "text-ink")}>{name}</span>
    </Link>
  );
}
