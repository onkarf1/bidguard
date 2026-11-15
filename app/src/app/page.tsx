"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Gavel, ShieldCheck, Vault } from "lucide-react";
import { AuctionCard, type AuctionSummary } from "@/components/AuctionCard";

export default function Home() {
  const [data, setData] = useState<{ live: AuctionSummary[]; ended: AuctionSummary[]; offset: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch("/api/auctions", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Couldn't load auctions");
        if (!stop) setData({ live: j.live, ended: j.ended, offset: j.now - Date.now() });
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-12">
      <section className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Live auctions where <span className="text-brand">every bid is real</span> and every seller ships.
          </h1>
          <p className="max-w-xl text-lg text-slate-300">
            AI agents vet each listing before it goes live. Bids are backed by deposits, so nobody can bid and vanish. The winner&apos;s payment sits in escrow until the item arrives.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#live" className="btn-primary">
              <Gavel className="h-4 w-4" aria-hidden /> Browse live auctions
            </a>
            <Link href="/sell" className="btn-secondary">
              Sell something
            </Link>
          </div>
        </div>
        <ul className="grid gap-3 text-sm">
          {[
            { icon: BadgeCheck, t: "Vetted listings", d: "An agent crew checks photos, price and seller history and gives every listing a Trust Score with reasons." },
            { icon: Vault, t: "Deposit-backed bids", d: "Bids come from your Bid Vault, signed in your wallet: instant, gas-free and impossible to fake." },
            { icon: ShieldCheck, t: "Escrow until delivery", d: "Funds release only on delivery. Sellers post a bond that goes to the buyer if they don't ship." },
          ].map(({ icon: Icon, t, d }) => (
            <li key={t} className="card flex gap-3 !p-4">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
              <span>
                <span className="font-semibold">{t}</span>
                <span className="block text-slate-400">{d}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section id="live" className="space-y-4">
        <h2 className="text-2xl font-bold">Live now</h2>
        {error && <p className="text-rose-300">{error}</p>}
        {!data && !error && <p className="text-slate-400">Loading auctions…</p>}
        {data && data.live.length === 0 && (
          <div className="card text-slate-400">
            No live auctions right now. <Link href="/sell" className="text-brand underline">List the first one</Link>.
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.live.map((a) => <AuctionCard key={a._id} a={a} offset={data.offset} />)}
        </div>
      </section>

      {data && data.ended.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-slate-300">Recently ended</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.ended.map((a) => <AuctionCard key={a._id} a={a} offset={data.offset} />)}
          </div>
        </section>
      )}
    </div>
  );
}
