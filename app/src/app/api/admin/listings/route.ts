import { db } from "@/lib/mongo";
import { isAdmin } from "@/lib/admin";
import { publicListing } from "@/lib/listings";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Moderation queue: held listings first, then recent decisions. */
export async function GET(req: Request) {
  if (!isAdmin(req)) return jsonError(401, "Moderator token required");
  const d = await db();
  const [held, recent] = await Promise.all([
    d.collection("listings").find({ status: "held" }).sort({ createdAt: 1 }).limit(50).toArray(),
    d.collection("listings").find({ status: { $in: ["rejected", "awaiting_signature", "live"] } }).sort({ createdAt: -1 }).limit(20).toArray(),
  ]);
  return Response.json({ held: held.map(publicListing), recent: recent.map(publicListing) });
}
