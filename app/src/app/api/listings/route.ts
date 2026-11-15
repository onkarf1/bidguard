import { createHash, randomUUID } from "crypto";
import { Binary } from "mongodb";
import { z } from "zod";
import { db } from "@/lib/mongo";
import { vetListing, type ListingInput } from "@/lib/agents";
import { MAX_DESCRIPTION_LEN, MAX_TITLE_LEN } from "@/lib/config";
import { toBaseUnits } from "@/lib/format";
import { clientIp, jsonError, rateLimit, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 120;

const B58 = z.string().min(32).max(50).regex(/^[1-9A-HJ-NP-Za-km-z]+$/);
const Image = z.object({
  dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).max(2_200_000),
  dhash: z.string().regex(/^[0-9a-f]{16}$/),
  exif: z.object({ make: z.string().max(60).optional(), model: z.string().max(60).optional(), taken: z.string().max(40).optional(), software: z.string().max(80).optional(), hasGps: z.boolean().optional() }).nullable(),
});
const Body = z.object({
  seller: B58,
  title: z.string().trim().min(3).max(MAX_TITLE_LEN),
  description: z.string().trim().min(10).max(MAX_DESCRIPTION_LEN),
  category: z.string().trim().min(2).max(40),
  condition: z.enum(["new", "like new", "good", "fair", "for parts"]),
  startPrice: z.number().min(1).max(1_000_000),
  durationMinutes: z.number().int().min(2).max(7 * 24 * 60),
  images: z.array(Image).min(1).max(4),
});

/**
 * Creates a listing and streams the agent crew's work as NDJSON lines:
 *   {"type":"trace", ...}  while agents run (in parallel)
 *   {"type":"result", listing}  at the end. Approved listings then fetch their operator-co-signed
 *   create_auction transaction from /api/listings/[id]/tx for the seller's wallet to sign.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError(403, "Bad origin");
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return jsonError(400, e instanceof z.ZodError ? (e.issues[0]?.message ?? "Invalid listing") : "Invalid listing");
  }
  if (!(await rateLimit(`listing:${clientIp(req)}`, 8, 10 * 60_000)) || !(await rateLimit(`listing:${body.seller}`, 8, 10 * 60_000))) {
    return jsonError(429, "Too many listings. Try again in a few minutes.");
  }

  const d = await db();
  const listingId = randomUUID();
  const images = body.images.map((img) => ({ ...img, sha256: createHash("sha256").update(img.dataUrl).digest("hex") }));
  const imageIds: string[] = [];
  for (const img of images) {
    const [, mime, b64] = img.dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/)!;
    const id = randomUUID();
    await d.collection("images").insertOne({ _id: id as never, listingId, seller: body.seller, mime, data: new Binary(Buffer.from(b64, "base64")), sha256: img.sha256, dhash: img.dhash, exif: img.exif, createdAt: new Date() });
    imageIds.push(id);
  }
  const startPrice = toBaseUnits(body.startPrice);
  const listing = {
    _id: listingId,
    seller: body.seller,
    title: body.title,
    description: body.description,
    category: body.category,
    condition: body.condition,
    startPrice,
    durationMinutes: body.durationMinutes,
    images: imageIds,
    status: "vetting",
    createdAt: new Date(),
  };
  await d.collection("listings").insertOne(listing as never);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      try {
        const input: ListingInput = { listingId, seller: body.seller, title: body.title, description: body.description, category: body.category, condition: body.condition, startPrice, images };
        const trust = await vetListing(input, (e) => {
          send({ type: "trace", ...e, at: Date.now() });
          if (e.status !== "running") d.collection("agent_runs").insertOne({ listingId, agent: e.agent, status: e.status, latencyMs: e.ms, output: e.output ?? e.summary, at: new Date() }).catch(() => {});
        });
        const listingHash = createHash("sha256").update(JSON.stringify({ title: body.title, description: body.description, startPrice, images: images.map((i) => i.sha256) })).digest();
        const status = trust.decision === "reject" ? "rejected" : trust.decision === "hold" ? "held" : "awaiting_signature";
        await d.collection("listings").updateOne({ _id: listingId as never }, { $set: { status, trust, listingHash: listingHash.toString("hex") } });
        send({ type: "result", listing: { ...listing, status, trust } });
      } catch (e) {
        console.error("listing vetting failed", e);
        await d.collection("listings").updateOne({ _id: listingId as never }, { $set: { status: "failed" } });
        send({ type: "error", error: "Vetting failed. Please try again." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}

/** Recent listings by a seller (for the seller dashboard). */
export async function GET(req: Request) {
  const seller = new URL(req.url).searchParams.get("seller");
  if (!seller || !B58.safeParse(seller).success) return jsonError(400, "seller required");
  const rows = await (await db()).collection("listings").find({ seller }).sort({ createdAt: -1 }).limit(20).toArray();
  return Response.json({ listings: rows });
}
