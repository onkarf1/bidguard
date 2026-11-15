import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { db } from "@/lib/mongo";
import { isAdmin } from "@/lib/admin";
import { onchainDispute, type DisputeDoc } from "@/lib/disputes";
import { fitBytes, resolveDisputeIxs } from "@/lib/program";
import { arbiterKeypair, sendServerTx, serverProgram } from "@/lib/server";
import { MAX_NOTE_LEN } from "@/lib/config";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

const Body = z.object({ buyerBps: z.number().int().min(0).max(10000), note: z.string().trim().min(3).max(400) });

/** The human arbiter executes a ruling on-chain (usually the AI's recommendation, possibly adjusted). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return jsonError(401, "Moderator token required");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "buyerBps (0–10000) and a note are required");
  const { buyerBps, note } = parsed.data;
  const chain = await onchainDispute(params.id);
  if (!chain || chain.status !== "disputed") return jsonError(409, "This dispute isn't open");

  const arbiter = arbiterKeypair();
  const program = serverProgram(arbiter);
  const onchainNote = fitBytes(note, MAX_NOTE_LEN);
  let tx: string;
  try {
    tx = await sendServerTx(await resolveDisputeIxs(program, new PublicKey(params.id), arbiter.publicKey, buyerBps, onchainNote), [arbiter]);
  } catch (e) {
    console.error("resolve_dispute failed", e);
    return jsonError(502, "The on-chain ruling failed. Check the arbiter key has SOL and try again.");
  }
  const d = await db();
  const doc = await d.collection<DisputeDoc>("disputes").findOne({ _id: params.id });
  const resolution = { buyerBps, note: onchainNote, tx, followedAi: doc?.recommendation?.buyer_bps === buyerBps, at: new Date() };
  await d.collection<DisputeDoc>("disputes").updateOne({ _id: params.id }, { $set: { resolution }, $setOnInsert: { evidence: [] } }, { upsert: true });
  return Response.json({ ok: true, resolution });
}
