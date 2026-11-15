/**
 * One-time platform setup after `anchor deploy` (idempotent; safe to re-run).
 *
 *   yarn setup                                      # devnet
 *   RPC_URL=http://127.0.0.1:8899 yarn setup        # local validator
 *
 * Creates the operator key (auction server + agent orchestrator + carrier oracle + test-USDC
 * mint authority) and the arbiter key (executes dispute outcomes; receives fees), a 6-decimal
 * test USDC mint, initializes the on-chain Config, and writes the Solana settings into
 * app/.env.local while keeping every other line (MongoDB, Gemini, …) untouched.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, clusterApiUrl, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import bs58 from "bs58";
import fs from "fs";
import os from "os";
import path from "path";
import idl from "../target/idl/bidguard.json";
import type { Bidguard } from "../target/types/bidguard";

const USDC = 1_000_000;
const PARAMS = {
  feeBps: 250, // 2.5% escrow fee on settled sales
  bondBps: 500, // seller bond: 5% of the start price…
  minBond: new BN(1 * USDC), // …at least 1 USDC
  shipWindowSecs: new BN(3 * 24 * 3600),
  releaseWindowSecs: new BN(2 * 24 * 3600),
  withdrawCooldownSecs: new BN(10 * 60),
};
const ROOT = path.resolve(__dirname, "..");
const KEYS = path.join(ROOT, ".keys");
const RPC_URL = process.env.RPC_URL ?? clusterApiUrl("devnet");
const CLUSTER = /127\.0\.0\.1|localhost/.test(RPC_URL) ? "localnet" : "devnet";

function key(file: string): Keypair {
  const p = path.join(KEYS, file);
  if (fs.existsSync(p)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
  const kp = Keypair.generate();
  fs.mkdirSync(KEYS, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return kp;
}

async function topUp(conn: Connection, admin: Keypair, to: PublicKey, target: number) {
  const bal = await conn.getBalance(to);
  if (bal >= target * LAMPORTS_PER_SOL * 0.5) return;
  const lamports = Math.floor(target * LAMPORTS_PER_SOL - bal);
  await sendAndConfirmTransaction(conn, new Transaction().add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: to, lamports })), [admin]);
  console.log(`          topped up ${to.toBase58().slice(0, 6)}… to ${target} SOL`);
}

async function main() {
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json"), "utf8"))));
  const conn = new Connection(RPC_URL, "confirmed");
  const program = new Program<Bidguard>(idl as Bidguard, new anchor.AnchorProvider(conn, new anchor.Wallet(admin), { commitment: "confirmed" }));
  console.log(`Cluster:   ${CLUSTER} (${RPC_URL})\nProgram:   ${program.programId.toBase58()}\nAdmin:     ${admin.publicKey.toBase58()}`);
  if (!(await conn.getAccountInfo(program.programId))) throw new Error(`Program not deployed on ${CLUSTER}. Run: anchor deploy --provider.cluster ${CLUSTER}`);

  const operator = key(`operator-${CLUSTER}.json`);
  const arbiter = key(`arbiter-bidguard-${CLUSTER}.json`);
  console.log(`Operator:  ${operator.publicKey.toBase58()}\nArbiter:   ${arbiter.publicKey.toBase58()}`);
  await topUp(conn, admin, operator.publicKey, 1); // pays for settlements, faucet accounts, oracle updates
  await topUp(conn, admin, arbiter.publicKey, 0.2);

  const mintFile = path.join(KEYS, `bidguard-usdc-${CLUSTER}.txt`);
  let mint: PublicKey;
  if (fs.existsSync(mintFile) && (await conn.getAccountInfo(new PublicKey(fs.readFileSync(mintFile, "utf8").trim())))) {
    mint = new PublicKey(fs.readFileSync(mintFile, "utf8").trim());
  } else {
    mint = await createMint(conn, admin, operator.publicKey, null, 6);
    fs.writeFileSync(mintFile, mint.toBase58());
  }
  console.log(`USDC mint: ${mint.toBase58()} (test token; operator is mint authority for the faucet)`);

  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const params = { operator: operator.publicKey, arbiter: arbiter.publicKey, treasury: arbiter.publicKey, ...PARAMS };
  const existing = await program.account.config.fetchNullable(config);
  if (!existing) {
    await program.methods.initializeConfig(params).accountsPartial({ admin: admin.publicKey, config, mint, systemProgram: SystemProgram.programId }).rpc();
    console.log("Config:    initialized");
  } else {
    await program.methods.updateConfig(params).accountsPartial({ admin: admin.publicKey, config }).rpc();
    console.log("Config:    updated");
  }
  await getOrCreateAssociatedTokenAccount(conn, admin, mint, arbiter.publicKey); // fee treasury

  // Rewrite only the Solana-related lines of app/.env.local; keep everything else.
  const envPath = path.join(ROOT, "app/.env.local");
  const managed: Record<string, string> = {
    NEXT_PUBLIC_CLUSTER: CLUSTER,
    NEXT_PUBLIC_RPC_URL: RPC_URL,
    NEXT_PUBLIC_USDC_MINT: mint.toBase58(),
    OPERATOR_SECRET_KEY: bs58.encode(operator.secretKey),
    ARBITER_SECRET_KEY: bs58.encode(arbiter.secretKey),
  };
  const kept = (fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "")
    .split("\n")
    .filter((l) => l.trim() && !Object.keys(managed).some((k) => l.startsWith(`${k}=`)) && !/^(LLM_|ANTHROPIC_|# ANTHROPIC)/.test(l));
  if (!kept.some((l) => l.startsWith("NEXT_PUBLIC_APP_URL="))) kept.unshift("NEXT_PUBLIC_APP_URL=http://localhost:3000");
  fs.writeFileSync(envPath, [...Object.entries(managed).map(([k, v]) => `${k}=${v}`), ...kept, ""].join("\n"), { mode: 0o600 });
  console.log(`\nWrote Solana settings to app/.env.local (other settings kept).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
