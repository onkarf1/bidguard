import { PublicKey } from "@solana/web3.js";
import { db } from "@/lib/mongo";
import { onchainDispute, type DisputeDoc } from "@/lib/disputes";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dispute file: on-chain facts, both parties' evidence, the AI recommendation and the final ruling. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    new PublicKey(params.id);
  } catch {
    return jsonError(404, "Not found");
  }
  const chain = await onchainDispute(params.id);
  if (!chain || !["disputed", "resolved"].includes(chain.status)) return jsonError(404, "No dispute for this auction");
  const doc = await (await db()).collection<DisputeDoc>("disputes").findOne({ _id: params.id });
  return Response.json({ chain, evidence: doc?.evidence ?? [], recommendation: doc?.recommendation ?? null, resolution: doc?.resolution ?? null });
}
