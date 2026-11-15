import { ObjectId } from "mongodb";
import { db } from "@/lib/mongo";
import { closeIfEnded, type AuctionDoc, type AuctionEvent } from "@/lib/auctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Server-Sent Events for one auction room: bid_placed, outbid, timer_extended, auction_closed…
 * Polls the events collection (cheap indexed query) and closes the auction when time is up.
 * EventSource reconnects automatically and resumes from Last-Event-ID.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const d = await db();
  const auctionId = params.id;
  if (!(await d.collection<AuctionDoc>("auctions").findOne({ _id: auctionId }, { projection: { _id: 1 } }))) return new Response("Not found", { status: 404 });
  const resume = req.headers.get("last-event-id");
  let last: ObjectId | null = resume && ObjectId.isValid(resume) ? new ObjectId(resume) : null;
  if (!last) {
    const newest = await d.collection<AuctionEvent>("events").find({ auctionId }).sort({ _id: -1 }).limit(1).next();
    last = newest?._id as ObjectId | null;
  }
  const encoder = new TextEncoder();
  const started = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      req.signal.addEventListener("abort", () => (open = false));
      const write = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          open = false;
        }
      };
      write("retry: 1500\n\n");
      while (open && Date.now() - started < 280_000) {
        const filter = last ? { auctionId, _id: { $gt: last } } : { auctionId };
        const events = await d.collection<AuctionEvent>("events").find(filter).sort({ _id: 1 }).limit(50).toArray();
        for (const e of events) {
          last = e._id as unknown as ObjectId;
          write(`id: ${String(e._id)}\nevent: ${e.type}\ndata: ${JSON.stringify({ ...e.data, at: e.at })}\n\n`);
        }
        const a = await d.collection<AuctionDoc>("auctions").findOne({ _id: auctionId }, { projection: { status: 1, endsAt: 1 } });
        if (a?.status === "live" && a.endsAt <= new Date()) await closeIfEnded(auctionId);
        write(`: ping\n\n`);
        await new Promise((r) => setTimeout(r, 700));
      }
      try {
        controller.close();
      } catch {}
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
