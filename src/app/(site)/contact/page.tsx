import { Mail, MapPin, Phone, MessageCircle, Clock } from "lucide-react";
import { getSettings } from "@/server/settings";
import { ContactForm } from "./contact-form";

export const metadata = { title: "Contact us" };

export default async function ContactPage() {
  const { company: c } = await getSettings();
  return (
    <div className="container grid gap-12 py-12 lg:grid-cols-[1fr_1.4fr] lg:py-16">
      <div>
        <p className="eyebrow">Contact</p>
        <h1 className="h-page mt-2">Talk to our team</h1>
        <p className="lead mt-3">Questions about a booking, a large project or an order? We reply within one working day. Signed-in customers can also message support from their account.</p>
        <ul className="mt-8 space-y-5 text-sm">
          <li className="flex gap-3"><Phone className="h-5 w-5 text-forest-600" /><span><strong className="block">Phone</strong><a href={`tel:${c.phone.replace(/\s/g, "")}`} className="link">{c.phone}</a></span></li>
          <li className="flex gap-3"><MessageCircle className="h-5 w-5 text-forest-600" /><span><strong className="block">WhatsApp</strong><a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} className="link" target="_blank" rel="noopener noreferrer">{c.whatsapp}</a></span></li>
          <li className="flex gap-3"><Mail className="h-5 w-5 text-forest-600" /><span><strong className="block">Email</strong><a href={`mailto:${c.email}`} className="link">{c.email}</a></span></li>
          <li className="flex gap-3"><MapPin className="h-5 w-5 text-forest-600" /><span><strong className="block">Office</strong>{c.address}</span></li>
          <li className="flex gap-3"><Clock className="h-5 w-5 text-forest-600" /><span><strong className="block">Hours</strong>Mon–Fri 8:00–17:00, Sat 8:00–13:00</span></li>
        </ul>
      </div>
      <div className="rounded-xl border border-sand-200 bg-white p-6 shadow-card sm:p-8"><h2 className="mb-6 text-xl font-bold">Send us a message</h2><ContactForm /></div>
    </div>
  );
}
