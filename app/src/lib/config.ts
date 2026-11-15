import { PublicKey, clusterApiUrl } from "@solana/web3.js";

export const CLUSTER = (process.env.NEXT_PUBLIC_CLUSTER ?? "devnet") as "devnet" | "mainnet-beta" | "localnet";

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? (CLUSTER === "localnet" ? "http://127.0.0.1:8899" : clusterApiUrl(CLUSTER));

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Test USDC mint created by `yarn setup` (6 decimals). */
export const USDC_MINT = new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
export const USDC_DECIMALS = 6;

/** Auction rules (server-enforced; settlement is enforced on-chain). */
export const SOFT_CLOSE_SECS = 30; // a bid in the last 30 s extends the clock by 30 s
export const MAX_TITLE_LEN = 80;
export const MAX_DESCRIPTION_LEN = 1500;
export const MAX_TRACKING_LEN = 64;
export const MAX_NOTE_LEN = 200;
/** Signed bids stay valid this long after the auction's scheduled end (covers soft-close extensions). */
export const BID_VALIDITY_SECS = 24 * 60 * 60;

export const BLOCKCHAIN_ID = CLUSTER === "mainnet-beta" ? "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" : "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

export function explorerTx(sig: string) {
  const c = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER === "localnet" ? "custom" : CLUSTER}`;
  return `https://explorer.solana.com/tx/${sig}${c}`;
}
export function explorerAddress(addr: string) {
  const c = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER === "localnet" ? "custom" : CLUSTER}`;
  return `https://explorer.solana.com/address/${addr}${c}`;
}
