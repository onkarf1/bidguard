import { createHash, randomUUID } from "crypto";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Binary } from "mongodb";
import { z } from "zod";
import { db } from "@/lib/mongo";
import { onchainDispute, type DisputeDoc } from "@/lib/disputes";
import { evidenceDigest, evidenceMessage } from "@/lib/evidence";
import { clientIp, jsonError, rateLimit, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";

const B58 = z.string().min(32).max(100).regex(/^[1-9A-HJ-NP-Za-km-z]+$/);
const Body = z.object({
  wallet: B58,
  statement: z.string().trim().min(10).max(1500),
  images: z.array(z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).max(2_200_000)).max(3).default([]),
  at: z.number().int(),
  signature: B58,
});
const MAX_PER_PARTY = 3;

/** Buyer or seller adds a statement (and photos), signed by their wallet so nobody can speak for them. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(req)) return jsonError(403, "Bad origin");
  if (!(await rateLimit(`evidence:${clientIp(req)}`, 10, 10 * 60_000))) return jsonError(429, "Too many submissions. Try again later.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid evidence");
  const b = parsed.data;

  const chain = await onchainDispute(params.id).catch(() => null);
  if (!chain || chain.status !== "disputed") return jsonError(409, "This auction has no open dispute");
  const party = b.wallet === chain.buyer ? "buyer" : b.wallet === chain.seller ? "seller" : null;
  if (!party) return jsonError(403, "Only the buyer and seller can add evidence");
  if (Math.abs(Date.now() / 1000 - b.at) > 600) return jsonError(400, "Signature expired. Please try again.");

  const imageHashes = b.images.map((u) => createHash("sha256").update(u).digest("hex"));
  const digest = await evidenceDigest(b.statement, imageHashes);
  const msg = new TextEncoder().encode(evidenceMessage(params.id, b.wallet, digest, b.at));
  let ok = false;
  try {
    ok = nacl.sign.detached.verify(msg, bs58.decode(b.signature), new PublicKey(b.wallet).toBytes());
  } catch {}
  if (!ok) return jsonError(403, "Signature doesn't match this evidence");

  const d = await db();
  const existing = await d.collection<DisputeDoc>("disputes").findOne({ _id: params.id });
  if ((existing?.evidence ?? []).filter((e) => e.party === party).length >= MAX_PER_PARTY) return jsonError(409, `You can submit up to ${MAX_PER_PARTY} statements`);

  const imageIds: string[] = [];
  for (const [i, u] of b.images.entries()) {
    const [, mime, b64] = u.match(/^data:(image\/[a-z]+);base64,(.+)$/)!;
    const id = randomUUID();
    await d.collection("images").insertOne({ _id: id as never, disputeId: params.id, party, mime, data: new Binary(Buffer.from(b64, "base64")), sha256: imageHashes[i], createdAt: new Date() });
    imageIds.push(id);
  }
  const evidence = { party, wallet: b.wallet, statement: b.statement, images: imageIds, at: new Date(), signature: b.signature } as DisputeDoc["evidence"][number];
  await d.collection<DisputeDoc>("disputes").updateOne({ _id: params.id }, { $push: { evidence } }, { upsert: true });
  return Response.json({ ok: true, party });
}
