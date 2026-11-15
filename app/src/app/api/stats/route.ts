import { db } from "@/lib/mongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Headline numbers for the home page. */
export async function GET() {
  const d = await db();
  const [live, bids, sold, blocked] = await Promise.all([
    d.collection("auctions").countDocuments({ status: { $in: ["live", "closing"] }, hidden: { $ne: true } }),
    d.collection("bids").countDocuments({ accepted: true }),
    d.collection("auctions").aggregate([{ $match: { status: "settled" } }, { $group: { _id: null, n: { $sum: 1 }, v: { $sum: "$currentBid" } } }]).toArray(),
    d.collection("listings").countDocuments({ "trust.decision": { $in: ["hold", "reject"] } }),
  ]);
  return Response.json({ live, bids, sales: sold[0]?.n ?? 0, volume: sold[0]?.v ?? 0, flagged: blocked });
}
