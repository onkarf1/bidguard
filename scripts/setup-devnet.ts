/**
 * One-time platform setup after `anchor deploy`.
 *
 *   yarn setup:devnet                       # devnet
 *   RPC_URL=http://127.0.0.1:8899 yarn setup:devnet   # local validator
 *
 * Creates (idempotently):
 *   - an arbiter keypair (signs AI rulings, receives fees, and is the test-USDC mint authority)
 *   - a 6-decimal test USDC mint
 *   - the on-chain Config account (arbiter, treasury, 1% fee)
 * and writes app/.env.local for the Next.js app.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import bs58 from "bs58";
import fs from "fs";
import os from "os";
import path from "path";
import idl from "../target/idl/trustlink.json";
import type { Trustlink } from "../target/types/trustlink";

const FEE_BPS = 100; // 1%
const ROOT = path.resolve(__dirname, "..");
const KEYS = path.join(ROOT, ".keys");
const RPC_URL = process.env.RPC_URL ?? clusterApiUrl("devnet");
const CLUSTER = RPC_URL.includes("127.0.0.1") || RPC_URL.includes("localhost") ? "localnet" : "devnet";

function loadOrCreateKeypair(file: string): Keypair {
  const p = path.join(KEYS, file);
  if (fs.existsSync(p)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
  const kp = Keypair.generate();
  fs.mkdirSync(KEYS, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return kp;
}

async function main() {
  const walletPath = process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json");
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), { commitment: "confirmed" });
  const program = new Program<Trustlink>(idl as Trustlink, provider);

  console.log(`Cluster:  ${CLUSTER} (${RPC_URL})`);
  console.log(`Program:  ${program.programId.toBase58()}`);
  console.log(`Admin:    ${admin.publicKey.toBase58()}`);

  if (!(await connection.getAccountInfo(program.programId))) {
    throw new Error(`Program is not deployed on ${CLUSTER}. Run: anchor deploy --provider.cluster ${CLUSTER}`);
  }

  // 1. Arbiter / ops key
  const arbiter = loadOrCreateKeypair(`arbiter-${CLUSTER}.json`);
  console.log(`Arbiter:  ${arbiter.publicKey.toBase58()}`);
  const arbiterBal = await connection.getBalance(arbiter.publicKey);
  // Top the arbiter up to ~0.5 SOL, but always leave the admin a small reserve.
  const adminBal = await connection.getBalance(admin.publicKey);
  const topUp = Math.min(0.5 * LAMPORTS_PER_SOL - arbiterBal, adminBal - 0.05 * LAMPORTS_PER_SOL);
  if (arbiterBal < 0.2 * LAMPORTS_PER_SOL && topUp < 0.05 * LAMPORTS_PER_SOL) {
    throw new Error(`Admin wallet needs more SOL to fund the arbiter (has ${adminBal / LAMPORTS_PER_SOL})`);
  }
  if (arbiterBal < 0.2 * LAMPORTS_PER_SOL) {
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: arbiter.publicKey,
          lamports: Math.floor(topUp),
        })
      ),
      [admin]
    );
    console.log(`          funded with ${(topUp / LAMPORTS_PER_SOL).toFixed(3)} SOL for rulings + faucet fees`);
  }

  // 2. Test USDC mint (arbiter is mint authority so the app's faucet can mint)
  const mintFile = path.join(KEYS, `usdc-mint-${CLUSTER}.txt`);
  let mint: PublicKey;
  if (fs.existsSync(mintFile) && (await connection.getAccountInfo(new PublicKey(fs.readFileSync(mintFile, "utf8").trim())))) {
    mint = new PublicKey(fs.readFileSync(mintFile, "utf8").trim());
  } else {
    mint = await createMint(connection, admin, arbiter.publicKey, null, 6);
    fs.writeFileSync(mintFile, mint.toBase58());
  }
  console.log(`USDC mint: ${mint.toBase58()} (test token)`);

  // 3. Config
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const existing = await program.account.config.fetchNullable(configPda);
  if (!existing) {
    await program.methods
      .initializeConfig(arbiter.publicKey, arbiter.publicKey, FEE_BPS)
      .accountsPartial({ admin: admin.publicKey, config: configPda, systemProgram: SystemProgram.programId })
      .rpc();
    console.log(`Config:   initialized (fee ${FEE_BPS / 100}%)`);
  } else if (!existing.arbiter.equals(arbiter.publicKey) || !existing.treasury.equals(arbiter.publicKey)) {
    if (!existing.admin.equals(admin.publicKey)) throw new Error("Config exists with a different admin");
    await program.methods
      .updateConfig(arbiter.publicKey, arbiter.publicKey, FEE_BPS)
      .accountsPartial({ admin: admin.publicKey, config: configPda })
      .rpc();
    console.log("Config:   updated to current arbiter");
  } else {
    console.log("Config:   already initialized");
  }

  // 4. Treasury token account (fees land here)
  await getOrCreateAssociatedTokenAccount(connection, admin, mint, arbiter.publicKey);

  // 5. app/.env.local — keep any ANTHROPIC_API_KEY already there
  const envPath = path.join(ROOT, "app/.env.local");
  const prev = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const anthropicKey = prev.match(/^ANTHROPIC_API_KEY=(.*)$/m)?.[1] ?? "";
  fs.writeFileSync(
    envPath,
    [
      `NEXT_PUBLIC_CLUSTER=${CLUSTER}`,
      `NEXT_PUBLIC_RPC_URL=${RPC_URL}`,
      `NEXT_PUBLIC_APP_URL=${process.env.APP_URL ?? "http://localhost:3000"}`,
      `NEXT_PUBLIC_USDC_MINT=${mint.toBase58()}`,
      `ARBITER_SECRET_KEY=${bs58.encode(arbiter.secretKey)}`,
      // An empty ANTHROPIC_API_KEY= would shadow `ant auth login` credentials, so comment it out instead.
      anthropicKey ? `ANTHROPIC_API_KEY=${anthropicKey}` : "# ANTHROPIC_API_KEY=sk-ant-...",
      "",
    ].join("\n"),
    { mode: 0o600 }
  );
  console.log(`\nWrote ${path.relative(ROOT, envPath)}${anthropicKey ? "" : " — add your ANTHROPIC_API_KEY there"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
