import { db } from "@/lib/mongo";
import { buildCreateTx } from "@/lib/listings";
import { clientIp, jsonError, rateLimit, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";

/** A fresh operator-co-signed create_auction transaction for the listing's seller to sign. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return jsonError(403, "Bad origin");
  if (!(await rateLimit(`tx:${clientIp(req)}`, 20, 60_000))) return jsonError(429, "Slow down");
  const { seller } = await req.json().catch(() => ({}));
  const l = await (await db()).collection("listings").findOne({ _id: params.id as never }, { projection: { seller: 1, status: 1 } });
  if (!l || l.seller !== seller) return jsonError(404, "Listing not found");
  if (l.status !== "awaiting_signature") return jsonError(409, l.status === "held" ? "This listing is waiting for a moderator" : "This listing can't go live");
  const built = await buildCreateTx(params.id);
  if (!built) return jsonError(409, "This listing can't go live");
  return Response.json(built);
}
