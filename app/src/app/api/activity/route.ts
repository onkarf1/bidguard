import { db } from "@/lib/mongo";
import { short, usd } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Site-wide live feed for the home page ticker: latest bids, extensions and sales. */
export async function GET() {
  const d = await db();
  const hidden = (await d.collection("auctions").find({ hidden: true }, { projection: { _id: 1 } }).toArray()).map((a) => String(a._id));
  const events = await d.collection("events").find({ type: { $in: ["bid_placed", "timer_extended", "auction_closed"] }, auctionId: { $nin: hidden } }).sort({ _id: -1 }).limit(24).toArray();
  const titles = new Map((await d.collection("auctions").find({ _id: { $in: Array.from(new Set(events.map((e) => e.auctionId))) } }, { projection: { title: 1 } }).toArray()).map((a) => [String(a._id), a.title as string]));
  const items = events.map((e) => {
    const t = titles.get(e.auctionId) ?? "an item";
    const text =
      e.type === "bid_placed" ? `${short(e.data.bidder)} bid ${usd(e.data.amount)} on ${t}` :
      e.type === "timer_extended" ? `Late bid! ${t} extended +30s` :
      e.data.winner ? `${t} sold for ${usd(e.data.amount)}` : `${t} ended with no bids`;
    return { id: String(e._id), type: e.type, text, auctionId: e.auctionId, at: e.at };
  });
  return Response.json({ items });
}
