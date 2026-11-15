import { PublicKey } from "@solana/web3.js";
import { db } from "@/lib/mongo";
import { isAdmin } from "@/lib/admin";
import { serverProgram } from "@/lib/server";
import { statusOf } from "@/lib/program";
import type { DisputeDoc } from "@/lib/disputes";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Arbiter queue: open disputes (read from chain) with their evidence and the AI recommendation. */
export async function GET(req: Request) {
  if (!isAdmin(req)) return jsonError(401, "Moderator token required");
  const d = await db();
  const sold = await d.collection("auctions").find({ status: "settled" }, { projection: { _id: 1, title: 1, image: 1 } }).sort({ endsAt: -1 }).limit(100).toArray();
  const accounts = await serverProgram().account.auction.fetchMultiple(sold.map((a) => new PublicKey(String(a._id))));
  const rows = sold
    .map((a, i) => ({ a, c: accounts[i] }))
    .filter(({ c }) => c && ["disputed", "resolved"].includes(statusOf(c.status)));
  const docs = await d.collection<DisputeDoc>("disputes").find({ _id: { $in: rows.map((r) => String(r.a._id)) } }).toArray();
  const out = rows.map(({ a, c }) => {
    const doc = docs.find((x) => x._id === String(a._id));
    return {
      id: String(a._id),
      title: a.title,
      image: a.image,
      status: statusOf(c!.status),
      buyer: c!.buyer.toBase58(),
      seller: c!.seller.toBase58(),
      price: c!.price.toNumber(),
      bond: c!.bond.toNumber(),
      reason: c!.disputeReason,
      deliveredAt: c!.deliveredAt.toNumber(),
      evidence: doc?.evidence ?? [],
      recommendation: doc?.recommendation ?? null,
      resolution: doc?.resolution ?? null,
    };
  });
  return Response.json({ open: out.filter((x) => x.status === "disputed"), resolved: out.filter((x) => x.status === "resolved").slice(0, 10) });
}
