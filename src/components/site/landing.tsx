import Link from "next/link";
import { ArrowDownRight, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small outlined label with a mint icon tile, used above landing-page headings. */
export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3 rounded-[10px] border border-mint-line bg-white py-1 pl-1 pr-4", className)}>
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-mint text-forest-600"><Sprout className="h-4 w-4" aria-hidden /></span>
      <span className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-soft">{children}</span>
    </span>
  );
}

export function LandingHeading({ chip, title, description, align = "center", action }: { chip: string; title: string; description?: string; align?: "center" | "left"; action?: React.ReactNode }) {
  return (
    <div className={cn("mb-12 flex flex-col gap-5", align === "center" ? "items-center text-center" : "items-start md:flex-row md:items-end md:justify-between")}>
      <div className={cn(align === "center" && "flex flex-col items-center")}>
        <Chip>{chip}</Chip>
        <h2 className={cn("mt-5 text-[1.9rem] font-bold leading-[1.15] tracking-tight sm:text-[2.4rem]", align === "center" ? "max-w-xl" : "max-w-2xl")}>{title}</h2>
        {description && <p className={cn("mt-4 text-ink-soft", align === "center" ? "max-w-2xl" : "max-w-xl")}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Uppercase, letter-spaced CTA with one larger corner, as in the brand reference. */
export function PillLink({ href, children, tone = "green", className }: { href: string; children: React.ReactNode; tone?: "green" | "dark" | "light"; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-[52px] items-center justify-center gap-2.5 rounded-[14px] rounded-br-[22px] px-7 text-[14px] font-bold uppercase tracking-[0.12em] transition-colors",
        tone === "green" && "bg-forest-600 text-white hover:bg-forest-700",
        tone === "dark" && "bg-ink text-white hover:bg-forest-950",
        tone === "light" && "bg-white text-ink hover:bg-mint",
        className,
      )}
    >
      {children} <ArrowDownRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

export function ExploreLink({ href, label = "Explore" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.14em] text-ink hover:text-forest-600">
      {label} <ArrowDownRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:translate-y-0.5" aria-hidden />
    </Link>
  );
}
