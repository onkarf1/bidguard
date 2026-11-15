import "server-only";
import { NextResponse } from "next/server";
import { db } from "./mongo";

export const jsonError = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

/** CSRF defence for browser-called JSON endpoints: Origin must match the host. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

/** Shared fixed-window rate limit stored in MongoDB (works across serverless instances). */
export async function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const res = await (await db())
    .collection<{ _id: string; n: number; expires: Date }>("rate_limits")
    .findOneAndUpdate({ _id: `${key}:${window}` }, { $inc: { n: 1 }, $setOnInsert: { expires: new Date((window + 1) * windowMs + 60_000) } }, { upsert: true, returnDocument: "after" });
  return (res?.n ?? 1) <= limit;
}
