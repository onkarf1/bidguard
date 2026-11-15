import { db } from "@/lib/mongo";
import { judgeDispute, type DisputeDoc } from "@/lib/disputes";
import { isAdmin } from "@/lib/admin";
import { clientIp, jsonError, rateLimit, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Asks the Dispute Judge for a (new) recommendation. Advisory only: nothing moves on-chain. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!sameOrigin(req) && !isAdmin(req)) return jsonError(403, "Bad origin");
  if (!(await rateLimit(`judge:${clientIp(req)}`, 6, 10 * 60_000))) return jsonError(429, "Too many requests. Try again in a few minutes.");
  const doc = await (await db()).collection<DisputeDoc>("disputes").findOne({ _id: params.id });
  // Re-judging only makes sense when there's new evidence (or an admin asks).
  if (doc?.recommendation && doc.recommendation.evidenceCount === (doc.evidence?.length ?? 0) && !isAdmin(req)) {
    return Response.json({ recommendation: doc.recommendation, cached: true });
  }
  const recommendation = await judgeDispute(params.id);
  if (!recommendation) return jsonError(409, "The judge couldn't review this dispute right now (is it still open?)");
  return Response.json({ recommendation });
}
