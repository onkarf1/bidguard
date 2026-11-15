"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, Gavel, ScanEye, Scale, ShieldCheck, Sparkles, Vault, Zap } from "lucide-react";
import { AuctionCard, type AuctionSummary } from "@/components/AuctionCard";
import { AnimatedNumber, Reveal, rise, stagger } from "@/components/motion";
import { fromBaseUnits } from "@/lib/format";

type Stats = { live: number; bids: number; sales: number; volume: number; flagged: number };
type Activity = { id: string; type: string; text: string; auctionId: string };

const WORDS = ["Live", "auctions", "where", "every", "bid", "is", "real"];
const int = (n: number) => Math.round(n).toLocaleString("en-US");

export default function Home() {
  const [data, setData] = useState<{ live: AuctionSummary[]; ended: AuctionSummary[]; offset: number } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [feed, setFeed] = useState<Activity[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const [r, s, f] = await Promise.all([fetch("/api/auctions", { cache: "no-store" }), fetch("/api/stats", { cache: "no-store" }), fetch("/api/activity", { cache: "no-store" })]);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Couldn't load auctions");
        if (stop) return;
        setData({ live: j.live, ended: j.ended, offset: j.now - Date.now() });
        if (s.ok) setStats(await s.json());
        if (f.ok) setFeed((await f.json()).items);
        setError("");
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="space-y-16">
      {/* ── hero ── */}
      <section className="relative -mx-4 overflow-hidden rounded-3xl px-4 py-10 sm:py-14">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="aurora -left-20 -top-24 h-80 w-80" aria-hidden />
        <div className="aurora right-0 top-10 h-72 w-72" style={{ animationDelay: "-6s", opacity: 0.08 }} aria-hidden />
        <div className="aurora bottom-0 left-1/3 h-64 w-64" style={{ animationDelay: "-12s", opacity: 0.1 }} aria-hidden />
        <div className="relative grid items-center gap-10 md:grid-cols-[1.25fr_1fr]">
          <div className="space-y-6">
            <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> AI-vetted · deposit-backed · escrowed on Solana
            </motion.span>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
              <motion.span variants={stagger} initial="hidden" animate="show" className="flex flex-wrap gap-x-3">
                {WORDS.map((w, i) => (
                  <motion.span key={i} variants={{ hidden: { opacity: 0, y: 30, rotateX: -60 }, show: { opacity: 1, y: 0, rotateX: 0, transition: { type: "spring", stiffness: 200, damping: 18 } } }} className={i >= 3 ? "shimmer-text" : ""}>
                    {w}
                  </motion.span>
                ))}
              </motion.span>
            </h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="max-w-xl text-lg text-slate-300">
              AI agents vet each listing before it goes live. Bids are backed by deposits, so nobody can bid and vanish. The winner&apos;s payment sits in escrow until the item arrives.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="flex flex-wrap gap-3">
              <motion.a whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }} href="#live" className="btn-primary shadow-lg shadow-slate-50/10">
                <Gavel className="h-4 w-4" aria-hidden /> Browse live auctions
              </motion.a>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Link href="/sell" className="btn-secondary backdrop-blur">Sell something</Link>
              </motion.div>
            </motion.div>
          </div>
          <motion.ul variants={stagger} initial="hidden" animate="show" className="grid gap-3 text-sm">
            {[
              { icon: BadgeCheck, t: "Vetted listings", d: "Five AI agents check photos, price and seller history and give every listing a Trust Score." },
              { icon: ScanEye, t: "Fake & AI photos caught", d: "Provenance metadata and visual forensics flag AI-generated or reused photos." },
              { icon: Vault, t: "Deposit-backed bids", d: "Bids come from your Bid Vault, signed in your wallet: instant, gas-free, impossible to fake." },
              { icon: ShieldCheck, t: "Escrow until delivery", d: "Funds release on delivery. Sellers post a bond that goes to the buyer if they don't ship." },
              { icon: Scale, t: "AI Dispute Judge", d: "Weighs both sides' evidence; a human arbiter executes the ruling on-chain." },
            ].map(({ icon: Icon, t, d }) => (
              <motion.li key={t} variants={rise} whileHover={{ x: 6 }} className="card flex gap-3 !p-4 backdrop-blur">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="font-semibold">{t}</span>
                  <span className="block text-slate-400">{d}</span>
                </span>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* ── live stats ── */}
      <Reveal>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "Live auctions", v: stats?.live ?? 0, f: int, icon: Zap },
            { k: "Signed bids", v: stats?.bids ?? 0, f: int, icon: Gavel },
            { k: "Settled on-chain (USDC)", v: fromBaseUnits(stats?.volume ?? 0), f: (n: number) => `$${int(n)}`, icon: ShieldCheck },
            { k: "Risky listings stopped", v: stats?.flagged ?? 0, f: int, icon: ScanEye },
          ].map(({ k, v, f, icon: Icon }) => (
            <div key={k} className="card !p-4">
              <Icon className="mb-2 h-4 w-4 text-brand" aria-hidden />
              <div className="text-2xl font-bold sm:text-3xl"><AnimatedNumber value={v} format={f} duration={1.4} /></div>
              <div className="text-xs text-slate-400">{k}</div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ── activity ticker ── */}
      {feed.length > 0 && (
        <div className="relative -mx-4 overflow-hidden border-y border-slate-800 bg-slate-900/40 py-2.5" aria-label="Recent activity">
          <div className="marquee flex w-max gap-10 whitespace-nowrap text-sm">
            {[...feed, ...feed].map((e, i) => (
              <Link key={`${e.id}-${i}`} href={`/auction/${e.auctionId}`} className="flex items-center gap-2 text-slate-300 hover:text-brand" tabIndex={i >= feed.length ? -1 : 0} aria-hidden={i >= feed.length}>
                <span className={e.type === "bid_placed" ? "text-brand" : e.type === "timer_extended" ? "text-rose-400" : "text-emerald-400"}>●</span>
                {e.text}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── live auctions ── */}
      <section id="live" className="scroll-mt-20 space-y-5">
        <Reveal className="flex items-center gap-3">
          <span className="live-dot" aria-hidden />
          <h2 className="text-2xl font-bold">Live now</h2>
        </Reveal>
        {error && <p className="text-rose-300">{error}</p>}
        {!data && !error && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-slate-800/60" />)}
          </div>
        )}
        {data && data.live.length === 0 && (
          <div className="card text-slate-400">
            No live auctions right now. <Link href="/sell" className="text-brand underline">List the first one</Link>.
          </div>
        )}
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {data?.live.map((a) => <AuctionCard key={a._id} a={a} offset={data.offset} />)}
          </AnimatePresence>
        </motion.div>
      </section>

      {data && data.ended.length > 0 && (
        <section className="space-y-4">
          <Reveal><h2 className="text-xl font-bold text-slate-300">Recently ended</h2></Reveal>
          <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.ended.map((a) => <AuctionCard key={a._id} a={a} offset={data.offset} />)}
          </motion.div>
        </section>
      )}
    </div>
  );
}
