"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Transaction } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { AgentTrace, type TraceEvent } from "@/components/AgentTrace";
import { TrustBadge } from "@/components/TrustBadge";
import { PhotoCheck, type AiImage } from "@/components/PhotoCheck";
import { prepareImage, type PreparedImage } from "@/lib/images";
import { friendlyError, useBidguard } from "@/lib/useBidguard";
import { MAX_DESCRIPTION_LEN, MAX_TITLE_LEN, explorerTx } from "@/lib/config";
import { usd } from "@/lib/format";

type Trust = { score: number; decision: string; reasons: string[]; agents?: { aiImage?: AiImage | null } };
type Result = { listing: { _id: string; status: string; trust: Trust } };

const DURATIONS = [
  { m: 3, label: "3 minutes (demo)" },
  { m: 10, label: "10 minutes" },
  { m: 60, label: "1 hour" },
  { m: 24 * 60, label: "1 day" },
];
const DECISION: Record<string, { label: string; cls: string }> = {
  approve: { label: "Approved", cls: "text-emerald-300" },
  approve_with_warning: { label: "Approved with a warning", cls: "text-amber-300" },
  hold: { label: "Held for manual review", cls: "text-orange-300" },
  reject: { label: "Rejected", cls: "text-rose-300" },
};

export default function Sell() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const { send } = useBidguard();
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [form, setForm] = useState({ title: "", description: "", category: "Electronics", condition: "good", startPrice: "20", duration: 3 });
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<"" | "vetting" | "signing">("");
  const [error, setError] = useState("");

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    try {
      const prepared = await Promise.all(Array.from(files).slice(0, 4 - images.length).map(prepareImage));
      setImages((cur) => [...cur, ...prepared].slice(0, 4));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKey) return setError("Connect your wallet first");
    if (images.length === 0) return setError("Add at least one photo of the actual item");
    setError("");
    setTrace([]);
    setResult(null);
    setBusy("vetting");
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller: publicKey.toBase58(),
          title: form.title,
          description: form.description,
          category: form.category,
          condition: form.condition,
          startPrice: Number(form.startPrice),
          durationMinutes: form.duration,
          images: images.map(({ dataUrl, dhash, exif, aiMarkers, width, height }) => ({ dataUrl, dhash, exif, aiMarkers, width, height })),
        }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't submit the listing");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "trace") setTrace((t) => [...t, msg]);
          else if (msg.type === "result") setResult(msg);
          else if (msg.type === "error") throw new Error(msg.error);
        }
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy("");
    }
  }

  // A held listing waits for a moderator: poll until they decide.
  const held = result?.listing.status === "held";
  useEffect(() => {
    if (!held || !result) return;
    const id = setInterval(async () => {
      const r = await fetch(`/api/listings/${result.listing._id}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (j.listing.status !== "held") setResult({ listing: { ...result.listing, status: j.listing.status } });
    }, 5000);
    return () => clearInterval(id);
  }, [held, result]);

  async function goLive() {
    if (!result || !publicKey) return;
    setBusy("signing");
    setError("");
    try {
      const r0 = await fetch(`/api/listings/${result.listing._id}/tx`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seller: publicKey.toBase58() }) });
      const built = await r0.json();
      if (!r0.ok) throw new Error(built.error);
      const tx = Transaction.from(Buffer.from(built.tx, "base64"));
      const sig = await send(tx);
      const r = await fetch(`/api/listings/${result.listing._id}/activate`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      console.info("auction created", explorerTx(sig));
      router.push(`/auction/${j.auction._id}`);
    } catch (e) {
      setError(friendlyError(e));
      setBusy("");
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: k === "duration" ? Number(e.target.value) : e.target.value }));
  const decision = result && DECISION[result.listing.trust.decision];
  const bond = Math.max(1, Number(form.startPrice || 0) * 0.05);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <form onSubmit={submit} className="card space-y-5">
        <div>
          <h1 className="text-2xl font-bold">List an item</h1>
          <p className="text-sm text-slate-400">Our agents check your photos, price and history before the auction goes live. Use real photos of the item you have.</p>
        </div>

        <div>
          <span className="label">Photos (1–4)</span>
          <div className="flex flex-wrap gap-3">
            {images.map((img, i) => (
              <div key={i} className={`relative h-24 w-24 overflow-hidden rounded-lg border ${img.aiMarkers.length ? "border-rose-500" : "border-slate-700"}`} title={img.aiMarkers.join(", ")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.dataUrl} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" onClick={() => setImages((c) => c.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-slate-950/80 p-1" aria-label={`Remove photo ${i + 1}`}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {images.length < 4 && (
              <label className="grid h-24 w-24 cursor-pointer place-items-center rounded-lg border border-dashed border-slate-600 text-slate-400 hover:border-brand hover:text-brand">
                <ImagePlus className="h-6 w-6" aria-hidden />
                <span className="sr-only">Add photos</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
              </label>
            )}
          </div>
          {images.some((i) => i.aiMarkers.length) && (
            <p role="alert" className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-sm text-rose-200">
              A photo&apos;s file says it was made by an AI image tool ({Array.from(new Set(images.flatMap((i) => i.aiMarkers))).join("; ")}). Listings need real photos of the item you have, so this one will be held for review.
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className="input" required minLength={3} maxLength={MAX_TITLE_LEN} value={form.title} onChange={set("title")} placeholder="Nintendo Switch OLED, white, with dock" />
        </div>
        <div>
          <label className="label" htmlFor="desc">Description</label>
          <textarea id="desc" className="input min-h-28" required minLength={10} maxLength={MAX_DESCRIPTION_LEN} value={form.description} onChange={set("description")} placeholder="Condition, what's included, any flaws…" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cat">Category</label>
            <select id="cat" className="input" value={form.category} onChange={set("category")}>
              {["Electronics", "Gaming", "Sneakers", "Collectibles", "Fashion", "Home", "Other"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cond">Condition</label>
            <select id="cond" className="input" value={form.condition} onChange={set("condition")}>
              {["new", "like new", "good", "fair", "for parts"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="price">Starting bid (USDC)</label>
            <input id="price" className="input" type="number" min={1} step="0.01" required value={form.startPrice} onChange={set("startPrice")} />
          </div>
          <div>
            <label className="label" htmlFor="dur">Duration</label>
            <select id="dur" className="input" value={form.duration} onChange={set("duration")}>
              {DURATIONS.map((d) => <option key={d.m} value={d.m}>{d.label}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          You&apos;ll post a refundable seller bond of about {usd(bond * 1e6)} USDC. You get it back when the sale completes or if nobody bids. It goes to the buyer if you don&apos;t ship.
        </p>
        {error && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        <button className="btn-primary w-full" disabled={!!busy || !publicKey}>
          {busy === "vetting" ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Agents are checking…</> : publicKey ? "Submit for vetting" : "Connect your wallet to sell"}
        </button>
      </form>

      <aside className="space-y-4">
        <div className="card space-y-3">
          <h2 className="font-semibold">Agent crew</h2>
          {trace.length === 0 ? <p className="text-sm text-slate-400">Listing Inspector, AI Image Detector, Price Sanity and Seller Risk run in parallel when you submit.</p> : <AgentTrace events={trace} />}
        </div>
        {result && decision && (
          <div className="card space-y-4">
            <div className="flex items-center gap-4">
              <TrustBadge score={result.listing.trust.score} size="lg" />
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Trust Score</div>
                <div className={`text-lg font-semibold ${decision.cls}`}>{decision.label}</div>
                {result.listing.trust.decision === "hold" && result.listing.status === "awaiting_signature" && <div className="text-sm text-emerald-300">A moderator approved it</div>}
              </div>
            </div>
            <ul className="list-disc space-y-1 ps-5 text-sm text-slate-300">
              {result.listing.trust.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
            {result.listing.trust.agents?.aiImage && <PhotoCheck r={result.listing.trust.agents.aiImage} />}
            {result.listing.status === "awaiting_signature" ? (
              <button onClick={goLive} disabled={!!busy} className="btn-primary w-full">
                {busy === "signing" ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Confirm in your wallet…</> : "Post bond & go live"}
              </button>
            ) : (
              <p className="text-sm text-slate-400">
                {held ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> A moderator is reviewing this listing. Keep this page open, or come back later.</span>
                ) : (
                  <>This listing can&apos;t go live. Try clearer photos of the actual item, or a realistic starting price. <Link href="/" className="text-brand underline">Back to auctions</Link></>
                )}
              </p>
            )}
            <p className="text-xs text-slate-500">Detection is probabilistic: the score combines risk signals and is not a verdict.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
