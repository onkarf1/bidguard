"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { QRCodeSVG } from "qrcode.react";
import {
  APP_URL,
  DISPUTE_RESPONSE_SECS,
  MAX_NOTE_LEN,
  REVIEW_PERIOD_SECS,
  blinkUrl,
  explorerTx,
} from "@/lib/config";
import { formatDate, fromBaseUnits, shortKey, timeLeft } from "@/lib/format";
import {
  cancelDealIx,
  configPda,
  fundDealIx,
  profilePda,
  raiseDisputeIx,
  refundExpiredIx,
  releaseFundsIxs,
  respondDisputeIx,
  statusOf,
  submitDeliveryIx,
  type DealAccount,
  type DealStatus,
  type SellerProfileAccount,
} from "@/lib/program";
import { friendlyError, useTrustlink } from "@/lib/useTrustlink";

type Ruling = {
  buyer_refund_percent: number;
  ruling_summary: string;
  reasoning: string;
  confidence: "low" | "medium" | "high";
};

const STATUS_STYLE: Record<DealStatus, [string, string]> = {
  open: ["Awaiting payment", "bg-slate-700/60 text-slate-200"],
  funded: ["Paid · in escrow", "bg-sky-500/15 text-sky-300"],
  delivered: ["Delivered · awaiting approval", "bg-violet-500/15 text-violet-300"],
  disputed: ["In dispute", "bg-amber-500/15 text-amber-300"],
  completed: ["Completed", "bg-emerald-500/15 text-emerald-300"],
  refunded: ["Refunded", "bg-slate-600/40 text-slate-300"],
  resolved: ["Resolved by arbitrator", "bg-emerald-500/15 text-emerald-300"],
};

export function DealView({ address }: { address: string }) {
  const search = useSearchParams();
  const { program, wallet, send } = useTrustlink();
  const { setVisible } = useWalletModal();
  const dealKey = useMemo(() => {
    try {
      return new PublicKey(address);
    } catch {
      return null;
    }
  }, [address]);

  const [deal, setDeal] = useState<DealAccount | null | undefined>(undefined);
  const [profile, setProfile] = useState<SellerProfileAccount | null>(null);
  const [treasury, setTreasury] = useState<PublicKey | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [ruling, setRuling] = useState<Ruling | null>(null);

  const refresh = useCallback(async () => {
    if (!dealKey) return setDeal(null);
    const d = await program.account.deal.fetchNullable(dealKey);
    setDeal(d);
    if (d) setProfile(await program.account.sellerProfile.fetchNullable(profilePda(d.seller)));
  }, [program, dealKey]);

  useEffect(() => {
    refresh();
    program.account.config.fetchNullable(configPda()).then((c) => setTreasury(c?.treasury ?? null));
    const poll = setInterval(refresh, 6000);
    const tick = setInterval(() => setNow(Date.now() / 1000), 15000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh, program]);

  if (deal === undefined) return <p className="text-slate-400">Loading deal…</p>;
  if (!deal || !dealKey)
    return (
      <div className="card text-center">
        <p className="text-lg font-semibold">Deal not found</p>
        <p className="mt-1 text-sm text-slate-400">It may have been cancelled by the seller, or the link is wrong.</p>
      </div>
    );

  const status = statusOf(deal);
  const me = wallet?.publicKey;
  const isSeller = !!me && me.equals(deal.seller);
  const isBuyer = !!me && !deal.buyer.equals(PublicKey.default) && me.equals(deal.buyer);
  const amount = fromBaseUnits(deal.amount);
  const deadline = deal.deliveryDeadline.toNumber();
  const reviewEnds = deal.deliveredAt.toNumber() + REVIEW_PERIOD_SECS;
  const responseEnds = deal.disputedAt.toNumber() + DISPUTE_RESPONSE_SECS;
  const raisedByBuyer = deal.disputedBy.equals(deal.buyer);
  const canRespond =
    status === "disputed" && !deal.disputeResponse && (isBuyer || isSeller) && !me!.equals(deal.disputedBy);
  const arbitrationReady = status === "disputed" && (!!deal.disputeResponse || now >= responseEnds);
  const noteBytes = new TextEncoder().encode(note).length;

  async function run(label: string, fn: () => Promise<string | void>) {
    setError("");
    setBusy(label);
    try {
      const sig = await fn();
      if (sig) setLastTx(sig);
      setNote("");
      await refresh();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  const act = {
    pay: () => run("pay", async () => send([await fundDealIx(program, dealKey, deal, me!)])),
    cancel: () => run("cancel", async () => send([await cancelDealIx(program, dealKey, me!)])),
    deliver: () => run("deliver", async () => send([await submitDeliveryIx(program, dealKey, me!, note.trim())])),
    release: () =>
      run("release", async () => send(await releaseFundsIxs(program, dealKey, deal, me!, treasury!))),
    refund: () => run("refund", async () => send([await refundExpiredIx(program, dealKey, deal)])),
    dispute: () => run("dispute", async () => send([await raiseDisputeIx(program, dealKey, me!, note.trim())])),
    respond: () => run("respond", async () => send([await respondDisputeIx(program, dealKey, me!, note.trim())])),
    arbitrate: () =>
      run("arbitrate", async () => {
        const res = await fetch("/api/arbitrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal: dealKey.toBase58() }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setRuling(body.ruling);
        return body.signature;
      }),
  };

  const B = (props: { id: string; onClick: () => void; kind?: string; disabled?: boolean; children: React.ReactNode }) => (
    <button
      className={props.kind ?? "btn-primary"}
      onClick={props.onClick}
      disabled={!!busy || props.disabled}
    >
      {busy === props.id ? "Confirm in wallet…" : props.children}
    </button>
  );

  const noteBox = (placeholder: string) => (
    <div>
      <textarea
        className="input min-h-[80px]"
        placeholder={placeholder}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <p className={`mt-1 text-right text-xs ${noteBytes > MAX_NOTE_LEN ? "text-rose-400" : "text-slate-500"}`}>
        {noteBytes}/{MAX_NOTE_LEN}
      </p>
    </div>
  );
  const noteOk = note.trim().length > 0 && noteBytes <= MAX_NOTE_LEN;

  // ── what can the connected wallet do right now? ──
  let actions: React.ReactNode = null;
  if (!me && ["open", "funded", "delivered", "disputed"].includes(status)) {
    actions = (
      <button className="btn-primary w-full" onClick={() => setVisible(true)}>
        Connect wallet {status === "open" ? `to pay ${amount} USDC` : "to continue"}
      </button>
    );
  } else if (status === "open") {
    actions = isSeller ? (
      <div className="space-y-3">
        <p className="text-sm text-slate-400">Share the link below with your buyer. You can cancel until they pay.</p>
        <B id="cancel" kind="btn-danger" onClick={act.cancel}>Cancel deal</B>
      </div>
    ) : (
      <div className="space-y-3">
        <B id="pay" onClick={act.pay} disabled={now >= deadline}>Pay {amount} USDC into escrow</B>
        <p className="text-xs text-slate-500">
          Your money is locked in a Solana program — not sent to the seller — until you approve the delivery.
        </p>
      </div>
    );
  } else if (status === "funded" || status === "delivered") {
    if (isSeller) {
      actions = (
        <div className="space-y-3">
          {status === "funded" ? (
            <>
              {noteBox("Link to the files, tracking number, or a note on what you delivered")}
              <div className="flex flex-wrap gap-2">
                <B id="deliver" onClick={act.deliver} disabled={!noteOk}>Mark as delivered</B>
                <B id="dispute" kind="btn-danger" onClick={act.dispute} disabled={!noteOk}>Raise dispute instead</B>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-400">
                Waiting for the buyer to approve. If they don&apos;t respond, you can claim payment after the review
                period ({timeLeft(reviewEnds)}).
              </p>
              <B id="release" onClick={act.release} disabled={now < reviewEnds}>Claim payment</B>
            </>
          )}
        </div>
      );
    } else if (isBuyer) {
      actions = (
        <div className="space-y-3">
          <B id="release" onClick={act.release}>Approve & release {amount} USDC</B>
          {status === "funded" && now > deadline && (
            <B id="refund" kind="btn-secondary" onClick={act.refund}>Deadline passed — get a full refund</B>
          )}
          <details className="rounded-lg border border-slate-800 p-3">
            <summary className="cursor-pointer text-sm text-slate-300">Something wrong? Open a dispute</summary>
            <div className="mt-3 space-y-2">
              {noteBox("What's wrong? Be specific — the arbitrator will compare this against the agreed terms.")}
              <B id="dispute" kind="btn-danger" onClick={act.dispute} disabled={!noteOk}>Raise dispute</B>
            </div>
          </details>
        </div>
      );
    } else {
      actions = <p className="text-sm text-slate-400">This deal is between {shortKey(deal.seller)} and {shortKey(deal.buyer)}.</p>;
    }
  } else if (status === "disputed") {
    actions = (
      <div className="space-y-3">
        {canRespond && (
          <>
            <p className="text-sm text-slate-300">Tell your side of the story before the arbitrator decides.</p>
            {noteBox("Your response to the dispute")}
            <B id="respond" onClick={act.respond} disabled={!noteOk}>Submit response</B>
          </>
        )}
        <B id="arbitrate" kind={canRespond ? "btn-secondary" : "btn-primary"} onClick={act.arbitrate} disabled={!arbitrationReady}>
          {busy === "arbitrate" ? "AI arbitrator is reviewing the evidence…" : "⚖️ Run AI arbitration"}
        </B>
        {!arbitrationReady && (
          <p className="text-xs text-slate-500">
            Arbitration unlocks once the other party responds, or in {timeLeft(responseEnds).replace(" left", "")}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        {search.get("created") && status === "open" && (
          <div className="rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-sm text-teal-200">
            🎉 Your escrow is live. Share the payment link with your buyer.
          </div>
        )}

        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-400">Deal</p>
              <h1 className="text-2xl font-bold">{deal.title}</h1>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status][1]}`}>
              {STATUS_STYLE[status][0]}
            </span>
          </div>
          <p className="mt-4 text-4xl font-bold">
            {amount} <span className="text-lg font-medium text-slate-400">USDC</span>
          </p>
          <div className="mt-4 rounded-xl bg-slate-950/60 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Agreed deliverables</p>
            <p className="whitespace-pre-wrap text-slate-200">{deal.terms}</p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Seller</dt>
              <dd className="font-mono">{shortKey(deal.seller)} {isSeller && <span className="text-brand">(you)</span>}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Buyer</dt>
              <dd className="font-mono">
                {deal.buyer.equals(PublicKey.default) ? "—" : shortKey(deal.buyer)}{" "}
                {isBuyer && <span className="text-brand">(you)</span>}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Delivery deadline</dt>
              <dd>
                {formatDate(deadline)}
                {["open", "funded"].includes(status) && <span className="ml-1 text-slate-500">({timeLeft(deadline)})</span>}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Escrow</dt>
              <dd className="font-mono">{shortKey(dealKey)}</dd>
            </div>
          </dl>
        </section>

        {(deal.deliveryNote || deal.disputeReason || deal.resolutionNote) && (
          <section className="card space-y-4">
            <h2 className="font-semibold">Activity</h2>
            {deal.deliveryNote && (
              <Entry who="Seller delivered" when={deal.deliveredAt.toNumber()} text={deal.deliveryNote} tone="violet" />
            )}
            {deal.disputeReason && (
              <Entry
                who={`${raisedByBuyer ? "Buyer" : "Seller"} opened a dispute`}
                when={deal.disputedAt.toNumber()}
                text={deal.disputeReason}
                tone="amber"
              />
            )}
            {deal.disputeResponse && (
              <Entry who={`${raisedByBuyer ? "Seller" : "Buyer"} responded`} text={deal.disputeResponse} tone="slate" />
            )}
            {deal.resolutionNote && (
              <Entry
                who={`Settled: ${deal.buyerBps / 100}% to buyer, ${100 - deal.buyerBps / 100}% to seller`}
                text={deal.resolutionNote}
                tone="emerald"
              />
            )}
          </section>
        )}

        {ruling && (
          <section className="card border-emerald-500/30">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-300">AI arbitrator ruling</p>
            <p className="mt-2 text-lg font-semibold">{ruling.ruling_summary}</p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-sky-400" style={{ width: `${ruling.buyer_refund_percent}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>Buyer {ruling.buyer_refund_percent}%</span>
              <span>Seller {100 - ruling.buyer_refund_percent}%</span>
            </div>
            <p className="mt-4 text-sm text-slate-300">{ruling.reasoning}</p>
            <p className="mt-2 text-xs text-slate-500">Confidence: {ruling.confidence}</p>
          </section>
        )}
      </div>

      <aside className="space-y-6">
        {actions && (
          <section className="card space-y-3">
            <h2 className="font-semibold">Next step</h2>
            {actions}
            {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
            {lastTx && (
              <a href={explorerTx(lastTx)} target="_blank" rel="noreferrer" className="block text-xs text-brand hover:underline">
                View last transaction ↗
              </a>
            )}
          </section>
        )}

        {status === "open" && <ShareCard address={dealKey.toBase58()} />}

        <section className="card">
          <h2 className="mb-3 font-semibold">Seller reputation</h2>
          {profile ? (
            <div className="grid grid-cols-2 gap-3 text-center">
              <Stat n={profile.dealsCompleted.toNumber()} l="completed" />
              <Stat n={`${fromBaseUnits(profile.totalVolume)}`} l="USDC earned" />
              <Stat n={profile.disputesWon.toNumber()} l="disputes won" />
              <Stat n={profile.disputesLost.toNumber() + profile.dealsRefunded.toNumber()} l="lost / refunded" />
            </div>
          ) : (
            <p className="text-sm text-slate-400">New seller</p>
          )}
          <p className="mt-3 text-xs text-slate-500">Recorded on-chain by the escrow program. Can&apos;t be faked or deleted.</p>
        </section>
      </aside>
    </div>
  );
}

function Entry({ who, when, text, tone }: { who: string; when?: number; text: string; tone: string }) {
  const border = {
    violet: "border-violet-400",
    amber: "border-amber-400",
    slate: "border-slate-500",
    emerald: "border-emerald-400",
  }[tone];
  return (
    <div className={`border-l-2 ${border} pl-3`}>
      <p className="text-sm font-medium">
        {who}
        {when ? <span className="ml-2 font-normal text-slate-500">{formatDate(when)}</span> : null}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-300">{text}</p>
    </div>
  );
}

function Stat({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="rounded-xl bg-slate-950/60 p-3">
      <p className="text-xl font-bold">{n}</p>
      <p className="text-xs text-slate-400">{l}</p>
    </div>
  );
}

function ShareCard({ address }: { address: string }) {
  const link = `${APP_URL}/deal/${address}`;
  const blink = blinkUrl(address);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (what: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">Share with your buyer</h2>
      <div className="flex justify-center rounded-xl bg-white p-4">
        <QRCodeSVG value={link} size={160} />
      </div>
      <div className="space-y-2">
        <button className="btn-secondary w-full" onClick={() => copy("link", link)}>
          {copied === "link" ? "Copied!" : "Copy payment link"}
        </button>
        <button className="btn-secondary w-full" onClick={() => copy("blink", blink)}>
          {copied === "blink" ? "Copied!" : "Copy Blink (pay from X / Discord)"}
        </button>
        <a
          className="btn-secondary w-full"
          href={`https://wa.me/?text=${encodeURIComponent(`Pay securely via TrustLink escrow: ${link}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          Share on WhatsApp
        </a>
      </div>
    </section>
  );
}
