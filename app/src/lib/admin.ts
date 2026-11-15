import "server-only";
import { timingSafeEqual } from "crypto";

/** Moderator access: a shared ADMIN_TOKEN (set in env). Humans make the final call on held listings and disputes. */
export function isAdmin(req: Request) {
  const want = process.env.ADMIN_TOKEN ?? "";
  const got = req.headers.get("x-admin-token") ?? "";
  if (want.length < 16 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
