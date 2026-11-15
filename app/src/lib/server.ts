import "server-only";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { RPC_URL } from "./config";
import { getProgram, type SignerWallet } from "./program";

/** Loads the arbiter key from ARBITER_SECRET_KEY (base58 or a JSON byte array). */
export function arbiterKeypair(): Keypair {
  const raw = process.env.ARBITER_SECRET_KEY?.trim();
  if (!raw) throw new Error("ARBITER_SECRET_KEY is not set. Run `yarn setup:devnet` first.");
  const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw);
  return Keypair.fromSecretKey(bytes);
}

export function serverConnection() {
  return new Connection(RPC_URL, "confirmed");
}

export function keypairWallet(kp: Keypair): SignerWallet {
  return {
    publicKey: kp.publicKey,
    signTransaction: async (tx) => {
      if ("version" in tx) tx.sign([kp]);
      else tx.partialSign(kp);
      return tx;
    },
    signAllTransactions: async (txs) => {
      for (const tx of txs) {
        if ("version" in tx) tx.sign([kp]);
        else tx.partialSign(kp);
      }
      return txs;
    },
  };
}

export function serverProgram(kp?: Keypair) {
  return getProgram(serverConnection(), kp ? keypairWallet(kp) : undefined);
}
