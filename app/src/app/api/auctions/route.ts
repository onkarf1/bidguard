import { db } from "@/lib/mongo";
import { closeExpired, type AuctionDoc } from "@/lib/auctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live and recently closed auctions for the home page. */
export async function GET() {
  await closeExpired().catch((e) => console.error("closeExpired", e));
  const rows = await (await db())
    .collection<AuctionDoc>("auctions")
    .find({}, { projection: { winningBid: 0 } })
    .sort({ status: 1, endsAt: 1 })
    .limit(60)
    .toArray();
  const live = rows.filter((r) => r.status === "live" || r.status === "closing");
  const ended = rows.filter((r) => r.status !== "live" && r.status !== "closing").slice(0, 12);
  return Response.json({ live, ended, now: Date.now() });
}
