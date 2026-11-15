import { db } from "@/lib/mongo";
import { publicListing } from "@/lib/listings";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const l = await (await db()).collection("listings").findOne({ _id: params.id as never });
  if (!l) return jsonError(404, "Listing not found");
  const auction = await (await db()).collection("auctions").findOne({ listingId: params.id }, { projection: { _id: 1 } });
  return Response.json({ listing: publicListing(l), auctionId: auction?._id ?? null });
}
