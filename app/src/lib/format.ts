import { BN } from "@coral-xyz/anchor";
import { USDC_DECIMALS } from "./config";

export function toBaseUnits(amount: string): BN {
  const [whole, frac = ""] = amount.trim().split(".");
  if (!/^\d+$/.test(whole || "0") || !/^\d*$/.test(frac)) throw new Error("Invalid amount");
  const padded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return new BN((whole || "0") + padded);
}

export function fromBaseUnits(amount: BN | number | bigint): string {
  const s = amount.toString().padStart(USDC_DECIMALS + 1, "0");
  const whole = s.slice(0, -USDC_DECIMALS);
  const frac = s.slice(-USDC_DECIMALS).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export const shortKey = (k: { toBase58(): string } | string) => {
  const s = typeof k === "string" ? k : k.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
};

export function formatDate(unixSecs: number) {
  return new Date(unixSecs * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function timeLeft(unixSecs: number) {
  const diff = unixSecs - Date.now() / 1000;
  if (diff <= 0) return "passed";
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}
