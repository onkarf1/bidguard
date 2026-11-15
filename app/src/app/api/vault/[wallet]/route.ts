import { PublicKey } from "@solana/web3.js";
import { biddingPower } from "@/lib/auctions";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { wallet: string } }) {
  try {
    new PublicKey(params.wallet);
  } catch {
    return jsonError(400, "Bad wallet");
  }
  return Response.json(await biddingPower(params.wallet));
}
