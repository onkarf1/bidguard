import { placeBid } from "@/lib/auctions";
import { clientIp, jsonError, rateLimit, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";

/** A signed, gas-free bid. Verified, checked against the bidder's vault, and applied atomically. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return jsonError(403, "Bad origin");
  if (!(await rateLimit(`bid:${clientIp(req)}`, 40, 60_000))) return jsonError(429, "Slow down a little");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Malformed bid");
  }
  const r = await placeBid(params.id, body);
  if (!r.ok) return jsonError(409, r.reason, { minNext: r.minNext });
  return Response.json({ ok: true, currentBid: r.auction.currentBid, endsAt: r.auction.endsAt, extended: r.extended, minNext: r.auction.minNext });
}
