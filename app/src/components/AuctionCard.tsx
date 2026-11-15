import Link from "next/link";
import { Countdown } from "./Countdown";
import { TrustBadge } from "./TrustBadge";
import { usd } from "@/lib/format";

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

export function AuctionCard({ a, offset }: { a: AuctionSummary; offset: number }) {
  const live = a.status === "live" || a.status === "closing";
  return (
    <Link href={`/auction/${a._id}`} className="group block overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 transition hover:border-brand/60">
      <div className="relative aspect-[4/3] bg-slate-800">
        {a.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/images/${a.image}`} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
        )}
        <span className="absolute right-2 top-2">
          <TrustBadge score={a.trustScore} size="sm" />
        </span>
        {live && <span className="absolute left-2 top-2 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Live</span>}
      </div>
      <div className="space-y-1 p-4">
        <h3 className="truncate font-semibold">{a.title}</h3>
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-xs text-slate-400">{a.currentBid ? `${a.bidCount} bid${a.bidCount === 1 ? "" : "s"}` : "Starting at"}</div>
            <div className="text-lg font-bold text-brand">{usd(a.currentBid ?? a.startPrice)}</div>
          </div>
          <div className="text-right text-sm text-slate-300">{live ? <Countdown endsAt={a.endsAt} offset={offset} /> : <span className="text-slate-500">{a.status === "settled" ? "Sold" : a.status === "unsold" ? "No sale" : "Ended"}</span>}</div>
        </div>
      </div>
    </Link>
  );
}
