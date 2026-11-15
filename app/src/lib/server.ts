import "server-only";
import { Connection, Keypair, Transaction, type TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import { RPC_URL } from "./config";
import { getProgram, type SignerWallet } from "./program";

/**
 * Server-held keys:
 *  - operator: approves agent-vetted listings, settles winning bids, reports carrier delivery,
 *              and is the test-USDC mint authority for the faucet
 *  - arbiter:  executes dispute outcomes after a human approves the Dispute Judge's recommendation
 */
function keyFromEnv(name: string): Keypair {
  const raw = process.env[name]?.trim();
  if (!raw) throw new Error(`${name} is not set. Run \`yarn setup\` in the repo root.`);
  return Keypair.fromSecretKey(raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw));
}
export const operatorKeypair = () => keyFromEnv("OPERATOR_SECRET_KEY");
export const arbiterKeypair = () => keyFromEnv("ARBITER_SECRET_KEY");

let conn: Connection | null = null;
export const serverConnection = () => (conn ??= new Connection(RPC_URL, "confirmed"));

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
export const serverProgram = (kp?: Keypair) => getProgram(serverConnection(), kp ? keypairWallet(kp) : undefined);

/** Signs and sends a transaction from server keys; returns the signature once confirmed. */
export async function sendServerTx(ixs: TransactionInstruction[], signers: Keypair[]) {
  const c = serverConnection();
  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: signers[0].publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
  tx.sign(...signers);
  const sig = await c.sendRawTransaction(tx.serialize());
  const res = await c.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
  return sig;
}
