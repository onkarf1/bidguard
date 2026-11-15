"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { Bot, ExternalLink, Gavel, Loader2, Timer } from "lucide-react";
import { Countdown } from "@/components/Countdown";
import { TrustBadge } from "@/components/TrustBadge";
import { PhotoCheck, type AiImage } from "@/components/PhotoCheck";
import { friendlyError, useBidguard } from "@/lib/useBidguard";
import { BID_VALIDITY_SECS, MAX_NOTE_LEN, MAX_TRACKING_LEN, explorerAddress, explorerTx } from "@/lib/config";
import { fromBaseUnits, short, toBaseUnits, usd } from "@/lib/format";
import { finalizeIxs, markShippedIx, raiseDisputeIx } from "@/lib/program";

type Room = {
  auction: { _id: string; seller: string; title: string; trustScore: number; startPrice: number; minNext: number; endsAt: string; currentBid: number | null; currentBidder: string | null; bidCount: number; extensions: number; status: string; settleTx?: string };
  listing: { title: string; description: string; category: string; condition: string; images: string[]; trust?: { score: number; decision: string; reasons: string[]; agents?: { price?: { expected_low_usd: number; expected_high_usd: number }; aiImage?: AiImage | null } } } | null;
  bids: { _id: string; bidder: string; amount: number; at: string; signer: string }[];
  escrow: { status: string; buyer: string; price: number; bond: number; tracking: string; settledAt: number; shippedAt: number; deliveredAt: number; disputeReason: string; resolutionNote: string; buyerBps: number } | null;
  seller: { sales: number; disputesLost: number; failedShipments: number; auctions: number } | null;
  now: number;
};
type Feed = { id: string; text: string; tone: "bid" | "info" | "warn" };

const ESCROW_LABEL: Record<string, string> = {
  funded: "Paid: waiting for the seller to ship",
  shipped: "Shipped: on its way",
  delivered: "Delivered: buyer review window open",
  disputed: "In dispute",
  released: "Complete: paid out to the seller",
  refunded: "Refunded to the buyer",
  resolved: "Dispute resolved",
  cancelled: "Closed without a sale",
};

export default function AuctionRoom({ params }: { params: { id: string } }) {
  const id = params.id;
  const { publicKey } = useWallet();
  const { program, send, signBid } = useBidguard();
  const [room, setRoom] = useState<Room | null>(null);
  const [offset, setOffset] = useState(0);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [flash, setFlash] = useState(0);
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState(0);
  const me = publicKey?.toBase58();

  const load = useCallback(async () => {
    const r = await fetch(`/api/auctions/${id}`, { cache: "no-store" });
    if (!r.ok) return setRoom(null);
    const j: Room = await r.json();
    setRoom(j);
    setOffset(j.now - Date.now());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates over Server-Sent Events.
  const meRef = useRef(me);
  meRef.current = me;
  useEffect(() => {
    const es = new EventSource(`/api/auctions/${id}/stream`);
    const push = (f: Feed) => setFeed((cur) => [f, ...cur].slice(0, 30));
    es.addEventListener("bid_placed", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setRoom((r) => (r ? { ...r, auction: { ...r.auction, currentBid: d.amount, currentBidder: d.bidder, bidCount: d.bidCount, endsAt: d.endsAt, minNext: d.minNext } } : r));
      setFlash((n) => n + 1);
      push({ id: (e as MessageEvent).lastEventId, text: `${d.bidder === meRef.current ? "You" : short(d.bidder)} bid ${usd(d.amount)}${d.byAgent ? " (via agent)" : ""}`, tone: "bid" });
      load();
    });
    es.addEventListener("outbid", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      if (d.bidder === meRef.current) setMsg({ tone: "err", text: `You've been outbid at ${usd(d.amount)}.` });
    });
    es.addEventListener("timer_extended", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setRoom((r) => (r ? { ...r, auction: { ...r.auction, endsAt: d.endsAt, extensions: d.extensions } } : r));
      push({ id: (e as MessageEvent).lastEventId, text: "Late bid: clock extended by 30 seconds", tone: "warn" });
    });
    es.addEventListener("auction_closed", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      push({ id: (e as MessageEvent).lastEventId, text: d.winner ? `Sold to ${d.winner === meRef.current ? "you" : short(d.winner)} for ${usd(d.amount)}` : "Ended with no bids", tone: "info" });
      load();
    });
    return () => es.close();
  }, [id, load]);

  const a = room?.auction;
  const live = a && (a.status === "live" || a.status === "closing");
  const minNext = a ? fromBaseUnits(a.minNext) : 0;
  useEffect(() => {
    if (a && (!amount || Number(amount) < minNext)) setAmount(String(minNext));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.minNext]);

  async function bid(e: React.FormEvent) {
    e.preventDefault();
    if (!a) return;
    setMsg(null);
    setBusy("bid");
    try {
      const amt = toBaseUnits(Number(amount));
      const expiry = Math.floor(new Date(a.endsAt).getTime() / 1000) + BID_VALIDITY_SECS;
      const signed = await signBid(a._id, amt, expiry);
      const r = await fetch(`/api/auctions/${a._id}/bids`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(signed) });
      const j = await r.json();
      if (!r.ok) {
        if (j.minNext) setAmount(String(fromBaseUnits(j.minNext)));
        throw new Error(j.error);
      }
      setMsg({ tone: "ok", text: j.extended ? "You're the top bidder. The clock was extended." : "You're the top bidder." });
    } catch (e) {
      setMsg({ tone: "err", text: friendlyError(e) });
    } finally {
      setBusy("");
    }
  }

  async function act(name: string, run: () => Promise<unknown>) {
    setBusy(name);
    setMsg(null);
    try {
      await run();
      await new Promise((r) => setTimeout(r, 800));
      await load();
    } catch (e) {
      setMsg({ tone: "err", text: friendlyError(e) });
    } finally {
      setBusy("");
    }
  }
  const auctionKey = a ? new PublicKey(a._id) : null;
  const ship = () => act("ship", async () => send([await markShippedIx(program, publicKey!, auctionKey!, tracking.trim())]));
  const carrier = () =>
    act("carrier", async () => {
      const r = await fetch(`/api/escrow/${a!._id}/carrier`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsg({ tone: "ok", text: `${j.tracking.carrier} reports the package as delivered.` });
    });
  const confirm = () => act("confirm", async () => send(await finalizeIxs(program, "confirmDelivery", auctionKey!, publicKey!)));
  const release = () => act("release", async () => send(await finalizeIxs(program, "releaseAfterTimeout", auctionKey!, publicKey!)));
  const refund = () => act("refund", async () => send(await finalizeIxs(program, "refundUnshipped", auctionKey!, publicKey!)));
  const dispute = () => act("dispute", async () => send([await raiseDisputeIx(program, publicKey!, auctionKey!, reason.trim())]));

  if (room === null) return <p className="text-slate-400">Loading auction… <Link href="/" className="text-brand underline">Back</Link></p>;
  if (!a || !room.listing) return <p>Auction not found.</p>;
  const L = room.listing;
  const esc = room.escrow;
  const isSeller = me === a.seller;
  const isBuyer = !!esc && me === esc.buyer;
  const leading = me && a.currentBidder === me;
  const fair = L.trust?.agents?.price;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {L.images[photo] && <img src={`/api/images/${L.images[photo]}`} alt={L.title} className="aspect-[4/3] w-full object-contain" />}
        </div>
        {L.images.length > 1 && (
          <div className="flex gap-2">
            {L.images.map((img, i) => (
              <button key={img} onClick={() => setPhoto(i)} className={`h-16 w-16 overflow-hidden rounded-lg border ${i === photo ? "border-brand" : "border-slate-700"}`} aria-label={`Photo ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/images/${img}`} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="card space-y-2">
          <h1 className="text-2xl font-bold">{L.title}</h1>
          <p className="text-sm text-slate-400">{L.category} · {L.condition}</p>
          <p className="whitespace-pre-wrap text-slate-300">{L.description}</p>
        </div>
        {L.trust && (
          <div className="card space-y-3">
            <div className="flex items-center gap-4">
              <TrustBadge score={L.trust.score} size="lg" />
              <div>
                <h2 className="font-semibold">Trust report</h2>
                <p className="text-sm text-slate-400">From the agent crew when this listing was submitted.</p>
              </div>
            </div>
            <ul className="list-disc space-y-1 ps-5 text-sm text-slate-300">{L.trust.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            {L.trust.agents?.aiImage && <PhotoCheck r={L.trust.agents.aiImage} />}
            {fair && fair.expected_high_usd > 0 && <p className="text-sm text-slate-400">Estimated fair value: ${fair.expected_low_usd}–${fair.expected_high_usd}</p>}
            <p className="text-sm text-slate-400">
              Seller <a className="text-brand underline" href={explorerAddress(a.seller)} target="_blank" rel="noreferrer">{short(a.seller)}</a>
              {room.seller && ` · ${room.seller.sales} completed sale${room.seller.sales === 1 ? "" : "s"} · ${room.seller.disputesLost + room.seller.failedShipments} problem${room.seller.disputesLost + room.seller.failedShipments === 1 ? "" : "s"} on record`}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${live ? "bg-rose-500 text-white" : "bg-slate-800 text-slate-300"}`}>{live ? "Live" : a.status === "settled" ? "Sold" : a.status === "unsold" ? "No sale" : "Ended"}</span>
            {live && (
              <span className="flex items-center gap-1.5 text-2xl font-semibold">
                <Timer className="h-5 w-5 text-slate-400" aria-hidden /> <Countdown endsAt={a.endsAt} offset={offset} />
              </span>
            )}
          </div>
          <div key={flash} className={`rounded-xl p-3 ${flash ? "flash" : ""}`}>
            <div className="text-sm text-slate-400">{a.currentBid ? `Current bid · ${a.bidCount} bid${a.bidCount === 1 ? "" : "s"}` : "Starting bid"}</div>
            <div className="text-4xl font-bold text-brand" aria-live="polite">{usd(a.currentBid ?? a.startPrice)}</div>
            {a.currentBidder && <div className="text-sm text-slate-400">{leading ? "You're winning" : `Top bidder ${short(a.currentBidder)}`}</div>}
            {a.extensions > 0 && live && <div className="text-xs text-amber-300">Extended {a.extensions}× by late bids</div>}
          </div>

          {live && !isSeller && (
            <form onSubmit={bid} className="space-y-2">
              <label htmlFor="amt" className="label">Your bid (min {usd(a.minNext)})</label>
              <div className="flex gap-2">
                <input id="amt" type="number" step="0.01" min={minNext} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button className="btn-primary shrink-0" disabled={!publicKey || !!busy}>
                  {busy === "bid" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Gavel className="h-4 w-4" aria-hidden />} Bid
                </button>
              </div>
              <div className="flex gap-2">
                {[0, 1, 4].map((k) => {
                  const v = fromBaseUnits(a.minNext + k * (a.minNext - (a.currentBid ?? a.minNext - toBaseUnits(1))));
                  return <button key={k} type="button" onClick={() => setAmount(v.toFixed(2))} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs hover:border-brand">${v.toFixed(2)}</button>;
                })}
              </div>
              <p className="text-xs text-slate-400">
                {publicKey ? <>Bids are signed in your wallet (no fee) and backed by your <Link href="/vault" className="text-brand underline">Bid Vault</Link>.</> : "Connect your wallet to bid."} A bid in the last 30 seconds adds 30 seconds.
              </p>
            </form>
          )}
          {live && isSeller && <p className="text-sm text-slate-400">This is your auction. Share the link!</p>}
          {msg && <p role="status" className={`rounded-lg p-3 text-sm ${msg.tone === "ok" ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/10 text-rose-200"}`}>{msg.text}</p>}
          {a.settleTx && (
            <a href={explorerTx(a.settleTx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-brand">
              {a.status === "settled" ? "Settlement" : "Closing"} transaction <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
        </div>

        {esc && esc.status !== "live" && esc.status !== "cancelled" && (
          <div className="card space-y-3">
            <h2 className="font-semibold">Escrow</h2>
            <p className="text-sm"><span className="text-slate-400">Status:</span> {ESCROW_LABEL[esc.status] ?? esc.status}</p>
            <p className="text-sm text-slate-400">{usd(esc.price)} held · seller bond {usd(esc.bond)}{esc.tracking && ` · tracking ${esc.tracking}`}</p>
            {esc.disputeReason && <p className="text-sm text-slate-300">Dispute: “{esc.disputeReason}”</p>}
            {esc.resolutionNote && <p className="text-sm text-slate-300">Resolution: {esc.resolutionNote}</p>}

            {isSeller && esc.status === "funded" && (
              <div className="flex gap-2">
                <input className="input" placeholder="Tracking number" maxLength={MAX_TRACKING_LEN} value={tracking} onChange={(e) => setTracking(e.target.value)} />
                <button className="btn-primary shrink-0" disabled={!tracking.trim() || !!busy} onClick={ship}>{busy === "ship" ? "…" : "Mark shipped"}</button>
              </div>
            )}
            {esc.status === "shipped" && (isSeller || isBuyer) && (
              <button className="btn-secondary w-full" disabled={!!busy} onClick={carrier}>{busy === "carrier" ? "Checking carrier…" : "Check carrier tracking"}</button>
            )}
            {isBuyer && (esc.status === "shipped" || esc.status === "delivered") && (
              <div className="space-y-2">
                <button className="btn-primary w-full" disabled={!!busy} onClick={confirm}>{busy === "confirm" ? "…" : "I got it: release payment"}</button>
                <textarea className="input" placeholder="Something wrong? Describe the problem" maxLength={MAX_NOTE_LEN} value={reason} onChange={(e) => setReason(e.target.value)} />
                <button className="btn-danger w-full" disabled={!reason.trim() || !!busy} onClick={dispute}>{busy === "dispute" ? "…" : "Open a dispute"}</button>
              </div>
            )}
            {isBuyer && esc.status === "funded" && (
              <button className="btn-secondary w-full" disabled={!!busy} onClick={refund}>{busy === "refund" ? "…" : "Seller didn't ship in time: refund me + bond"}</button>
            )}
            {isSeller && esc.status === "delivered" && (
              <button className="btn-secondary w-full" disabled={!!busy} onClick={release}>{busy === "release" ? "…" : "Review window over: release to me"}</button>
            )}
          </div>
        )}

        <div className="card space-y-2">
          <h2 className="font-semibold">Activity</h2>
          <ol className="space-y-1.5 text-sm" aria-live="polite">
            {feed.map((f) => <li key={f.id} className={f.tone === "warn" ? "text-amber-300" : f.tone === "info" ? "text-emerald-300" : "text-slate-200"}>{f.text}</li>)}
            {room.bids.filter((b) => !feed.length).map((b) => (
              <li key={b._id} className="flex justify-between text-slate-300">
                <span>{b.bidder === me ? "You" : short(b.bidder)}{b.signer !== b.bidder && <Bot className="ms-1 inline h-3.5 w-3.5 text-brand" aria-label="via agent" />}</span>
                <span className="font-mono">{usd(b.amount)}</span>
              </li>
            ))}
            {room.bids.length === 0 && feed.length === 0 && <li className="text-slate-500">No bids yet.</li>}
          </ol>
        </div>
      </div>
    </div>
  );
}
