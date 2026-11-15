"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Gavel, Loader2, Scale } from "lucide-react";
import { RecommendationCard, splitPreview, type Recommendation } from "./DisputePanel";
import { explorerTx } from "@/lib/config";
import { short, usd } from "@/lib/format";

type Dispute = {
  id: string; title: string; image: string | null; status: string; buyer: string; seller: string; price: number; bond: number; reason: string; deliveredAt: number;
  evidence: { party: string; wallet: string; statement: string; images: string[] }[];
  recommendation: Recommendation | null;
  resolution: { buyerBps: number; note: string; tx: string; followedAi: boolean } | null;
};

/** The human arbiter: reads the evidence and the AI Judge's advice, then executes a ruling on-chain. */
export function ArbiterQueue({ token }: { token: string }) {
  const [data, setData] = useState<{ open: Dispute[]; resolved: Dispute[] } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/disputes", { headers: { "x-admin-token": token }, cache: "no-store" });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    setData(j);
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Scale className="h-5 w-5 text-brand" aria-hidden /> Disputes ({data?.open.length ?? "…"})</h2>
      {err && <p role="alert" className="text-rose-300">{err}</p>}
      {data && data.open.length === 0 && <p className="text-slate-400">No open disputes.</p>}
      {data?.open.map((d) => <DisputeCase key={d.id} d={d} token={token} onDone={load} />)}
      {data && data.resolved.length > 0 && (
        <ul className="divide-y divide-slate-800 text-sm">
          {data.resolved.map((d) => (
            <li key={d.id} className="flex justify-between gap-3 py-2">
              <Link href={`/auction/${d.id}`} className="truncate hover:text-brand">{d.title}</Link>
              <span className="shrink-0 text-slate-400">
                {d.resolution ? `${d.resolution.buyerBps / 100}% refunded · ${d.resolution.followedAi ? "followed AI" : "adjusted AI"}` : "resolved"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DisputeCase({ d, token, onDone }: { d: Dispute; token: string; onDone: () => void }) {
  const [bps, setBps] = useState(d.recommendation?.buyer_bps ?? 5000);
  const [note, setNote] = useState(d.recommendation?.note ?? "");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [rec, setRec] = useState(d.recommendation);
  const s = splitPreview(d.price, d.bond, bps);

  async function rejudge() {
    setBusy("judge");
    const r = await fetch(`/api/disputes/${d.id}/judge`, { method: "POST", headers: { "x-admin-token": token } });
    const j = await r.json();
    if (r.ok) {
      setRec(j.recommendation);
      setBps(j.recommendation.buyer_bps);
      setNote(j.recommendation.note);
    } else setMsg(j.error);
    setBusy("");
  }
  async function execute() {
    if (!confirm(`Execute on-chain: buyer gets ${usd(s.buyer)}, seller gets ${usd(s.seller)}. This can't be undone.`)) return;
    setBusy("exec");
    setMsg("");
    const r = await fetch(`/api/admin/disputes/${d.id}/resolve`, { method: "POST", headers: { "x-admin-token": token, "Content-Type": "application/json" }, body: JSON.stringify({ buyerBps: bps, note }) });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setMsg(j.error);
    setMsg(`Executed: ${explorerTx(j.resolution.tx)}`);
    onDone();
  }

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {d.image && <img src={`/api/images/${d.image}`} alt="" className="h-14 w-14 rounded-lg object-cover" />}
        <div className="min-w-0">
          <Link href={`/auction/${d.id}`} className="font-semibold hover:text-brand">{d.title}</Link>
          <p className="text-sm text-slate-400">{usd(d.price)} in escrow · bond {usd(d.bond)} · buyer {short(d.buyer)} · seller {short(d.seller)} · {d.deliveredAt ? "carrier: delivered" : "no delivery scan"}</p>
        </div>
      </div>
      <p className="text-sm">Complaint: “{d.reason}”</p>
      {d.evidence.map((e, i) => (
        <div key={i} className="rounded-lg border border-slate-800 p-2.5 text-sm">
          <span className="text-xs uppercase text-slate-400">{e.party}</span>
          <p className="text-slate-200">{e.statement}</p>
          {e.images.length > 0 && <div className="mt-1 flex gap-2">{e.images.map((id) => <a key={id} href={`/api/images/${id}`} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/images/${id}`} alt="" className="h-14 w-14 rounded object-cover" /></a>)}</div>}
        </div>
      ))}
      {rec ? <RecommendationCard r={rec} price={d.price} bond={d.bond} /> : <p className="text-sm text-slate-400">No AI recommendation yet.</p>}
      <button className="btn-secondary" onClick={rejudge} disabled={!!busy}>{busy === "judge" ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Judging…</> : rec ? "Re-run AI Judge" : "Run AI Judge"}</button>

      <div className="space-y-2 rounded-lg border border-slate-700 p-3">
        <label htmlFor={`bps-${d.id}`} className="label">Your ruling: refund {bps / 100}% of the price to the buyer {rec && rec.buyer_bps !== bps && <span className="text-amber-300">(AI said {rec.buyer_bps / 100}%)</span>}</label>
        <input id={`bps-${d.id}`} type="range" min={0} max={10000} step={500} value={bps} onChange={(e) => setBps(Number(e.target.value))} className="w-full accent-amber-400" />
        <p className="text-sm text-slate-300">Buyer gets {usd(s.buyer)} · Seller gets {usd(s.seller)} · bond to the {s.bondTo}</p>
        <input className="input" maxLength={400} placeholder="Public ruling note (stored on-chain)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Ruling note" />
        <button className="btn-primary" onClick={execute} disabled={!!busy || note.trim().length < 3}>
          {busy === "exec" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Gavel className="h-4 w-4" aria-hidden />} Execute ruling on-chain
        </button>
      </div>
      {msg && <p className="break-all text-sm text-slate-300">{msg.startsWith("Executed") ? <a href={msg.slice(10)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-300">Ruling executed on-chain <ExternalLink className="h-3 w-3" aria-hidden /></a> : msg}</p>}
    </div>
  );
}
