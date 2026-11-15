import { db } from "@/lib/mongo";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/.test(params.id)) return new Response("Not found", { status: 404 });
  const img = await (await db()).collection("images").findOne({ _id: params.id as never });
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(img.data.buffer, {
    headers: { "Content-Type": img.mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
