import { db } from "@/lib/mongo";
import { closeExpired, type AuctionDoc } from "@/lib/auctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live and recently closed auctions for the home page. */
export async function GET() {
  await closeExpired().catch((e) => console.error("closeExpired", e));
  const rows = await (await db())
    .collection<AuctionDoc>("auctions")
    .find({ hidden: { $ne: true } }, { projection: { winningBid: 0 } })
    .sort({ status: 1, endsAt: 1 })
    .limit(80)
    .toArray();
  const live = rows.filter((r) => r.status === "live" || r.status === "closing");
  // Newest endings first, with sold items ahead of no-sale ones.
  const ended = rows
    .filter((r) => r.status !== "live" && r.status !== "closing")
    .sort((a, b) => Number(b.status === "settled") - Number(a.status === "settled") || b.endsAt.getTime() - a.endsAt.getTime())
    .slice(0, 12);
  return Response.json({ live, ended, now: Date.now() });
}
