import "server-only";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { z } from "zod";
import { db } from "./mongo";
import { bidMessage } from "./bid";
import { SOFT_CLOSE_SECS } from "./config";
import { finalizeIxs, settleIxs, vaultPda, vaultTokensPda } from "./program";
import { operatorKeypair, sendServerTx, serverConnection, serverProgram } from "./server";

/**
 * Live auction engine. MongoDB is the authoritative live state (atomic conditional updates,
 * so two bids can never both win); the chain is the source of truth for money.
 */

export type AuctionDoc = {
  _id: string; // on-chain auction address
  listingId: string;
  seller: string;
  title: string;
  image: string | null;
  trustScore: number;
  startPrice: number; // base units
  minIncrement: number;
  minNext: number; // smallest acceptable next bid
  endsAt: Date;
  originalEndsAt: Date;
  currentBid: number | null;
  currentBidder: string | null;
  bidCount: number;
  extensions: number;
  status: "live" | "closing" | "settled" | "unsold" | "failed";
  winningBid?: { bidId: string; signer: string; amount: number; nonce: number; expiry: number; signature: string };
  settleTx?: string;
  createdAt: Date;
};

export type AuctionEvent = { auctionId: string; type: "bid_placed" | "outbid" | "timer_extended" | "auction_closed" | "trust_updated" | "agent_trace" | "bid_rejected"; data: Record<string, unknown>; at: Date };

export async function emit(auctionId: string, type: AuctionEvent["type"], data: Record<string, unknown>) {
  await (await db()).collection<AuctionEvent>("events").insertOne({ auctionId, type, data, at: new Date() });
}

// ── bidding power ──

/** What a bidder can still bid: vault balance − pending withdrawal − leading bids elsewhere. */
export async function biddingPower(bidder: string, excludeAuction?: string) {
  const program = serverProgram();
  const key = new PublicKey(bidder);
  const [vault, tokens] = await Promise.all([
    program.account.bidVault.fetchNullable(vaultPda(key)),
    serverConnection().getTokenAccountBalance(vaultTokensPda(key)).catch(() => null),
  ]);
  const deposited = tokens ? Number(tokens.value.amount) : 0;
  const pending = vault ? vault.pendingWithdrawal.toNumber() : 0;
  const leading = await (await db())
    .collection<AuctionDoc>("auctions")
    .find({ currentBidder: bidder, status: { $in: ["live", "closing"] }, ...(excludeAuction ? { _id: { $ne: excludeAuction } } : {}) }, { projection: { currentBid: 1 } })
    .toArray();
  const committed = leading.reduce((s, a) => s + (a.currentBid ?? 0), 0);
  const cooldownEndsAt = vault && vault.pendingWithdrawal.toNumber() > 0 ? vault.withdrawRequestedAt.toNumber() : 0;
  return {
    deposited,
    pending,
    committed,
    available: Math.max(0, deposited - pending - committed),
    withdrawRequestedAt: cooldownEndsAt,
    agent: vault && !vault.agent.equals(PublicKey.default) ? vault.agent.toBase58() : null,
    agentCap: vault ? vault.agentCap.toNumber() : 0,
    agentSpent: vault ? vault.agentSpent.toNumber() : 0,
  };
}

// ── bids ──

const B58 = z.string().min(32).max(100).regex(/^[1-9A-HJ-NP-Za-km-z]+$/);
export const BidInput = z.object({
  bidder: B58,
  signer: B58.optional(), // the bidder, or their registered Concierge Agent key
  amount: z.number().int().positive().max(1e15),
  nonce: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  expiry: z.number().int().positive(),
  signature: B58,
});
export type BidResult = { ok: true; auction: AuctionDoc; extended: boolean } | { ok: false; reason: string; minNext?: number };

export async function placeBid(auctionId: string, raw: unknown): Promise<BidResult> {
  const parsed = BidInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "Malformed bid" };
  const b = parsed.data;
  const signer = b.signer ?? b.bidder;
  const d = await db();
  const auctions = d.collection<AuctionDoc>("auctions");
  const now = new Date();

  const a = await auctions.findOne({ _id: auctionId });
  if (!a) return { ok: false, reason: "Auction not found" };
  if (a.status !== "live" || a.endsAt <= now) return { ok: false, reason: "This auction has ended" };
  if (b.bidder === a.seller) return { ok: false, reason: "Sellers can't bid on their own auction" };
  if (b.amount < a.minNext) return { ok: false, reason: "Bid is below the minimum next bid", minNext: a.minNext };
  // The signature must stay valid long enough to settle after any soft-close extensions.
  const nowSec = Math.floor(now.getTime() / 1000);
  if (b.expiry < Math.floor(a.endsAt.getTime() / 1000) + 600 || b.expiry > nowSec + 3 * 86400) return { ok: false, reason: "Bid expiry is out of range" };

  // 1. The bid must be signed by the bidder (or their registered agent).
  let sigBytes: Uint8Array;
  try {
    sigBytes = bs58.decode(b.signature);
  } catch {
    return { ok: false, reason: "Bad signature" };
  }
  const message = new TextEncoder().encode(bidMessage(auctionId, b.amount, b.nonce, b.expiry));
  if (sigBytes.length !== 64 || !nacl.sign.detached.verify(message, sigBytes, new PublicKey(signer).toBytes())) {
    return { ok: false, reason: "Signature doesn't match this bid" };
  }

  // 2. Deposit-backed: the vault must cover this bid on top of everything else this bidder leads.
  const power = await biddingPower(b.bidder, auctionId);
  if (signer !== b.bidder) {
    if (power.agent !== signer) return { ok: false, reason: "That key isn't your registered bidding agent" };
    if (power.agentSpent + b.amount > power.agentCap) return { ok: false, reason: "Your agent's spending cap would be exceeded" };
  }
  if (power.available < b.amount) return { ok: false, reason: "Not enough available funds in your Bid Vault. Deposit more first." };

  // 3. Record the signed bid (bidder+nonce is unique: a signature can't be replayed).
  let bidId: string;
  try {
    bidId = (
      await d.collection("bids").insertOne({ auctionId, bidder: b.bidder, signer, amount: b.amount, nonce: b.nonce, expiry: b.expiry, signature: b.signature, accepted: false, at: now })
    ).insertedId.toString();
  } catch {
    return { ok: false, reason: "This signed bid was already used" };
  }

  // 4. Atomic: only wins if it still beats the current price and the auction is still open.
  //    Soft close: a bid in the final SOFT_CLOSE_SECS pushes the end to now + SOFT_CLOSE_SECS.
  const softMs = SOFT_CLOSE_SECS * 1000;
  const extendTo = new Date(now.getTime() + softMs);
  const updated = await auctions.findOneAndUpdate(
    { _id: auctionId, status: "live", endsAt: { $gt: now }, minNext: { $lte: b.amount } },
    [
      {
        $set: {
          extended: { $lt: [{ $subtract: ["$endsAt", now] }, softMs] },
          previousBidder: "$currentBidder",
        },
      },
      {
        $set: {
          currentBid: b.amount,
          currentBidder: b.bidder,
          minNext: { $add: [b.amount, "$minIncrement"] },
          bidCount: { $add: ["$bidCount", 1] },
          endsAt: { $cond: ["$extended", extendTo, "$endsAt"] },
          extensions: { $add: ["$extensions", { $cond: ["$extended", 1, 0] }] },
          winningBid: { $literal: { bidId, signer, amount: b.amount, nonce: b.nonce, expiry: b.expiry, signature: b.signature } },
        },
      },
    ],
    { returnDocument: "after" }
  );
  if (!updated) {
    const fresh = await auctions.findOne({ _id: auctionId });
    return { ok: false, reason: "Someone outbid you a moment ago", minNext: fresh?.minNext };
  }
  await d.collection("bids").updateOne({ auctionId, bidder: b.bidder, nonce: b.nonce }, { $set: { accepted: true } });
  const doc = updated as AuctionDoc & { extended?: boolean; previousBidder?: string | null };
  await emit(auctionId, "bid_placed", { amount: b.amount, bidder: b.bidder, bidCount: doc.bidCount, endsAt: doc.endsAt, minNext: doc.minNext, byAgent: signer !== b.bidder });
  if (doc.previousBidder && doc.previousBidder !== b.bidder) await emit(auctionId, "outbid", { bidder: doc.previousBidder, amount: b.amount });
  if (doc.extended) await emit(auctionId, "timer_extended", { endsAt: doc.endsAt, extensions: doc.extensions });
  return { ok: true, auction: doc, extended: !!doc.extended };
}

// ── closing & settlement ──

/**
 * Idempotent: closes an auction whose timer ran out. Settles the highest signed bid on-chain
 * (falling back to the next-highest if one ever fails), or cancels it if there were no bids.
 */
export async function closeIfEnded(auctionId: string): Promise<AuctionDoc | null> {
  const d = await db();
  const auctions = d.collection<AuctionDoc>("auctions");
  const claimed = await auctions.findOneAndUpdate({ _id: auctionId, status: "live", endsAt: { $lte: new Date() } }, { $set: { status: "closing" } }, { returnDocument: "after" });
  if (!claimed) return auctions.findOne({ _id: auctionId });

  const operator = operatorKeypair();
  const program = serverProgram(operator);
  const auctionKey = new PublicKey(auctionId);
  try {
    const bids = await d.collection("bids").find({ auctionId, accepted: true }).sort({ amount: -1 }).toArray();
    for (const bid of bids) {
      try {
        const ixs = await settleIxs(program, {
          operator: operator.publicKey,
          auction: auctionKey,
          bidder: new PublicKey(bid.bidder),
          signer: new PublicKey(bid.signer),
          amount: bid.amount,
          nonce: bid.nonce,
          expiry: bid.expiry,
          signature: bs58.decode(bid.signature),
        });
        const sig = await sendServerTx(ixs, [operator]);
        const doc = await auctions.findOneAndUpdate(
          { _id: auctionId },
          { $set: { status: "settled", settleTx: sig, currentBid: bid.amount, currentBidder: bid.bidder } },
          { returnDocument: "after" }
        );
        await emit(auctionId, "auction_closed", { winner: bid.bidder, amount: bid.amount, tx: sig });
        return doc;
      } catch (e) {
        const msg = String((e as Error).message);
        if (/AuctionNotEnded|0x1778/.test(msg)) throw e; // chain clock is a few seconds behind: retry later
        console.error(`Settlement with bid ${bid._id} failed, trying the next one:`, msg.slice(0, 200));
      }
    }
    // No bid could be settled (or none at all): return the seller's bond.
    const sig = await sendServerTx(await finalizeIxs(program, "cancelUnsold", auctionKey, operator.publicKey), [operator]);
    const doc = await auctions.findOneAndUpdate({ _id: auctionId }, { $set: { status: "unsold", settleTx: sig } }, { returnDocument: "after" });
    await emit(auctionId, "auction_closed", { winner: null, tx: sig });
    return doc;
  } catch (e) {
    const msg = String((e as Error).message);
    // Put it back so the next poll retries (e.g. the validator clock hasn't reached the end yet).
    await auctions.updateOne({ _id: auctionId, status: "closing" }, { $set: { status: "live" } });
    if (!/AuctionNotEnded|0x1778/.test(msg)) console.error("Closing failed:", msg.slice(0, 300));
    return auctions.findOne({ _id: auctionId });
  }
}

/** Closes every auction whose time is up (called opportunistically from list/stream endpoints). */
export async function closeExpired(limit = 5) {
  const due = await (await db()).collection<AuctionDoc>("auctions").find({ status: "live", endsAt: { $lte: new Date() } }, { projection: { _id: 1 } }).limit(limit).toArray();
  for (const a of due) await closeIfEnded(a._id);
}
