"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BN } from "@coral-xyz/anchor";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { MAX_TERMS_LEN, MAX_TITLE_LEN, USDC_MINT } from "@/lib/config";
import { toBaseUnits } from "@/lib/format";
import { createDealIx } from "@/lib/program";
import { friendlyError, useTrustlink } from "@/lib/useTrustlink";

const DEADLINES = [
  { days: 1, label: "24 hours" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
];

export default function Home() {
  const router = useRouter();
  const { program, wallet, send } = useTrustlink();
  const { setVisible } = useWalletModal();
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const bytes = (s: string) => new TextEncoder().encode(s).length;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet) return setVisible(true);
    setError("");
    setBusy(true);
    try {
      const amt = toBaseUnits(amount);
      if (amt.lten(0)) throw new Error("Enter an amount greater than zero");
      const { ix, deal } = await createDealIx(program, {
        seller: wallet.publicKey,
        mint: USDC_MINT,
        dealId: new BN(Date.now()),
        amount: amt,
        deadline: new BN(Math.floor(Date.now() / 1000) + days * 86400),
        title: title.trim(),
        terms: terms.trim(),
      });
      await send([ix]);
      router.push(`/deal/${deal.toBase58()}?created=1`);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
      <section className="pt-2">
        <p className="mb-3 inline-block rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
          Buyer protection for the 1-person business
        </p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Get paid safely.
          <br />
          <span className="bg-gradient-to-r from-brand to-violet-400 bg-clip-text text-transparent">
            Share a link, not your trust.
          </span>
        </h1>
        <p className="mt-5 max-w-lg text-lg text-slate-400">
          Create a payment link for any gig or order. The buyer&apos;s USDC is locked in a Solana escrow and
          released the moment they approve delivery. If something goes wrong, an AI arbitrator settles it in
          minutes, not weeks.
        </p>

        <ol className="mt-8 space-y-4">
          {[
            ["Create a deal", "Describe what you'll deliver and set the price in USDC."],
            ["Share the link", "Paste it in WhatsApp, Instagram, or X. Buyers can pay straight from a tweet with a Blink."],
            ["Deliver & get paid", "Funds release instantly on approval, or automatically if the buyer goes silent."],
          ].map(([h, p], i) => (
            <li key={h} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-brand">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{h}</p>
                <p className="text-sm text-slate-400">{p}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 grid max-w-lg grid-cols-3 gap-3 text-center">
          {[
            ["1%", "fee (vs 10–20%)"],
            ["<1s", "settlement"],
            ["$0.001", "per transaction"],
          ].map(([n, l]) => (
            <div key={l} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-xl font-bold text-white">{n}</p>
              <p className="text-xs text-slate-400">{l}</p>
            </div>
          ))}
        </div>
      </section>

      <form onSubmit={onSubmit} className="card space-y-5 shadow-2xl shadow-brand/5">
        <h2 className="text-lg font-semibold">Create a payment link</h2>
        <div>
          <label className="label" htmlFor="title">What are you selling?</label>
          <input
            id="title"
            className="input"
            placeholder="Logo design for a bakery"
            value={title}
            maxLength={MAX_TITLE_LEN}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="terms">What exactly will you deliver?</label>
          <textarea
            id="terms"
            className="input min-h-[96px] resize-y"
            placeholder="3 logo concepts, final files in SVG + PNG, 2 rounds of revisions."
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            required
          />
          <p className={`mt-1 text-xs ${bytes(terms) > MAX_TERMS_LEN ? "text-rose-400" : "text-slate-500"}`}>
            These terms are what the AI arbitrator judges against, so be specific. {bytes(terms)}/{MAX_TERMS_LEN}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="amount">Price</label>
            <div className="relative">
              <input
                id="amount"
                className="input pr-14"
                inputMode="decimal"
                placeholder="50"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                required
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                USDC
              </span>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="deadline">Deliver within</label>
            <select id="deadline" className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {DEADLINES.map((d) => (
                <option key={d.days} value={d.days}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
        <button
          type="submit"
          className="btn-primary w-full py-3"
          disabled={busy || bytes(terms) > MAX_TERMS_LEN}
        >
          {!wallet ? "Connect wallet to create" : busy ? "Creating escrow…" : "Create payment link"}
        </button>
        <p className="text-center text-xs text-slate-500">
          Costs ~0.01 SOL in refundable account rent. You keep 99% of every payment.
        </p>
      </form>
    </div>
  );
}
