// Devnet-only faucet: mints test USDC so judges can try the full flow without real money.
import { NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAccount,
} from "@solana/spl-token";
import { CLUSTER, USDC_DECIMALS, USDC_MINT } from "@/lib/config";
import { ata } from "@/lib/program";
import { arbiterKeypair, serverConnection } from "@/lib/server";

export const runtime = "nodejs";
const DRIP = 100; // USDC per request
const MAX_BALANCE = 1_000; // don't top up wallets that already have plenty

export async function POST(req: Request) {
  if (CLUSTER === "mainnet-beta") return NextResponse.json({ error: "Faucet disabled" }, { status: 403 });
  let owner: PublicKey;
  try {
    owner = new PublicKey((await req.json()).wallet);
  } catch {
    return NextResponse.json({ error: "Body must be { wallet: <address> }" }, { status: 400 });
  }

  const authority = arbiterKeypair(); // setup script makes the arbiter the test-mint authority
  const connection = serverConnection();
  const dest = ata(USDC_MINT, owner);

  try {
    const acct = await getAccount(connection, dest);
    if (Number(acct.amount) >= MAX_BALANCE * 10 ** USDC_DECIMALS) {
      return NextResponse.json({ error: `You already have ${MAX_BALANCE}+ test USDC` }, { status: 429 });
    }
  } catch {
    /* account doesn't exist yet — it's created below */
  }

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(authority.publicKey, dest, owner, USDC_MINT),
    createMintToInstruction(USDC_MINT, dest, authority.publicKey, DRIP * 10 ** USDC_DECIMALS)
  );
  try {
    const signature = await connection.sendTransaction(tx, [authority]);
    await connection.confirmTransaction(signature, "confirmed");
    return NextResponse.json({ signature, amount: DRIP });
  } catch (e) {
    console.error("faucet failed", e);
    return NextResponse.json(
      { error: "Faucet failed. Is NEXT_PUBLIC_USDC_MINT the test mint created by setup:devnet?" },
      { status: 500 }
    );
  }
}
