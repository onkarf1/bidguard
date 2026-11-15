"use client";
import { useCallback, useMemo } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, type TransactionInstruction } from "@solana/web3.js";
import { getProgram } from "./program";
import idl from "@/idl/trustlink.json";

export function useTrustlink() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { sendTransaction, signTransaction } = useWallet();
  const program = useMemo(() => getProgram(connection, wallet), [connection, wallet]);

  const send = useCallback(
    async (ixs: TransactionInstruction[]) => {
      if (!wallet) throw new Error("Connect your wallet first");
      if ((await connection.getBalance(wallet.publicKey)) === 0) {
        throw new Error(
          "Your wallet has 0 devnet SOL for fees. Make sure Phantom is in Testnet Mode (Devnet), then get SOL from faucet.solana.com."
        );
      }
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({ feePayer: wallet.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);

      // Simulate on *our* devnet RPC first: wallets often hide the real reason behind "Unexpected error".
      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        const err = new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}`) as Error & { logs?: string[] };
        err.logs = sim.value.logs ?? [];
        throw err;
      }

      let signature: string;
      if (signTransaction) {
        // Sign in the wallet but broadcast through our devnet connection, so it works even if the
        // wallet itself is pointed at another network.
        const signed = await signTransaction(tx);
        signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
      } else {
        signature = await sendTransaction(tx, connection);
      }
      const res = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
      return signature;
    },
    [connection, wallet, sendTransaction, signTransaction]
  );

  return { program, connection, wallet, send };
}

/** Turns wallet / RPC / Anchor errors into something a human can act on. */
export function friendlyError(e: unknown): string {
  const text = [
    e instanceof Error ? e.message : String(e),
    (e as { error?: { message?: string } })?.error?.message,
    ...(((e as { logs?: string[] })?.logs) ?? []),
  ]
    .filter(Boolean)
    .filter((t, i, all) => all.indexOf(t) === i) // wallets repeat the same message in .error
    .join(" ");

  const custom = text.match(/custom program error: 0x([0-9a-f]+)/i);
  if (custom) {
    const code = parseInt(custom[1], 16);
    const known = idl.errors.find((x) => x.code === code);
    if (known) return known.msg;
    if (code === 1) return "Not enough USDC in your wallet. Use the faucet to get test USDC.";
  }
  if (/User rejected/i.test(text)) return "You cancelled the transaction in your wallet.";
  if (/insufficient (funds|lamports)|0x1\b/i.test(text))
    return "Not enough SOL or USDC. Grab devnet SOL from faucet.solana.com and test USDC from the faucet button.";
  if (/AccountNotInitialized|could not find account/i.test(text))
    return "You don't have a USDC token account yet. Use the faucet button to create one.";
  if (/^Unexpected error$/i.test(text.trim()))
    return "Your wallet rejected the transaction. Check Phantom is in Testnet Mode → Solana Devnet and has devnet SOL, then try again.";
  return text.slice(0, 300) || "Something went wrong";
}
