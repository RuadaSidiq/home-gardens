import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

const variants = {
  primary: "bg-forest-600 text-white hover:bg-forest-700 active:bg-forest-800 shadow-sm",
  dark: "bg-ink text-white hover:bg-forest-950",
  secondary: "bg-forest-50 text-forest-800 hover:bg-forest-100",
  outline: "border border-sand-300 bg-white text-ink hover:border-ink-muted hover:bg-sand-50",
  ghost: "text-ink-soft hover:bg-sand-100 hover:text-ink",
  danger: "bg-clay-600 text-white hover:bg-clay-700",
  "danger-outline": "border border-clay-500/40 bg-white text-clay-600 hover:bg-clay-50",
  light: "bg-white text-ink hover:bg-sand-100",
} as const;
const sizes = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
  icon: "h-9 w-9 justify-center",
} as const;

export type ButtonVariant = keyof typeof variants;
type Common = { variant?: ButtonVariant; size?: keyof typeof sizes; className?: string };

export function buttonClass({ variant = "primary", size = "md", className }: Common = {}) {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({ variant, size, className, type = "button", ...props }: Common & ComponentProps<"button">) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: Common & ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ variant, size, className })} {...props} />;
}
