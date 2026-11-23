import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { getSiteContext, serviceCategoriesNav } from "@/server/site";
import { Logo } from "./logo";
import { NewsletterForm } from "./newsletter";
import { CurrencySwitcher } from "./header-client";

const social = {
  facebook: "M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H7v4h2v9h4v-9h3l1-4h-4V9c0-.6.4-1 1-1Z",
  instagram: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4ZM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM12 2c-2.7 0-3 0-4.1.1C4.3 2.3 2.3 4.3 2.1 7.9 2 9 2 9.3 2 12s0 3 .1 4.1c.2 3.6 2.2 5.6 5.8 5.8 1.1.1 1.4.1 4.1.1s3 0 4.1-.1c3.6-.2 5.6-2.2 5.8-5.8.1-1.1.1-1.4.1-4.1s0-3-.1-4.1c-.2-3.6-2.2-5.6-5.8-5.8C15 2 14.7 2 12 2Z",
  x: "M17.8 3h3.1l-6.8 7.7L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.8 3h6.4l4.4 5.9L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z",
  youtube: "M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.8 15V9l5.8 3-5.8 3Z",
};

export async function SiteFooter() {
  const [{ settings, currency }, cats] = await Promise.all([getSiteContext(), serviceCategoriesNav()]);
  const c = settings.company;
  const socials = (Object.entries(settings.social) as [keyof typeof social, string][]).filter(([, url]) => url);
  return (
    <footer className="mt-auto bg-forest-950 text-forest-100">
      <div className="container grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-4">
          <Logo name={c.name} light />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-forest-200">{c.tagline}. Vetted gardeners, quality supplies and practical workshops for homes and businesses in Ghana.</p>
          <ul className="mt-6 space-y-2 text-sm text-forest-200">
            <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-forest-400" />{c.address}</li>
            <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-forest-400" /><a href={`tel:${c.phone.replace(/\s/g, "")}`} className="hover:text-white">{c.phone}</a></li>
            <li className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-forest-400" /><a href={`mailto:${c.email}`} className="hover:text-white">{c.email}</a></li>
          </ul>
          {socials.length > 0 && (
            <div className="mt-5 flex gap-2">
              {socials.map(([k, url]) => (
                <a key={k} href={url} target="_blank" rel="noopener noreferrer" aria-label={k} className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-forest-900 hover:bg-forest-800">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-forest-100"><path d={social[k]} /></svg>
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-5">
          <div>
            <h3 className="text-sm font-semibold text-white">Services</h3>
            <ul className="mt-3 space-y-2 text-sm text-forest-200">
              {cats.slice(0, 6).map((s) => <li key={s.id}><Link href={`/services?category=${s.slug}`} className="hover:text-white">{s.name}</Link></li>)}
              <li><Link href="/services" className="font-medium text-forest-300 hover:text-white">All services</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Company</h3>
            <ul className="mt-3 space-y-2 text-sm text-forest-200">
              <li><Link href="/about" className="hover:text-white">About us</Link></li>
              <li><Link href="/find-a-gardener" className="hover:text-white">Our gardeners</Link></li>
              <li><Link href="/become-a-gardener" className="hover:text-white">Become a gardener</Link></li>
              <li><Link href="/activities" className="hover:text-white">Workshops & events</Link></li>
              <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Help</h3>
            <ul className="mt-3 space-y-2 text-sm text-forest-200">
              <li><Link href="/faq" className="hover:text-white">FAQ</Link></li>
              <li><Link href="/shop" className="hover:text-white">Shop</Link></li>
              <li><Link href="/assistant" className="hover:text-white">Garden assistant</Link></li>
              <li><Link href="/pages/terms" className="hover:text-white">Terms</Link></li>
              <li><Link href="/pages/privacy" className="hover:text-white">Privacy</Link></li>
            </ul>
          </div>
        </div>
        <div className="md:col-span-3">
          <h3 className="text-sm font-semibold text-white">Seasonal garden tips</h3>
          <p className="mt-2 text-sm text-forest-200">One email a month: what to plant, prune and feed, plus shop offers.</p>
          <div className="mt-4"><NewsletterForm dark stacked /></div>
        </div>
      </div>
      <div className="border-t border-forest-900">
        <div className="container flex flex-col gap-2 py-5 text-xs text-forest-300 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {c.legalName.replace(/\.$/, "")}. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <p>Payments by Mobile Money, card and bank transfer.</p>
            <CurrencySwitcher value={currency} dark />
          </div>
        </div>
      </div>
    </footer>
  );
}
