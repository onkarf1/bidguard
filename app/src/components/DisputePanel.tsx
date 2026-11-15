"use client";
import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { ExternalLink, ImagePlus, Loader2, Scale, X } from "lucide-react";
import { explorerTx } from "@/lib/config";
import { short, usd } from "@/lib/format";
import { evidenceDigest, evidenceMessage, sha256Hex } from "@/lib/evidence";
import { prepareImage } from "@/lib/images";

export type Recommendation = { buyer_bps: number; confidence: number; outcome: string; summary: string; findings: string[]; note: string; model: string; evidenceCount: number; at: string };
type Evidence = { party: "buyer" | "seller"; wallet: string; statement: string; images: string[]; at: string };
type File = {
  chain: { status: string; buyer: string; seller: string; price: number; bond: number; reason: string; buyerBps: number; resolutionNote: string };
  evidence: Evidence[];
  recommendation: Recommendation | null;
  resolution: { buyerBps: number; note: string; tx: string; followedAi: boolean } | null;
};

const OUTCOME: Record<string, string> = { full_refund: "Full refund to the buyer", partial_refund: "Partial refund", seller_paid: "Seller gets paid" };

/** What a split means in money, matching the program's resolve_dispute payout rules. */
export function splitPreview(price: number, bond: number, buyerBps: number, feeBps = 250) {
  const toBuyer = Math.floor((price * buyerBps) / 10000);
  const sellerGross = price - toBuyer;
  const fee = Math.floor((sellerGross * feeBps) / 10000);
  const buyerWins = buyerBps * 2 >= 10000;
  return { buyer: toBuyer + (buyerWins ? bond : 0), seller: sellerGross - fee + (buyerWins ? 0 : bond), bondTo: buyerWins ? "buyer" : "seller" };
}

export function RecommendationCard({ r, price, bond }: { r: Recommendation; price: number; bond: number }) {
  const s = splitPreview(price, bond, r.buyer_bps);
  return (
    <div className="space-y-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Scale className="h-4 w-4 text-sky-300" aria-hidden />
        <span className="font-semibold text-sky-200">AI Judge recommends: {OUTCOME[r.outcome] ?? r.outcome}</span>
        <span className="ms-auto font-mono text-xs text-slate-400">confidence {Math.round(r.confidence * 100)}%</span>
      </div>
      <p className="text-slate-300">{r.summary}</p>
      {r.findings.length > 0 && <ul className="list-disc space-y-0.5 ps-5 text-slate-400">{r.findings.map((f) => <li key={f}>{f}</li>)}</ul>}
      <p className="text-slate-300">
        Buyer {usd(s.buyer)} · Seller {usd(s.seller)} <span className="text-slate-500">({r.buyer_bps / 100}% of the price refunded; bond goes to the {s.bondTo})</span>
      </p>
      <p className="text-xs text-slate-500">Advice only, based on {r.evidenceCount} statement{r.evidenceCount === 1 ? "" : "s"}. A human arbiter makes the final decision.</p>
    </div>
  );
}

export function DisputePanel({ auction, onChange }: { auction: string; onChange?: () => void }) {
  const { publicKey, signMessage } = useWallet();
  const [file, setFile] = useState<File | null>(null);
  const [statement, setStatement] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const me = publicKey?.toBase58();

  const load = useCallback(async () => {
    const r = await fetch(`/api/disputes/${auction}`, { cache: "no-store" });
    if (r.ok) setFile(await r.json());
  }, [auction]);
  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  if (!file) return null;
  const c = file.chain;
  const party = me === c.buyer ? "buyer" : me === c.seller ? "seller" : null;
  const open = c.status === "disputed";
  const mine = file.evidence.filter((e) => e.party === party).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicKey || !signMessage) return setErr("Your wallet can't sign messages");
    setBusy("submit");
    setErr("");
    try {
      const at = Math.floor(Date.now() / 1000);
      const digest = await evidenceDigest(statement.trim(), await Promise.all(photos.map(sha256Hex)));
      const sig = await signMessage(new TextEncoder().encode(evidenceMessage(auction, publicKey.toBase58(), digest, at)));
      const r = await fetch(`/api/disputes/${auction}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey.toBase58(), statement: statement.trim(), images: photos, at, signature: bs58.encode(sig) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setStatement("");
      setPhotos([]);
      await load();
      setBusy("judge");
      await fetch(`/api/disputes/${auction}/judge`, { method: "POST" });
      await load();
      onChange?.();
    } catch (e) {
      setErr(/reject/i.test(String(e)) ? "You cancelled in your wallet." : (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function askJudge() {
    setBusy("judge");
    setErr("");
    const r = await fetch(`/api/disputes/${auction}/judge`, { method: "POST" });
    if (!r.ok) setErr((await r.json()).error);
    await load();
    setBusy("");
  }

  return (
    <div className="card space-y-3">
      <h2 className="flex items-center gap-2 font-semibold"><Scale className="h-5 w-5 text-brand" aria-hidden /> Dispute</h2>
      <p className="text-sm text-slate-300">Buyer&apos;s complaint: “{c.reason}”</p>

      {file.evidence.length > 0 && (
        <ol className="space-y-2">
          {file.evidence.map((e, i) => (
            <li key={i} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">{e.party === party ? "You" : e.party} · {short(e.wallet)} · signed</div>
              <p className="whitespace-pre-wrap text-slate-200">{e.statement}</p>
              {e.images.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {e.images.map((id) => (
                    <a key={id} href={`/api/images/${id}`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/images/${id}`} alt={`Evidence from the ${e.party}`} className="h-16 w-16 rounded object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {file.resolution || c.status === "resolved" ? (
        <div className="space-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          <div className="font-semibold text-emerald-200">Resolved by the arbiter: {(file.resolution?.buyerBps ?? c.buyerBps) / 100}% refunded to the buyer</div>
          <p className="text-slate-300">{file.resolution?.note ?? c.resolutionNote}</p>
          {file.resolution && (
            <p className="text-xs text-slate-400">
              {file.resolution.followedAi ? "The arbiter followed the AI recommendation." : "The arbiter adjusted the AI recommendation."}{" "}
              <a className="inline-flex items-center gap-1 hover:text-brand" href={explorerTx(file.resolution.tx)} target="_blank" rel="noreferrer">On-chain ruling <ExternalLink className="h-3 w-3" aria-hidden /></a>
            </p>
          )}
        </div>
      ) : file.recommendation ? (
        <RecommendationCard r={file.recommendation} price={c.price} bond={c.bond} />
      ) : (
        <p className="text-sm text-slate-400">The AI Judge reviews the dispute once evidence is in. A human arbiter makes the final decision.</p>
      )}

      {open && party && mine < 3 && (
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor="ev" className="label">Your side, as the {party}</label>
          <textarea id="ev" className="input min-h-24" minLength={10} maxLength={1500} required value={statement} onChange={(e) => setStatement(e.target.value)}
            placeholder={party === "buyer" ? "What's wrong with the item? Photos of the problem help most." : "Your response. Photos of the item before shipping or the shipping receipt help most."} />
          <div className="flex flex-wrap items-center gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative h-14 w-14 overflow-hidden rounded border border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 rounded-full bg-slate-950/80 p-0.5" aria-label={`Remove photo ${i + 1}`}><X className="h-3 w-3" /></button>
              </div>
            ))}
            {photos.length < 3 && (
              <label className="grid h-14 w-14 cursor-pointer place-items-center rounded border border-dashed border-slate-600 text-slate-400 hover:border-brand">
                <ImagePlus className="h-5 w-5" aria-hidden /><span className="sr-only">Add photos</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []).slice(0, 3 - photos.length);
                  try { const ready = await Promise.all(files.map(prepareImage)); setPhotos((x) => [...x, ...ready.map((r) => r.dataUrl)].slice(0, 3)); } catch (er) { setErr((er as Error).message); }
                }} />
              </label>
            )}
            <button className="btn-primary ms-auto" disabled={!!busy || statement.trim().length < 10}>
              {busy === "submit" ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sign in wallet…</> : busy === "judge" ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> AI Judge reviewing…</> : "Sign & submit"}
            </button>
          </div>
          <p className="text-xs text-slate-500">Visible to the other party and the arbiter. Don&apos;t include your home address or other personal details.</p>
        </form>
      )}
      {open && !party && !file.recommendation && file.evidence.length > 0 && (
        <button className="btn-secondary" disabled={!!busy} onClick={askJudge}>{busy === "judge" ? "Reviewing…" : "Ask the AI Judge"}</button>
      )}
      {err && <p role="alert" className="text-sm text-rose-300">{err}</p>}
    </div>
  );
}
