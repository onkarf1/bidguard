import { PublicKey } from "@solana/web3.js";
import { db } from "@/lib/mongo";
import { emit, type AuctionDoc } from "@/lib/auctions";
import { serverProgram } from "@/lib/server";
import { statusOf } from "@/lib/program";
import { jsonError, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";

/** After the seller's wallet sent the create-auction transaction, verify it on-chain and open the live room. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return jsonError(403, "Bad origin");
  const d = await db();
  const listing = await d.collection("listings").findOne({ _id: params.id as never });
  if (!listing || !listing.issuedAuctions?.length) return jsonError(404, "Listing not found or not approved");
  const existing = await d.collection<AuctionDoc>("auctions").findOne({ listingId: params.id });
  if (existing) return Response.json({ auction: existing });
  if (listing.status !== "awaiting_signature") return jsonError(409, "This listing isn't approved to go live");

  // Whichever issued transaction the seller signed is the one that's on-chain.
  const program = serverProgram();
  const issued: string[] = listing.issuedAuctions.slice(-10);
  const found = await program.account.auction.fetchMultiple(issued.map((a) => new PublicKey(a)));
  const idx = found.findIndex(Boolean);
  const onchain = found[idx];
  if (!onchain) return jsonError(409, "The auction isn't on-chain yet. Did the transaction confirm?");
  listing.auctionAddress = issued[idx];
  if (onchain.seller.toBase58() !== listing.seller || Buffer.from(onchain.listingHash).toString("hex") !== listing.listingHash || statusOf(onchain.status) !== "live") {
    return jsonError(409, "On-chain auction doesn't match this listing");
  }
  const endsAt = new Date(onchain.endsAt.toNumber() * 1000);
  const auction: AuctionDoc = {
    _id: listing.auctionAddress,
    listingId: params.id,
    seller: listing.seller,
    title: listing.title,
    image: listing.images?.[0] ?? null,
    trustScore: listing.trust?.score ?? 0,
    startPrice: onchain.startPrice.toNumber(),
    minIncrement: onchain.minIncrement.toNumber(),
    minNext: onchain.startPrice.toNumber(),
    endsAt,
    originalEndsAt: endsAt,
    currentBid: null,
    currentBidder: null,
    bidCount: 0,
    extensions: 0,
    status: "live",
    createdAt: new Date(),
  };
  try {
    await d.collection<AuctionDoc>("auctions").insertOne(auction);
  } catch {
    return Response.json({ auction: await d.collection<AuctionDoc>("auctions").findOne({ listingId: params.id }) });
  }
  await d.collection("listings").updateOne({ _id: params.id as never }, { $set: { status: "live" } });
  await emit(auction._id, "trust_updated", { score: auction.trustScore });
  return Response.json({ auction });
}
