"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Camera, Loader2, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; text: string; image?: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }; preview?: string };

/** Renders the assistant's text with internal markdown links only; everything else is plain text. */
function Rich({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\/[a-z0-9\-/]+)\)|\*\*([^*]+)\*\*/gi;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<Link key={k++} href={m[2]!} className="font-semibold text-forest-700 underline underline-offset-2">{m[1]}</Link>);
    else parts.push(<strong key={k++}>{m[3]}</strong>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <p className="whitespace-pre-wrap">{parts}</p>;
}

const SUGGESTIONS = ["Why is my lawn turning yellow in patches?", "What can I plant along a hot, sunny wall in Accra?", "How often should I water potted plants in the dry season?", "My hibiscus leaves have white fluffy spots"];

async function toBase64(file: File): Promise<{ data: string; mediaType: Turn["image"] extends infer T ? T extends { mediaType: infer M } ? M : never : never; preview: string }> {
  // Downscale large photos in the browser before upload.
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { data: url.split(",")[1]!, mediaType: "image/jpeg", preview: url };
}

export function AssistantChat({ configured, signedIn }: { configured: boolean; signedIn: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<Turn["image"] & { preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(q?: string) {
    const msg = (q ?? text).trim();
    if ((!msg && !image) || busy) return;
    const next: Turn[] = [...turns, { role: "user", text: msg, image: image ? { data: image.data, mediaType: image.mediaType } : undefined, preview: image?.preview }];
    setTurns(next); setText(""); setImage(null); setError(null); setBusy(true);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ turns: next.map(({ role, text, image }) => ({ role, text, image })) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Something went wrong.");
      setTurns([...next, { role: "assistant", text: d.text }]);
    } catch (e) {
      setError((e as Error).message);
      setTurns(turns);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  if (!configured) return <div className="rounded-lg border border-sand-200 bg-sand-50 p-6 text-sm text-ink-soft">The garden assistant isn't switched on for this site yet. In the meantime, <Link href="/contact" className="link">ask our team</Link> or book a <Link href="/services/garden-consultation" className="link">garden consultation</Link>.</div>;
  if (!signedIn) return <div className="rounded-lg border border-sand-200 bg-sand-50 p-6 text-sm">Please <Link href="/login?next=/assistant" className="link">sign in</Link> to use the garden assistant. It's free for all customers.</div>;

  return (
    <div className="flex flex-col rounded-xl border border-sand-200 bg-white shadow-card">
      <div className="min-h-[360px] space-y-4 p-4 sm:p-6" aria-live="polite">
        {turns.length === 0 && (
          <div className="py-6 text-center">
            <Sparkles className="mx-auto h-7 w-7 text-forest-600" />
            <p className="mt-2 font-semibold">Ask about a plant, a problem, or upload a photo of your garden</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-md border border-sand-300 px-3 py-1.5 text-sm text-ink-soft hover:border-forest-500 hover:text-ink">{s}</button>)}</div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-lg px-4 py-3 text-[15px]", t.role === "user" ? "bg-forest-600 text-white" : "border border-sand-200 bg-sand-50")}>
              {t.preview &&   <img src={t.preview} alt="Your upload" className="mb-2 max-h-48 rounded" />}
              {t.role === "assistant" ? <><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-forest-700">AI-generated advice</p><Rich text={t.text} /></> : <p className="whitespace-pre-wrap">{t.text}</p>}
            </div>
          </div>
        ))}
        {busy && <p className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" /> Thinking about your garden…</p>}
        <div ref={endRef} />
      </div>
      {error && <p role="alert" className="mx-4 mb-2 rounded-md bg-clay-50 px-3 py-2 text-sm text-clay-700">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-sand-200 p-3">
        {image && <div className="mb-2 inline-flex items-center gap-2 rounded bg-sand-100 p-1 pr-2 text-xs">{ }<img src={image.preview} alt="" className="h-10 w-10 rounded object-cover" />Photo attached<button type="button" onClick={() => setImage(null)} aria-label="Remove photo"><X className="h-3.5 w-3.5" /></button></div>}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setImage(await toBase64(f)); } catch { setError("That photo couldn't be read."); } } e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-sand-300 text-ink-soft hover:bg-sand-50" aria-label="Attach a garden photo"><Camera className="h-5 w-5" /></button>
          <label htmlFor="ai-q" className="sr-only">Your question</label>
          <textarea id="ai-q" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} maxLength={4000} placeholder="Describe your garden or question…" className="min-h-[44px] flex-1 resize-none rounded-md border border-sand-300 px-3 py-2.5 focus:border-forest-500 focus:outline-none" />
          <button type="submit" disabled={busy || (!text.trim() && !image)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-forest-600 text-white hover:bg-forest-700 disabled:opacity-50" aria-label="Send"><Send className="h-5 w-5" /></button>
        </div>
      </form>
    </div>
  );
}
