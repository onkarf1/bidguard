import { PublicKey } from "@solana/web3.js";
import { db } from "@/lib/mongo";
import { closeIfEnded, type AuctionDoc } from "@/lib/auctions";
import { serverProgram } from "@/lib/server";
import { sellerProfilePda, statusOf } from "@/lib/program";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the auction room needs: live state, listing + trust report, recent bids, escrow state. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let key: PublicKey;
  try {
    key = new PublicKey(params.id);
  } catch {
    return jsonError(404, "Not found");
  }
  const d = await db();
  let auction = await d.collection<AuctionDoc>("auctions").findOne({ _id: params.id }, { projection: { "winningBid.signature": 0 } });
  if (!auction) return jsonError(404, "Auction not found");
  if (auction.status === "live" && auction.endsAt <= new Date()) auction = (await closeIfEnded(params.id)) ?? auction;
  const [listing, bids, onchain] = await Promise.all([
    d.collection("listings").findOne({ _id: auction.listingId as never }, { projection: { listingHash: 0 } }),
    d.collection("bids").find({ auctionId: params.id, accepted: true }, { projection: { signature: 0 } }).sort({ amount: -1 }).limit(20).toArray(),
    serverProgram().account.auction.fetchNullable(key),
  ]);
  const profile = await serverProgram().account.sellerProfile.fetchNullable(sellerProfilePda(new PublicKey(auction.seller)));
  const escrow = onchain && {
    status: statusOf(onchain.status),
    buyer: onchain.buyer.toBase58(),
    price: onchain.price.toNumber(),
    bond: onchain.bond.toNumber(),
    tracking: onchain.tracking,
    settledAt: onchain.settledAt.toNumber(),
    shippedAt: onchain.shippedAt.toNumber(),
    deliveredAt: onchain.deliveredAt.toNumber(),
    disputeReason: onchain.disputeReason,
    resolutionNote: onchain.resolutionNote,
    buyerBps: onchain.buyerBps,
  };
  const seller = profile && {
    sales: profile.salesCompleted.toNumber(),
    disputesLost: profile.disputesLost.toNumber(),
    failedShipments: profile.failedShipments.toNumber(),
    auctions: profile.auctionsCreated.toNumber(),
  };
  return Response.json({ auction, listing, bids, escrow, seller, now: Date.now() });
}
