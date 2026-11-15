"use client";
import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { TrustBadge } from "@/components/TrustBadge";
import { PhotoCheck, type AiImage } from "@/components/PhotoCheck";
import { ArbiterQueue } from "@/components/ArbiterQueue";
import { short, usd } from "@/lib/format";

type Listing = { _id: string; seller: string; title: string; description: string; startPrice: number; images: string[]; status: string; trust?: { score: number; decision: string; reasons: string[]; agents?: { aiImage?: AiImage | null } }; moderation?: { action: string } };

/** Moderator queue: agents advise, a person decides on everything they held. */
export default function Admin() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<{ held: Listing[]; recent: Listing[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setToken(sessionStorage.getItem("bg-admin") ?? "");
    } catch {}
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const r = await fetch("/api/admin/listings", { headers: { "x-admin-token": token }, cache: "no-store" });
    const j = await r.json();
    if (!r.ok) return setError(j.error);
    setError("");
    setData(j);
    try {
      sessionStorage.setItem("bg-admin", token);
    } catch {}
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, action: "approve" | "reject") {
    const r = await fetch(`/api/admin/listings/${id}`, { method: "POST", headers: { "x-admin-token": token, "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!r.ok) setError((await r.json()).error);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-brand" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold">Moderation</h1>
          <p className="text-sm text-slate-400">The agents hold borderline listings and recommend dispute rulings. A person makes the final call.</p>
        </div>
      </div>
      {!data && (
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="card flex max-w-md gap-2">
          <input type="password" className="input" placeholder="Moderator token" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Moderator token" />
          <button className="btn-primary">Open</button>
        </form>
      )}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      {data && (
        <>
          <ArbiterQueue token={token} />
          <h2 className="text-lg font-semibold">Held for review ({data.held.length})</h2>
          {data.held.length === 0 && <p className="text-slate-400">Nothing waiting.</p>}
          <div className="space-y-3">
            {data.held.map((l) => (
              <div key={l._id} className="card flex flex-col gap-4 sm:flex-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {l.images[0] && <img src={`/api/images/${l.images[0]}`} alt="" className="h-32 w-32 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-3">
                    {l.trust && <TrustBadge score={l.trust.score} size="sm" />}
                    <h3 className="font-semibold">{l.title}</h3>
                  </div>
                  <p className="text-sm text-slate-400">{usd(l.startPrice)} start · seller {short(l.seller)}</p>
                  <p className="line-clamp-2 text-sm text-slate-300">{l.description}</p>
                  <ul className="list-disc ps-5 text-sm text-amber-200">{l.trust?.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  {l.trust?.agents?.aiImage && <PhotoCheck r={l.trust.agents.aiImage} />}
                </div>
                <div className="flex shrink-0 gap-2 sm:flex-col">
                  <button className="btn-primary" onClick={() => decide(l._id, "approve")}>Approve</button>
                  <button className="btn-danger" onClick={() => decide(l._id, "reject")}>Reject</button>
                </div>
              </div>
            ))}
          </div>
          <h2 className="text-lg font-semibold">Recent decisions</h2>
          <ul className="divide-y divide-slate-800 text-sm">
            {data.recent.map((l) => (
              <li key={l._id} className="flex justify-between gap-3 py-2">
                <span className="truncate">{l.title}</span>
                <span className="shrink-0 text-slate-400">Trust {l.trust?.score ?? "–"} · {l.moderation ? `moderator ${l.moderation.action}d` : (l.trust?.decision ?? "").replaceAll("_", " ")} · {l.status.replaceAll("_", " ")}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
