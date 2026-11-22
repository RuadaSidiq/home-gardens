import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, BadgeCheck, Briefcase, MapPin, Leaf, Sprout, Trees, TreeDeciduous, Shovel, Scissors, Droplets, Brush, FlaskConical, ClipboardList, Bug, PencilRuler, Fence, Wind } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Stars } from "@/components/ui/primitives";
import type { ServicePriceLabel } from "@/server/queries/catalog";

const ICONS = { lawn: Sprout, landscape: Fence, design: PencilRuler, tree: TreeDeciduous, sprout: Sprout, broom: Brush, weed: Wind, droplet: Droplets, shears: Scissors, flask: FlaskConical, clipboard: ClipboardList, leaf: Leaf, bug: Bug, trees: Trees, shovel: Shovel } as const;
export function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const I = ICONS[name as keyof typeof ICONS] ?? Leaf;
  return <I className={className} aria-hidden />;
}

export function PriceTag({ p, currency, className }: { p: ServicePriceLabel; currency: string; className?: string }) {
  if (p.amount == null) return <span className={cn("text-sm font-medium text-ink-soft", className)}>{p.label}</span>;
  return (
    <span className={cn("text-sm", className)}>
      {p.prefix && <span className="text-ink-muted">{p.prefix}</span>}
      <span className="font-semibold text-ink">{formatMoney(p.amount, currency, { noDecimals: p.amount % 100 === 0 })}</span>
      {p.suffix && <span className="text-ink-muted">{p.suffix}</span>}
    </span>
  );
}

type ProductLike = { slug: string; name: string; images: string[]; ratingAvg: string; ratingCount: number };
export function ProductCard({ product, price, salePrice, brand, stock, currency }: { product: ProductLike; price: number; salePrice: number | null; brand?: string | null; stock?: number; currency: string }) {
  const img = product.images[0];
  const out = stock != null && stock <= 0;
  return (
    <Link href={`/shop/${product.slug}`} className="group flex flex-col">
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-sand-100">
        {img && <Image src={img} alt={product.name} fill sizes="(min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />}
        <div className="absolute left-2.5 top-2.5 flex flex-col gap-1">
          {salePrice != null && <span className="rounded-sm bg-clay-600 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Sale</span>}
          {out && <span className="rounded-sm bg-white/95 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink">Out of stock</span>}
        </div>
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        {brand && <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{brand}</p>}
        <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug group-hover:text-forest-700">{product.name}</h3>
        {product.ratingCount > 0 && <div className="mt-1"><Stars value={Number(product.ratingAvg)} count={product.ratingCount} size={12} /></div>}
        <p className="mt-1.5 flex items-baseline gap-2">
          <span className="font-semibold">{formatMoney(salePrice ?? price, currency)}</span>
          {salePrice != null && <span className="text-sm text-ink-muted line-through">{formatMoney(price, currency)}</span>}
        </p>
      </div>
    </Link>
  );
}

type GardenerLike = { g: { slug: string; headline: string; yearsExperience: number; type: "company" | "independent"; ratingAvg: string; ratingCount: number; verifiedAt: Date | null; hourlyRate: number | null; currency: string; jobsCompleted: number }; name: string; avatar: string | null; city: string | null; specialties?: string[] };
export function GardenerCard({ gardener: r, compact }: { gardener: GardenerLike; compact?: boolean }) {
  return (
    <Link href={`/gardeners/${r.g.slug}`} className="group flex flex-col overflow-hidden rounded-lg border border-sand-200 bg-white transition-shadow hover:shadow-pop">
      <div className={cn("relative overflow-hidden bg-sand-100", compact ? "aspect-[4/3]" : "aspect-[5/4]")}>
        {r.avatar && <Image src={r.avatar} alt={r.name} fill sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw" className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]" />}
        <span className={cn("absolute left-3 top-3 rounded-sm px-2 py-0.5 text-[11px] font-semibold", r.g.type === "company" ? "bg-forest-700 text-white" : "bg-white text-ink")}>
          {r.g.type === "company" ? "Home Gardens team" : "Independent"}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-1.5">
          <h3 className="text-base font-semibold group-hover:text-forest-700">{r.name}</h3>
          {r.g.verifiedAt && <BadgeCheck className="h-4 w-4 text-forest-600" aria-label="Verified" />}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm text-ink-soft">{r.g.headline}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
          {r.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.city}</span>}
          <span className="inline-flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{r.g.yearsExperience} yrs</span>
        </div>
        {!compact && r.specialties && r.specialties.length > 0 && (
          <p className="mt-2 line-clamp-1 text-[13px] text-ink-muted">{r.specialties.slice(0, 3).join(" · ")}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          <Stars value={Number(r.g.ratingAvg)} count={r.g.ratingCount} size={12} />
          {r.g.type === "independent" && r.g.hourlyRate ? (
            <span className="text-sm"><span className="font-semibold">{formatMoney(r.g.hourlyRate, r.g.currency, { noDecimals: true })}</span><span className="text-ink-muted">/h</span></span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function SectionHeading({ eyebrow, title, description, action, align = "left", className }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode; align?: "left" | "center"; className?: string }) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-4", align === "center" && "flex-col items-center text-center", className)}>
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="h-section mt-2">{title}</h2>
        {description && <p className="mt-3 text-ink-soft">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ArrowLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:text-forest-900", className)}>
      {children}
      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}
