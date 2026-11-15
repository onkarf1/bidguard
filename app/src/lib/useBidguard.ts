"use client";
import { useCallback, useMemo } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, type TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import { getProgram } from "./program";
import { bidMessage } from "./bid";
import idl from "@/idl/bidguard.json";

export function useBidguard() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { signTransaction, sendTransaction, signMessage } = useWallet();
  const program = useMemo(() => getProgram(connection, wallet), [connection, wallet]);

  /** Simulates on our RPC first (wallets hide real errors), then signs in the wallet and broadcasts. */
  const send = useCallback(
    async (ixsOrTx: TransactionInstruction[] | Transaction) => {
      if (!wallet) throw new Error("Connect your wallet first");
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      let tx: Transaction;
      if (ixsOrTx instanceof Transaction) {
        tx = ixsOrTx; // pre-built and partially signed by the server (keep its blockhash)
      } else {
        tx = new Transaction({ feePayer: wallet.publicKey, blockhash, lastValidBlockHeight }).add(...ixsOrTx);
        const sim = await connection.simulateTransaction(tx);
        if (sim.value.err) throw Object.assign(new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}`), { logs: sim.value.logs ?? [] });
      }
      let sig: string;
      if (signTransaction) {
        const signed = await signTransaction(tx);
        sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
      } else {
        sig = await sendTransaction(tx, connection);
      }
      const res = await connection.confirmTransaction({ signature: sig, blockhash: tx.recentBlockhash ?? blockhash, lastValidBlockHeight }, "confirmed");
      if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
      return sig;
    },
    [connection, wallet, signTransaction, sendTransaction]
  );

  /** Signs a bid with the wallet: gas-free, instant, and verifiable on-chain at settlement. */
  const signBid = useCallback(
    async (auction: string, amount: number, expiry: number) => {
      if (!wallet || !signMessage) throw new Error("Your wallet can't sign messages. Try Phantom or Solflare.");
      const nonce = Date.now();
      const sig = await signMessage(new TextEncoder().encode(bidMessage(auction, amount, nonce, expiry)));
      return { bidder: wallet.publicKey.toBase58(), amount, nonce, expiry, signature: bs58.encode(sig) };
    },
    [wallet, signMessage]
  );

  return { program, connection, wallet, send, signBid };
}

/** Turns wallet / RPC / program errors into something a person can act on. */
export function friendlyError(e: unknown): string {
  const text = [e instanceof Error ? e.message : String(e), (e as { error?: { message?: string } })?.error?.message, ...(((e as { logs?: string[] })?.logs) ?? [])]
    .filter(Boolean)
    .filter((t, i, all) => all.indexOf(t) === i)
    .join(" ");
  const custom = text.match(/custom program error: 0x([0-9a-f]+)/i);
  if (custom) {
    const code = parseInt(custom[1], 16);
    const known = idl.errors.find((x) => x.code === code);
    if (known) return known.msg;
    if (code === 1) return "Not enough USDC in your wallet. Use “Get test USDC” first.";
  }
  if (/User rejected|rejected the request/i.test(text)) return "You cancelled in your wallet.";
  if (/insufficient (funds|lamports)|0x1\b/i.test(text)) return "Not enough SOL or USDC. Get devnet SOL at faucet.solana.com and test USDC from the top bar.";
  if (/AccountNotInitialized|could not find account/i.test(text)) return "You don't have a USDC account yet. Tap “Get test USDC” in the top bar.";
  if (/^Unexpected error$/i.test(text.trim())) return "Your wallet rejected the transaction. Check it's on Devnet and has some SOL.";
  return text.slice(0, 300) || "Something went wrong";
}
