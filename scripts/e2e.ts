/**
 * End-to-end run against a running app (default http://localhost:3000) on the configured cluster.
 * Uses fresh wallets funded by the admin key. Exercises the real HTTP API + on-chain program:
 * listing → agent vetting → go live → deposits → signed bids (incl. a soft-close extension)
 * → settlement → ship → carrier delivery → buyer release.
 *
 *   yarn e2e                 # app on :3000, cluster from app/.env.local
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import nacl from "tweetnacl";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import idl from "../target/idl/bidguard.json";
import type { Bidguard } from "../target/types/bidguard";
import { evidenceDigest, evidenceMessage, sha256Hex } from "../app/src/lib/evidence";

const APP = process.env.APP ?? "http://localhost:3000";
const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, "../app/.env.local"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const conn = new Connection(env.NEXT_PUBLIC_RPC_URL, "confirmed");
const MINT = new PublicKey(env.NEXT_PUBLIC_USDC_MINT);
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8"))));
const U = 1_000_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

function prog(kp: Keypair) {
  return new Program<Bidguard>(idl as Bidguard, new anchor.AnchorProvider(conn, new anchor.Wallet(kp), { commitment: "confirmed" }));
}
const pda = (...s: Buffer[]) => PublicKey.findProgramAddressSync(s, new PublicKey(idl.address))[0];
const ata = (o: PublicKey) => getAssociatedTokenAddressSync(MINT, o, true);
const usdcOf = async (o: PublicKey) => Number((await conn.getTokenAccountBalance(ata(o)).catch(() => ({ value: { amount: "0" } }))).value.amount) / U;

async function api(p: string, body?: unknown) {
  const r = await fetch(APP + p, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json", Origin: APP }, body: JSON.stringify(body) });
  const text = await r.text();
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    j = text;
  }
  return { ok: r.ok, status: r.status, j };
}

const SHAPE = { cx: 70 + Math.floor(Math.random() * 116), cy: 50 + Math.floor(Math.random() * 92), r: 30 + Math.floor(Math.random() * 25) };
/** A 256×192 PNG of a yellow circle on a blue card, plus its 64-bit dHash. */
function testImage(damaged = false) {
  const W = 256, H = 192;
  // Random circle position per run, so the duplicate-photo check doesn't match earlier runs.
  const { cx, cy, r } = SHAPE;
  const base = (x: number, y: number) => ((x - cx) ** 2 + (y - cy) ** 2 < r ** 2 ? [250, 204, 21] : [37, 99, 235 - Math.floor(y / 2)]);
  // "Damaged" copy: a thick dark crack across the card and a torn corner.
  const px = (x: number, y: number) => (damaged && (Math.abs(y - (0.6 * x + 20)) < 4 || x + y < 40) ? [20, 20, 20] : base(x, y));
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y).forEach((v, i) => (raw[y * (W * 3 + 1) + 1 + x * 3 + i] = v));
  const crc = (b: Buffer) => {
    let c = ~0;
    for (const byte of b) for (let k = 0, x = (c ^ byte) & 0xff; k < 8; k++) (x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1), k === 7 && (c = (c >>> 8) ^ x);
    return ~c >>> 0;
  };
  const chunk = (t: string, d: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  const g = (x: number, y: number) => {
    const [r, gg, b] = px(Math.floor((x * W) / 9), Math.floor((y * H) / 8));
    return r * 0.299 + gg * 0.587 + b * 0.114;
  };
  let hex = "";
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (g(x, y) > g(x + 1, y) ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return { dataUrl: `data:image/png;base64,${png.toString("base64")}`, dhash: hex, exif: null };
}

async function bid(auction: string, who: Keypair, amount: number, endsAt: number) {
  const nonce = Date.now() + Math.floor(Math.random() * 1000);
  const expiry = endsAt + 24 * 3600;
  const msg = `BidGuard bid v1\nauction: ${auction}\namount: ${amount}\nnonce: ${nonce}\nexpires: ${expiry}`;
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(msg), who.secretKey));
  return api(`/api/auctions/${auction}/bids`, { bidder: who.publicKey.toBase58(), amount, nonce, expiry, signature });
}

async function evidence(auction: string, who: Keypair, statement: string, images: string[]) {
  const at = Math.floor(Date.now() / 1000);
  const digest = await evidenceDigest(statement, await Promise.all(images.map(sha256Hex)));
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(evidenceMessage(auction, who.publicKey.toBase58(), digest, at)), who.secretKey));
  return api(`/api/disputes/${auction}/evidence`, { wallet: who.publicKey.toBase58(), statement, images, at, signature });
}

async function disputeFlow(auction: string, auctionKey: PublicKey, seller: Keypair, alice: Keypair, bob: Keypair) {
  const cfgKey = pda(Buffer.from("config"));
  await prog(alice).methods.raiseDispute("Card arrived cracked in half and the corner is torn off.").accountsPartial({ buyer: alice.publicKey, auction: auctionKey }).rpc();
  log("✓ buyer opened a dispute on-chain");
  check(!(await evidence(auction, bob, "I am a bystander and I think the buyer is right about everything here.", [])).ok, "a third party can't submit evidence");
  {
    // Signed one statement, sent another: the seller can't put words in the buyer's mouth.
    const at = Math.floor(Date.now() / 1000);
    const digest = await evidenceDigest("The item was fine, I withdraw my complaint.", []);
    const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(evidenceMessage(auction, alice.publicKey.toBase58(), digest, at)), alice.secretKey));
    const r = await api(`/api/disputes/${auction}/evidence`, { wallet: alice.publicKey.toBase58(), statement: "Totally different text than what was signed.", images: [], at, signature: sig });
    check(!r.ok, "evidence that doesn't match its signature is rejected");
  }
  const dmg = testImage(true).dataUrl;
  check((await evidence(auction, alice, "Here is the card as it arrived: a crack runs right across it and the top-left corner is ripped off. The listing said new.", [dmg])).ok, "buyer evidence with photo accepted");
  check((await evidence(auction, seller, "It was in perfect condition when I shipped it in a sleeve, see my listing photo. Maybe the carrier damaged it.", [testImage().dataUrl])).ok, "seller response with photo accepted");

  const t = Date.now();
  const j = await api(`/api/disputes/${auction}/judge`, {});
  check(j.ok && typeof j.j.recommendation?.buyer_bps === "number", `AI Judge recommendation in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  const rec = j.j.recommendation;
  log(`   → ${rec.outcome} · buyer ${rec.buyer_bps / 100}% · confidence ${Math.round(rec.confidence * 100)}%`);
  log(`   summary: ${rec.summary}`);
  for (const f of rec.findings) log(`   - ${f}`);

  check((await fetch(`${APP}/api/admin/disputes/${auction}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ buyerBps: 10000, note: "x" }) })).status === 401, "only the arbiter can execute a ruling");
  const q: any = await (await fetch(`${APP}/api/admin/disputes`, { headers: { "x-admin-token": env.ADMIN_TOKEN } })).json();
  check(q.open.some((d: any) => d.id === auction && d.recommendation), "dispute shows in the arbiter queue with the AI recommendation");

  const p = prog(alice);
  const a = await p.account.auction.fetch(auctionKey);
  const [b0, s0] = [await usdcOf(alice.publicKey), await usdcOf(seller.publicKey)];
  const res = await fetch(`${APP}/api/admin/disputes/${auction}/resolve`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": env.ADMIN_TOKEN }, body: JSON.stringify({ buyerBps: rec.buyer_bps, note: rec.note }) });
  const rj: any = await res.json();
  check(res.ok && rj.resolution.followedAi, `arbiter executed the AI's ruling on-chain (tx ${rj.resolution?.tx?.slice(0, 10)}…)`);
  const price = a.price.toNumber(), bond = a.bond.toNumber();
  const toBuyer = Math.floor((price * rec.buyer_bps) / 10000);
  const fee = Math.floor(((price - toBuyer) * 250) / 10000);
  const wins = rec.buyer_bps * 2 >= 10000;
  const expBuyer = (toBuyer + (wins ? bond : 0)) / U, expSeller = (price - toBuyer - fee + (wins ? 0 : bond)) / U;
  const [b1, s1] = [await usdcOf(alice.publicKey), await usdcOf(seller.publicKey)];
  check(Math.abs(b1 - b0 - expBuyer) < 1e-6 && Math.abs(s1 - s0 - expSeller) < 1e-6, `payouts match: buyer +${(b1 - b0).toFixed(4)}, seller +${(s1 - s0).toFixed(4)} USDC`);
  const f = (await api(`/api/disputes/${auction}`)).j;
  check(f.chain.status === "resolved" && f.chain.buyerBps === rec.buyer_bps, "escrow resolved; ruling recorded on-chain");
  check(!(await evidence(auction, alice, "One more thing after the ruling was made, please reconsider.", [])).ok, "no evidence after the dispute is closed");
  void cfgKey;
}

function check(cond: unknown, what: string) {
  if (!cond) throw new Error(`FAILED: ${what}`);
  log("✓", what);
}

async function main() {
  const [seller, alice, bob] = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  log("seller", seller.publicKey.toBase58(), "alice", alice.publicKey.toBase58(), "bob", bob.publicKey.toBase58());
  const fund = new Transaction();
  for (const k of [seller, alice, bob]) fund.add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: k.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL }));
  await sendAndConfirmTransaction(conn, fund, [admin]);
  for (const k of [seller, alice, bob]) check((await api("/api/faucet", { wallet: k.publicKey.toBase58() })).ok, `faucet → ${k.publicKey.toBase58().slice(0, 6)}`);

  // 1. Listing + agent vetting (streamed NDJSON)
  const res = await fetch(APP + "/api/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: APP },
    body: JSON.stringify({
      seller: seller.publicKey.toBase58(),
      title: "Hand-painted yellow circle art card",
      description: "Small hand-painted art card: a bright yellow circle on a blue gradient background. 4x3 inches, new, ships in a sleeve.",
      category: "Collectibles",
      condition: "new",
      startPrice: 5,
      durationMinutes: 2,
      images: [testImage()],
    }),
  });
  check(res.ok, `POST /api/listings (${res.status})`);
  let result: any = null;
  for (const line of (await res.text()).split("\n").filter(Boolean)) {
    const m = JSON.parse(line);
    if (m.type === "trace" && m.status !== "running") log(`   [${m.agent}] ${m.status} ${m.ms ?? ""}ms — ${m.summary ?? ""}`);
    if (m.type === "result") result = m;
    if (m.type === "error") throw new Error(m.error);
  }
  log(`   Trust ${result.listing.trust.score} → ${result.listing.trust.decision}:`, result.listing.trust.reasons.join(" | "));
  const listingId = result.listing._id as string;
  check(!(await api(`/api/listings/${listingId}/tx`, { seller: alice.publicKey.toBase58() })).ok, "only the listing's seller can get its transaction");
  if (result.listing.status === "held" || result.listing.status === "rejected") {
    check((await fetch(`${APP}/api/admin/listings/${listingId}`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": "wrong-token-wrong-token" }, body: '{"action":"approve"}' })).status === 401, "moderator endpoint rejects a bad token");
    const mod = await fetch(`${APP}/api/admin/listings/${listingId}`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": env.ADMIN_TOKEN }, body: '{"action":"approve"}' });
    check(mod.ok, `${result.listing.status} listing approved by a human moderator`);
  }
  const built = await api(`/api/listings/${listingId}/tx`, { seller: seller.publicKey.toBase58() });
  check(built.ok, "operator co-signed create_auction tx issued to the seller");

  // 2. Seller signs and sends; app activates the live room
  const tx = Transaction.from(Buffer.from(built.j.tx, "base64"));
  tx.partialSign(seller);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  const act = await api(`/api/listings/${listingId}/activate`, {});
  check(act.ok, "auction verified on-chain and activated");
  const auction = act.j.auction._id as string;
  let endsAt = Math.floor(new Date(act.j.auction.endsAt).getTime() / 1000);
  log("   auction", auction, "ends", new Date(endsAt * 1000).toISOString());

  // 3. Deposits
  for (const [k, amt] of [[alice, 40], [bob, 30]] as const) {
    const p = prog(k);
    await p.methods
      .deposit(new BN(amt * U))
      .accountsPartial({ bidder: k.publicKey, config: pda(Buffer.from("config")), vault: pda(Buffer.from("vault"), k.publicKey.toBuffer()), vaultTokens: pda(Buffer.from("vault_tokens"), k.publicKey.toBuffer()), bidderToken: ata(k.publicKey), mint: MINT, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .rpc();
  }
  check((await api(`/api/vault/${alice.publicKey.toBase58()}`)).j.available === 40 * U, "alice vault shows 40 USDC available");

  // 4. Bidding rules
  check(!(await bid(auction, seller, 6 * U, endsAt)).ok, "seller can't bid on own auction");
  check(!(await bid(auction, alice, 4 * U, endsAt)).ok, "bid below start price rejected");
  check(!(await bid(auction, bob, 31 * U, endsAt)).ok, "bid above vault balance rejected");
  check((await bid(auction, alice, 5 * U, endsAt)).ok, "alice bids 5");
  const replayNonce = Date.now();
  const rmsg = `BidGuard bid v1\nauction: ${auction}\namount: ${12 * U}\nnonce: ${replayNonce}\nexpires: ${endsAt + 86400}`;
  const rsig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(rmsg), bob.secretKey));
  const forged = await api(`/api/auctions/${auction}/bids`, { bidder: bob.publicKey.toBase58(), amount: 13 * U, nonce: replayNonce, expiry: endsAt + 86400, signature: rsig });
  check(!forged.ok, "tampered amount (signature mismatch) rejected");
  check((await bid(auction, bob, 10 * U, endsAt)).ok, "bob bids 10");
  check(!(await bid(auction, alice, 10.5 * U, endsAt)).ok, "bid under min increment rejected");

  // 5. Soft close: bid inside the last 30 s
  const waitUntil = endsAt * 1000 - 20_000;
  log(`   waiting ${Math.round((waitUntil - Date.now()) / 1000)}s for the final 30 s…`);
  await sleep(Math.max(0, waitUntil - Date.now()));
  const late = await bid(auction, alice, 15 * U, endsAt);
  check(late.ok && late.j.extended, "late bid extends the clock (soft close)");
  endsAt = Math.floor(new Date(late.j.endsAt).getTime() / 1000);

  // 6. Close + settle (lazy close happens when anyone reads the auction after it ends)
  await sleep(Math.max(0, endsAt * 1000 - Date.now()) + 3000);
  let room: any;
  for (let i = 0; i < 30; i++) {
    room = (await api(`/api/auctions/${auction}`)).j;
    if (room.auction.status === "settled" || room.auction.status === "unsold") break;
    await sleep(2000);
  }
  check(room.auction.status === "settled" && room.auction.currentBidder === alice.publicKey.toBase58(), `settled on-chain to alice for ${room.auction.currentBid / U} (tx ${room.auction.settleTx?.slice(0, 10)}…)`);
  check(room.escrow.status === "funded" && room.escrow.price === 15 * U, "escrow funded with 15 USDC");
  check((await api(`/api/vault/${alice.publicKey.toBase58()}`)).j.deposited === 25 * U, "alice vault debited to 25");

  // 7. Ship → carrier oracle → buyer releases
  const auctionKey = new PublicKey(auction);
  await prog(seller).methods.markShipped("1Z999AA10123456784").accountsPartial({ seller: seller.publicKey, config: pda(Buffer.from("config")), auction: auctionKey }).rpc();
  log("✓ seller marked shipped");
  const car = await api(`/api/escrow/${auction}/carrier`, {});
  check(car.ok, `carrier oracle: ${car.j.tracking?.carrier} delivered`);
  if (process.env.FLOW === "dispute") {
    await disputeFlow(auction, auctionKey, seller, alice, bob);
  } else {
    const before = await usdcOf(seller.publicKey);
    const p = prog(alice);
    const a = await p.account.auction.fetch(auctionKey);
    const cfg = await p.account.config.fetch(pda(Buffer.from("config")));
    await p.methods
      .confirmDelivery()
      .accountsPartial({ authority: alice.publicKey, config: pda(Buffer.from("config")), auction: auctionKey, escrow: pda(Buffer.from("escrow"), auctionKey.toBuffer()), sellerProfile: pda(Buffer.from("seller"), seller.publicKey.toBuffer()), seller: seller.publicKey, sellerToken: ata(seller.publicKey), buyerToken: ata(a.buyer), treasuryToken: ata(cfg.treasury), mint: MINT, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    const after = await usdcOf(seller.publicKey);
    check(Math.abs(after - before - (15 * 0.975 + a.bond.toNumber() / U)) < 1e-6, `seller received ${(after - before).toFixed(4)} USDC (price − 2.5% fee + bond back)`);
    const final = (await api(`/api/auctions/${auction}`)).j;
    check(final.escrow.status === "released" && final.seller.sales === 1, "escrow released; seller reputation +1 sale");
  }
  log("\nAll end-to-end checks passed.", `${APP}/auction/${auction}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
