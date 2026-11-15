import { PublicKey, clusterApiUrl } from "@solana/web3.js";

export const CLUSTER = (process.env.NEXT_PUBLIC_CLUSTER ?? "devnet") as
  | "devnet"
  | "mainnet-beta"
  | "localnet";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  (CLUSTER === "localnet" ? "http://127.0.0.1:8899" : clusterApiUrl(CLUSTER));

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Test USDC mint created by `yarn setup:devnet` (falls back to Circle's devnet USDC). */
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);
export const USDC_DECIMALS = 6;

/** Mirrors the on-chain constants in programs/trustlink/src/lib.rs. */
export const REVIEW_PERIOD_SECS = 3 * 24 * 60 * 60;
export const DISPUTE_RESPONSE_SECS = 24 * 60 * 60;
export const MAX_TITLE_LEN = 64;
export const MAX_TERMS_LEN = 256;
export const MAX_NOTE_LEN = 200;

/** CAIP-2 chain IDs used by Solana Actions (Blinks). */
export const BLOCKCHAIN_ID =
  CLUSTER === "mainnet-beta"
    ? "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
    : "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

export function explorerTx(sig: string) {
  const c = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER === "localnet" ? "custom" : CLUSTER}`;
  return `https://explorer.solana.com/tx/${sig}${c}`;
}

export function blinkUrl(dealAddress: string) {
  const action = `solana-action:${APP_URL}/api/actions/deal/${dealAddress}`;
  return `https://dial.to/?action=${encodeURIComponent(action)}&cluster=${CLUSTER}`;
}
