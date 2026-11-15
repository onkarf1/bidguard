import "server-only";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { db } from "./mongo";
import { toBaseUnits } from "./format";
import { auctionPda, createAuctionIx } from "./program";
import { operatorKeypair, serverConnection, serverProgram } from "./server";

/**
 * Builds a fresh create_auction transaction for an approved listing, co-signed by the operator
 * (the program only accepts auctions the operator approved). The seller's wallet signs and pays.
 * Built on demand so the blockhash is never stale when the seller gets around to signing.
 */
export async function buildCreateTx(listingId: string) {
  const d = await db();
  const l = await d.collection("listings").findOne({ _id: listingId as never });
  if (!l || l.status !== "awaiting_signature") return null;
  const operator = operatorKeypair();
  const seller = new PublicKey(l.seller);
  const id = new BN(Date.now()).muln(1000).addn(Math.floor(Math.random() * 1000));
  const endsAt = Math.floor(Date.now() / 1000) + l.durationMinutes * 60 + 60; // +60 s to sign
  const minIncrement = Math.max(toBaseUnits(1), Math.round(l.startPrice * 0.05));
  const ix = await createAuctionIx(serverProgram(), {
    seller,
    operator: operator.publicKey,
    id,
    startPrice: l.startPrice,
    minIncrement,
    endsAt,
    listingHash: Array.from(Buffer.from(l.listingHash, "hex")),
    trustScore: l.trust?.score ?? 0,
  });
  const { blockhash } = await serverConnection().getLatestBlockhash("confirmed");
  const t = new Transaction({ feePayer: seller, recentBlockhash: blockhash }).add(ix);
  t.partialSign(operator);
  const auctionAddress = auctionPda(seller, id).toBase58();
  // Remember every address we issued: whichever one the seller actually signs gets activated.
  await d.collection("listings").updateOne({ _id: listingId as never }, { $set: { auctionAddress }, $push: { issuedAuctions: auctionAddress } as never });
  return { tx: t.serialize({ requireAllSignatures: false }).toString("base64"), auctionAddress };
}

export const publicListing = (l: Record<string, unknown>) => {
  const { listingHash: _h, issuedAuctions: _i, ...rest } = l;
  return rest;
};
