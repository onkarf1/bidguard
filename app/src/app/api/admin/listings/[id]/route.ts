import { z } from "zod";
import { db } from "@/lib/mongo";
import { isAdmin } from "@/lib/admin";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

const Body = z.object({ action: z.enum(["approve", "reject"]), note: z.string().max(300).optional() });

/** A human moderator approves or rejects a listing the agents held. Recorded with the listing. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) return jsonError(401, "Moderator token required");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "action must be approve or reject");
  const { action, note } = parsed.data;
  const res = await (await db()).collection("listings").findOneAndUpdate(
    { _id: params.id as never, status: { $in: ["held", "rejected"] } },
    { $set: { status: action === "approve" ? "awaiting_signature" : "rejected", moderation: { action, note: note ?? "", at: new Date() } } },
    { returnDocument: "after" }
  );
  if (!res) return jsonError(409, "Listing isn't waiting for review");
  return Response.json({ ok: true, status: res.status });
}
