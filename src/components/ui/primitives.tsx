import Link from "next/link";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { cn, initials, titleCase } from "@/lib/utils";
import { formatMoney as formatMoneyInline } from "@/lib/money";
import type { ReactNode } from "react";

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "green" | "amber" | "red" | "blue" | "dark"; children: ReactNode; className?: string }) {
  const t = {
    neutral: "bg-sand-100 text-sand-700 ring-sand-200",
    green: "bg-forest-50 text-forest-700 ring-forest-100",
    amber: "bg-amber-400/15 text-amber-600 ring-amber-400/30",
    red: "bg-clay-50 text-clay-600 ring-clay-500/20",
    blue: "bg-sky-50 text-sky-700 ring-sky-100",
    dark: "bg-ink text-white ring-ink",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", t, className)}>{children}</span>;
}

const STATUS_TONES: Record<string, "neutral" | "green" | "amber" | "red" | "blue" | "dark"> = {
  // bookings
  awaiting_quote: "amber", quoted: "blue", awaiting_payment: "amber", pending_assignment: "amber", assigned: "blue", accepted: "green",
  in_progress: "blue", awaiting_confirmation: "amber", completed: "green", cancelled: "neutral", disputed: "red",
  // payments / orders
  unpaid: "amber", deposit_paid: "blue", paid: "green", partially_refunded: "amber", refunded: "neutral",
  initiated: "neutral", pending: "amber", succeeded: "green", failed: "red",
  pending_payment: "amber", processing: "blue", shipped: "blue", delivered: "green",
  unfulfilled: "neutral", partial: "amber", fulfilled: "green", returned: "neutral",
  // gardeners / users
  draft: "neutral", info_requested: "amber", approved: "green", rejected: "red", suspended: "red", active: "green", deactivated: "neutral",
  verified: "green",
  // payouts / commissions
  requested: "amber", available: "green", reversed: "neutral",
  // tickets / registrations
  open: "amber", resolved: "green", closed: "neutral", confirmed: "green", attended: "green", no_show: "red", scheduled: "blue",
  offered: "blue", withdrawn: "neutral", expired: "neutral", declined: "neutral", superseded: "neutral",
  published: "green", hidden: "neutral", new: "amber", handled: "green",
};
const STATUS_LABELS: Record<string, string> = {
  pending_assignment: "Finding gardener", assigned: "Awaiting gardener", awaiting_confirmation: "Awaiting your confirmation", awaiting_quote: "Awaiting quote",
  quoted: "Quote ready", awaiting_payment: "Awaiting payment", info_requested: "Info requested", pending_payment: "Awaiting payment",
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"}>{label ?? STATUS_LABELS[status] ?? titleCase(status)}</Badge>;
}
export function staffStatusLabel(s: string) {
  return { pending_assignment: "Needs assignment", assigned: "Offered", awaiting_confirmation: "Awaiting customer" }[s] ?? titleCase(s);
}

export function Card({ className, children, as: As = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" }) {
  return <As className={cn("rounded-lg border border-sand-200 bg-white shadow-card", className)}>{children}</As>;
}
export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-sand-200 px-5 py-4", className)}>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-forest-100 font-semibold text-forest-800", className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  );
}

export function Stars({ value, count, size = 14, showValue = true }: { value: number; count?: number; size?: number; showValue?: boolean }) {
  if (!count) return <span className="text-xs font-medium text-ink-muted">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span className="inline-flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} style={{ width: size, height: size }} className={i <= Math.round(value) ? "fill-amber-500 text-amber-500" : "fill-sand-200 text-sand-200"} />
        ))}
      </span>
      {showValue && <span className="font-semibold">{value.toFixed(1)}</span>}
      {count != null && <span className="text-ink-muted">({count})</span>}
      <span className="sr-only">{value.toFixed(1)} out of 5 from {count} reviews</span>
    </span>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-lg border border-dashed border-sand-300 bg-sand-50 px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 text-sand-500">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "success" | "warning" | "error"; title?: string; children?: ReactNode; className?: string }) {
  const t = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-forest-200 bg-forest-50 text-forest-900",
    warning: "border-amber-400/40 bg-amber-400/10 text-sand-900",
    error: "border-clay-500/30 bg-clay-50 text-clay-700",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-md border px-4 py-3 text-sm", t, className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, breadcrumbs, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumbs?: { label: string; href?: string }[]; className?: string }) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} className="mb-2" />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Breadcrumbs({ items, className }: { items: { label: string; href?: string }[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("text-[13px] text-ink-muted", className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-sand-400" aria-hidden />}
            {it.href ? <Link href={it.href} className="hover:text-ink">{it.label}</Link> : <span aria-current="page" className="text-ink-soft">{it.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-sand-200 bg-white p-4 shadow-card", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function DescriptionList({ items, className }: { items: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-sand-100 text-sm", className)}>
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2.5">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Pagination that preserves current search params. */
export function Pagination({ page, pageCount, params, basePath }: { page: number; pageCount: number; params: Record<string, string | undefined>; basePath: string }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `${basePath}${s ? `?${s}` : ""}`;
  };
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1);
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-2 text-sm">
      <Link aria-disabled={page <= 1} href={href(Math.max(1, page - 1))} className={cn("inline-flex items-center gap-1 rounded-md border border-sand-200 px-3 py-1.5 hover:bg-sand-50", page <= 1 && "pointer-events-none opacity-40")}>
        <ChevronLeft className="h-4 w-4" /> Previous
      </Link>
      <ol className="hidden items-center gap-1 sm:flex">
        {pages.map((p, i) => (
          <li key={p} className="flex items-center gap-1">
            {i > 0 && pages[i - 1]! < p - 1 && <span className="px-1 text-ink-muted">…</span>}
            <Link href={href(p)} aria-current={p === page ? "page" : undefined} className={cn("min-w-8 rounded-md px-2.5 py-1.5 text-center", p === page ? "bg-ink text-white" : "hover:bg-sand-100")}>{p}</Link>
          </li>
        ))}
      </ol>
      <span className="text-ink-muted sm:hidden">Page {page} of {pageCount}</span>
      <Link aria-disabled={page >= pageCount} href={href(Math.min(pageCount, page + 1))} className={cn("inline-flex items-center gap-1 rounded-md border border-sand-200 px-3 py-1.5 hover:bg-sand-50", page >= pageCount && "pointer-events-none opacity-40")}>
        Next <ChevronRight className="h-4 w-4" />
      </Link>
    </nav>
  );
}

export function Money({ amount, currency, className }: { amount: number; currency: string; className?: string }) {
  // separated so it can be imported in server components without pulling client code
  return <span className={cn("tabular-nums", className)}>{formatMoneyInline(amount, currency)}</span>;
}
