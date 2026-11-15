import { BN } from "@coral-xyz/anchor";
import { USDC_DECIMALS } from "./config";

const UNIT = 10 ** USDC_DECIMALS;

export const toBaseUnits = (usdc: number) => Math.round(usdc * UNIT);
export const fromBaseUnits = (v: number | BN | bigint) => Number(typeof v === "object" && "toNumber" in v ? v.toNumber() : v) / UNIT;
export const usd = (baseUnits: number | BN | bigint) =>
  fromBaseUnits(baseUnits).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const short = (addr: string, n = 4) => (addr.length > 2 * n + 1 ? `${addr.slice(0, n)}…${addr.slice(-n)}` : addr);

export function timeLeft(ms: number) {
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
