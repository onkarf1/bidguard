import { db } from "@/lib/mongo";
import { isAdmin } from "@/lib/admin";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

/** Hides an auction from public lists (used for automated test runs). The auction and its on-chain state are untouched. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return jsonError(401, "Moderator token required");
  const { hidden = true } = await req.json().catch(() => ({}));
  const r = await (await db()).collection("auctions").updateOne({ _id: params.id as never }, { $set: { hidden: !!hidden } });
  if (!r.matchedCount) return jsonError(404, "Auction not found");
  return Response.json({ ok: true, hidden: !!hidden });
}
