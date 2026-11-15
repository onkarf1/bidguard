"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { CLUSTER } from "@/lib/config";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export function Header() {
  const { publicKey } = useWallet();
  const [faucet, setFaucet] = useState<"idle" | "busy" | string>("idle");

  async function drip() {
    if (!publicKey) return;
    setFaucet("busy");
    const res = await fetch("/api/faucet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: publicKey.toBase58() }),
    });
    const body = await res.json();
    setFaucet(res.ok ? `+${body.amount} USDC` : body.error);
    setTimeout(() => setFaucet("idle"), 4000);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <span>TrustLink</span>
          {CLUSTER !== "mainnet-beta" && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-300">
              {CLUSTER}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          {publicKey && CLUSTER !== "mainnet-beta" && (
            <button
              onClick={drip}
              disabled={faucet === "busy"}
              className="hidden rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-brand hover:text-white disabled:opacity-50 sm:block"
            >
              {faucet === "idle" ? "Get test USDC" : faucet === "busy" ? "Minting…" : faucet}
            </button>
          )}
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
