import Image from "next/image";
import { Logo } from "@/components/site/logo";
import { pexels } from "@/lib/images";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px]">{children}</div>
        </main>
        <p className="text-xs text-ink-muted">Protected by rate limiting and secure sessions. We never share your details.</p>
      </div>
      <div className="relative hidden bg-forest-900 lg:block">
        <Image src={pexels(7156447, 1400)} alt="" fill sizes="50vw" className="object-cover opacity-80" priority />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-forest-950/90 to-transparent p-12 text-white">
          <p className="max-w-md font-display text-2xl font-semibold leading-snug">“One account for booking gardeners, buying supplies and joining workshops.”</p>
        </div>
      </div>
    </div>
  );
}
