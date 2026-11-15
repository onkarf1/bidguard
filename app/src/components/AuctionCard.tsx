"use client";
import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Countdown } from "./Countdown";
import { TrustBadge } from "./TrustBadge";
import { AnimatedNumber, rise } from "./motion";
import { fromBaseUnits, usd } from "@/lib/format";

export type AuctionSummary = {
  _id: string;
  title: string;
  image: string | null;
  trustScore: number;
  startPrice: number;
  currentBid: number | null;
  bidCount: number;
  endsAt: string;
  status: string;
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function AuctionCard({ a, offset }: { a: AuctionSummary; offset: number }) {
  const live = a.status === "live" || a.status === "closing";
  const price = a.currentBid ?? a.startPrice;
  // Flash when the price changes (someone bid).
  const prev = useRef(price);
  const [bumped, setBumped] = useState(0);
  useEffect(() => {
    if (price !== prev.current) setBumped((n) => n + 1);
    prev.current = price;
  }, [price]);
  // Subtle 3D tilt that follows the pointer.
  const mx = useMotionValue(0), my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-6, 6]), { stiffness: 200, damping: 20 });

  return (
    <motion.div variants={rise} layout style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); mx.set((e.clientX - r.left) / r.width - 0.5); my.set((e.clientY - r.top) / r.height - 0.5); }}
      onPointerLeave={() => { mx.set(0); my.set(0); }}
      whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
      <Link href={`/auction/${a._id}`} className="group block overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg shadow-black/20 transition-colors hover:border-brand/60 hover:shadow-brand/10">
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-800">
          {a.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/images/${a.image}`} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" loading="lazy" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
          <span className="absolute right-2 top-2"><TrustBadge score={a.trustScore} size="sm" /></span>
          {live && (
            <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg shadow-rose-500/30">
              <span className="live-dot !bg-white" /> Live
            </span>
          )}
          {live && <span className="absolute bottom-2 right-2 rounded-lg bg-slate-950/80 px-2 py-0.5 text-sm backdrop-blur"><Countdown endsAt={a.endsAt} offset={offset} /></span>}
        </div>
        <div className="space-y-1 p-4">
          <h3 className="truncate font-semibold transition-colors group-hover:text-brand">{a.title}</h3>
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-xs text-slate-400">{a.currentBid ? `${a.bidCount} bid${a.bidCount === 1 ? "" : "s"}` : "Starting at"}</div>
              <motion.div key={bumped} initial={bumped ? { scale: 1.25, opacity: 0.6 } : false} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 400, damping: 15 }} className="origin-left text-lg font-bold text-brand">
                <AnimatedNumber value={fromBaseUnits(price)} format={money} />
              </motion.div>
            </div>
            {!live && <span className="text-sm text-slate-500">{a.status === "settled" ? `Sold · ${usd(price)}` : a.status === "unsold" ? "No sale" : "Ended"}</span>}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
