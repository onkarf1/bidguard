/**
 * Seeds the marketplace with demo auctions built from app/src/lib/samples.ts (real, freely
 * licensed photos). Every listing goes through the real pipeline: agent vetting → moderator
 * approval if held → on-chain create_auction → live room. Demo bidders then deposit and bid.
 *
 *   yarn seed                                   # 6 auctions against http://localhost:3000
 *   APP=https://bidguard-app.vercel.app COUNT=8 yarn seed
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import nacl from "tweetnacl";
import jpeg from "jpeg-js";
import fs from "fs";
import os from "os";
import path from "path";
import idl from "../target/idl/bidguard.json";
import type { Bidguard } from "../target/types/bidguard";
import { SAMPLES, creditLine } from "../app/src/lib/samples";

const APP = process.env.APP ?? "http://localhost:3000";
const COUNT = Math.min(SAMPLES.length, Number(process.env.COUNT ?? 6));
const ROOT = path.resolve(__dirname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, "app/.env.local"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const conn = new Connection(env.NEXT_PUBLIC_RPC_URL, "confirmed");
const MINT = new PublicKey(env.NEXT_PUBLIC_USDC_MINT);
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8"))));
const U = 1_000_000;
const DURATIONS = [25, 45, 90, 180, 360, 720, 1440, 120, 60, 240]; // minutes, so auctions end at staggered times
// MINUTES=3 makes short auctions that end (and settle) soon, to fill "Recently ended".
const FIXED_MINUTES = process.env.MINUTES ? Math.max(2, Number(process.env.MINUTES)) : null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const pda = (...s: Buffer[]) => PublicKey.findProgramAddressSync(s, new PublicKey(idl.address))[0];
const ata = (o: PublicKey) => getAssociatedTokenAddressSync(MINT, o, true);
const prog = (kp: Keypair) => new Program<Bidguard>(idl as Bidguard, new anchor.AnchorProvider(conn, new anchor.Wallet(kp), { commitment: "confirmed" }));

function key(name: string) {
  const p = path.join(ROOT, ".keys", name);
  if (fs.existsSync(p)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
  const kp = Keypair.generate();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  return kp;
}

/** Same 64-bit difference hash the browser computes (box-averaged 9×8 grayscale). */
function dhash(buf: Buffer) {
  const { width: w, height: h, data } = jpeg.decode(buf, { useTArray: true });
  const g = (gx: number, gy: number) => {
    const x0 = Math.floor((gx * w) / 9), x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * w) / 9));
    const y0 = Math.floor((gy * h) / 8), y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * h) / 8));
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * w + x) * 4;
      s += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      n++;
    }
    return s / n;
  };
  let hex = "";
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (g(x, y) > g(x + 1, y) ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return { hex, width: w, height: h };
}

async function api(p: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(APP + p, body === undefined ? { headers } : { method: "POST", headers: { "Content-Type": "application/json", Origin: APP, ...headers }, body: JSON.stringify(body) });
  const t = await r.text();
  try {
    return { ok: r.ok, j: JSON.parse(t) };
  } catch {
    return { ok: r.ok, j: { raw: t } };
  }
}

async function fundSol(to: PublicKey[], sol: number) {
  const tx = new Transaction();
  for (const k of to) if ((await conn.getBalance(k)) < (sol / 2) * LAMPORTS_PER_SOL) tx.add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: k, lamports: sol * LAMPORTS_PER_SOL }));
  if (tx.instructions.length) await sendAndConfirmTransaction(conn, tx, [admin]);
}

async function deposit(k: Keypair, amount: number) {
  await prog(k).methods.deposit(new BN(amount * U)).accountsPartial({ bidder: k.publicKey, config: pda(Buffer.from("config")), vault: pda(Buffer.from("vault"), k.publicKey.toBuffer()), vaultTokens: pda(Buffer.from("vault_tokens"), k.publicKey.toBuffer()), bidderToken: ata(k.publicKey), mint: MINT, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).rpc();
}

async function bid(auction: string, who: Keypair, amount: number, endsAt: number) {
  const nonce = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const expiry = endsAt + 24 * 3600;
  const msg = `BidGuard bid v1\nauction: ${auction}\namount: ${amount}\nnonce: ${nonce}\nexpires: ${expiry}`;
  return api(`/api/auctions/${auction}/bids`, { bidder: who.publicKey.toBase58(), amount, nonce, expiry, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(msg), who.secretKey)) });
}

async function main() {
  const bidders = [key("demo-bidder-1.json"), key("demo-bidder-2.json"), key("demo-bidder-3.json")];
  // Skip samples already on the site (their photos would rightly be flagged as reused).
  const existing = await api("/api/auctions");
  const used = new Set([...(existing.j.live ?? []), ...(existing.j.ended ?? [])].map((a: { title: string }) => a.title));
  // Also skip anything submitted before, even if it was rejected (its photo is already on file).
  const triedFile = path.join(ROOT, ".keys", "seeded-items.json");
  const tried: string[] = fs.existsSync(triedFile) ? JSON.parse(fs.readFileSync(triedFile, "utf8")) : [];
  const picks = SAMPLES.filter((s) => !used.has(s.title) && !tried.includes(s.slug)).sort(() => Math.random() - 0.5).slice(0, COUNT);
  fs.writeFileSync(triedFile, JSON.stringify([...tried, ...picks.map((p) => p.slug)]));
  if (!picks.length) return log("Every sample item is already listed.");
  const sellers = picks.map(() => Keypair.generate());
  await fundSol([...bidders.map((b) => b.publicKey), ...sellers.map((s) => s.publicKey)], 0.05);
  // Paced: the public devnet RPC rate-limits bursts.
  for (const k of sellers) {
    await api("/api/faucet", { wallet: k.publicKey.toBase58() });
    await sleep(1500);
  }
  // Demo bidders need enough in their vaults for realistic prices (faucet: 100 per call, up to 1000).
  for (const b of bidders) {
    for (let i = 0; i < 6; i++) {
      if (!(await api("/api/faucet", { wallet: b.publicKey.toBase58() })).ok) break;
      await sleep(1500);
    }
    const bal = Number((await conn.getTokenAccountBalance(ata(b.publicKey)).catch(() => ({ value: { amount: "0" } }))).value.amount) / U;
    if (bal >= 10) await deposit(b, Math.floor(bal) - 5).catch((e) => log("deposit skipped:", String(e).slice(0, 80)));
  }
  log(`demo bidders ready; seeding ${COUNT} auctions on ${APP}`);

  const created: { id: string; endsAt: number; start: number; inc: number }[] = [];
  for (const [i, s] of picks.entries()) {
    const seller = sellers[i];
    const file = fs.readFileSync(path.join(ROOT, "app/public", s.image));
    const { hex, width, height } = dhash(file);
    // Realistic starting prices (a too-low price is exactly what Price Sanity flags as a scam lure).
    const start = s.price;
    const res = await fetch(APP + "/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: APP },
      body: JSON.stringify({ seller: seller.publicKey.toBase58(), title: s.title, description: `${s.description}\n\n${creditLine(s)}`, category: s.category, condition: s.condition, startPrice: start, durationMinutes: FIXED_MINUTES ?? DURATIONS[i % DURATIONS.length], images: [{ dataUrl: `data:image/jpeg;base64,${file.toString("base64")}`, dhash: hex, exif: null, aiMarkers: [], width, height }] }),
    });
    const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const result = lines.find((l) => l.type === "result");
    if (!result) {
      log(`✗ ${s.title}: ${lines.find((l) => l.type === "error")?.error ?? res.status}`);
      continue;
    }
    const lid = result.listing._id;
    const t = result.listing.trust;
    log(`  ${s.title}: Trust ${t.score} → ${t.decision}`);
    if (result.listing.status === "held" || result.listing.status === "rejected") {
      // Moderator review of a demo item. Demo seller wallets are all new and funded by one admin
      // wallet, so Seller Risk (correctly) flags them as a sybil cluster. A moderator approves only
      // when the item itself is clean: fair price, photo not reused, not AI-generated.
      const ag = t.agents ?? {};
      const clean = ag.price?.flag !== "suspiciously_low" && !ag.inspector?.reused_photo && ag.aiImage?.verdict !== "likely_ai";
      if (!clean) {
        log(`    left ${result.listing.status}: ${t.reasons[0]}`);
        continue;
      }
      await api(`/api/admin/listings/${lid}`, { action: "approve", note: "Demo item reviewed: fair price, original photo; risk comes from shared demo funding" }, { "x-admin-token": env.ADMIN_TOKEN });
    }
    const built = await api(`/api/listings/${lid}/tx`, { seller: seller.publicKey.toBase58() });
    if (!built.ok) {
      log(`✗ tx: ${built.j.error}`);
      continue;
    }
    const tx = Transaction.from(Buffer.from(built.j.tx, "base64"));
    tx.partialSign(seller);
    await conn.confirmTransaction(await conn.sendRawTransaction(tx.serialize()), "confirmed");
    const act = await api(`/api/listings/${lid}/activate`, {});
    if (!act.ok) {
      log(`✗ activate: ${act.j.error}`);
      continue;
    }
    const a = act.j.auction;
    created.push({ id: a._id, endsAt: Math.floor(new Date(a.endsAt).getTime() / 1000), start: a.startPrice, inc: a.minIncrement });
    log(`✓ live: ${APP}/auction/${a._id}`);
  }

  // A few opening bids so the rooms feel alive (bidders rotate; each stays within its vault).
  for (const [i, c] of created.entries()) {
    const rounds = FIXED_MINUTES ? 2 + (i % 3) : 1 + (i % 3);
    let amount = c.start;
    for (let r = 0; r < rounds; r++) {
      const who = bidders[(i + r) % bidders.length];
      const res = await bid(c.id, who, amount, c.endsAt);
      if (!res.ok) {
        log(`  bid skipped (${res.j.error})`);
        break;
      }
      amount = res.j.minNext;
    }
  }
  log(`\nSeeded ${created.length} live auctions with opening bids. Open ${APP}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
