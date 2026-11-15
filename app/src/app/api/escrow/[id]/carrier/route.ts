import { PublicKey } from "@solana/web3.js";
import { markDeliveredIx, statusOf } from "@/lib/program";
import { operatorKeypair, sendServerTx, serverProgram } from "@/lib/server";
import { clientIp, jsonError, rateLimit, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Carrier-tracking oracle (mocked, Shippo/EasyPost style). Looks up the tracking number and,
 * when the carrier reports "delivered", records it on-chain with the operator key, which starts
 * the buyer's review window. In this prototype any well-formed tracking number reads as delivered.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return jsonError(403, "Bad origin");
  if (!(await rateLimit(`carrier:${clientIp(req)}`, 10, 60_000))) return jsonError(429, "Slow down");
  let auction: PublicKey;
  try {
    auction = new PublicKey(params.id);
  } catch {
    return jsonError(404, "Not found");
  }
  const operator = operatorKeypair();
  const program = serverProgram(operator);
  const a = await program.account.auction.fetchNullable(auction);
  if (!a) return jsonError(404, "Auction not found");
  if (statusOf(a.status) !== "shipped") return jsonError(409, "Only shipped items can be tracked");
  const tracking = { number: a.tracking, carrier: /^1Z/i.test(a.tracking) ? "UPS" : /^\d{12,22}$/.test(a.tracking) ? "USPS/FedEx" : "Carrier", status: "delivered", checkedAt: new Date().toISOString() };
  const sig = await sendServerTx([await markDeliveredIx(program, operator.publicKey, auction)], [operator]);
  return Response.json({ tracking, tx: sig });
}
