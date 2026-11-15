/**
 * End-to-end smoke test against a running app + local validator.
 *   1. solana-test-validator --bpf-program <ID> target/deploy/trustlink.so
 *   2. RPC_URL=http://127.0.0.1:8899 yarn setup:devnet
 *   3. (cd app && npm run dev)
 *   4. yarn e2e
 * Exercises: faucet → create deal → Blink GET/POST (buyer pays from the Blink tx) →
 * deliver → dispute → respond → /api/arbitrate.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import fs from "fs";
import os from "os";
import path from "path";
import idl from "../target/idl/trustlink.json";
import type { Trustlink } from "../target/types/trustlink";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const env = Object.fromEntries(
  fs
    .readFileSync(path.resolve(__dirname, "../app/.env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const connection = new Connection(env.NEXT_PUBLIC_RPC_URL, "confirmed");
const mint = new PublicKey(env.NEXT_PUBLIC_USDC_MINT);

const ok = (msg: string) => console.log(`  ✔ ${msg}`);
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`✘ ${msg}`);
  ok(msg);
}
const post = async (url: string, body: unknown) => {
  const r = await fetch(`${APP}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as any, headers: r.headers };
};

async function main() {
  const seller = Keypair.generate();
  const buyer = Keypair.generate();
  if (env.NEXT_PUBLIC_CLUSTER === "localnet") {
    for (const kp of [seller, buyer]) {
      await connection.confirmTransaction(await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL));
    }
  } else {
    // Devnet airdrops are rate-limited: fund the throwaway wallets from the admin wallet instead.
    const admin = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".config/solana/id.json"), "utf8")))
    );
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: seller.publicKey, lamports: 0.02 * LAMPORTS_PER_SOL }),
        SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: buyer.publicKey, lamports: 0.005 * LAMPORTS_PER_SOL })
      ),
      [admin]
    );
  }
  const programFor = (kp: Keypair) =>
    new Program<Trustlink>(
      idl as Trustlink,
      new anchor.AnchorProvider(connection, new anchor.Wallet(kp), { commitment: "confirmed" })
    );
  const asSeller = programFor(seller);
  const asBuyer = programFor(buyer);

  console.log("Faucet");
  const drip = await post("/api/faucet", { wallet: buyer.publicKey.toBase58() });
  assert(drip.status === 200 && drip.body.amount === 100, "buyer received 100 test USDC");
  const buyerAta = getAssociatedTokenAddressSync(mint, buyer.publicKey);
  assert(Number((await getAccount(connection, buyerAta)).amount) === 100_000_000, "balance is on-chain");

  console.log("Create deal");
  const dealId = new BN(Date.now());
  const [deal] = PublicKey.findProgramAddressSync(
    [Buffer.from("deal"), seller.publicKey.toBuffer(), dealId.toArrayLike(Buffer, "le", 8)],
    asSeller.programId
  );
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), deal.toBuffer()], asSeller.programId);
  const [profile] = PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), seller.publicKey.toBuffer()],
    asSeller.programId
  );
  await asSeller.methods
    .createDeal(dealId, new BN(25_000_000), new BN(Math.floor(Date.now() / 1000) + 86400), "Wedding invite design", "2 invite designs (front+back), print-ready PDF, delivered within 1 day")
    .accountsPartial({ seller: seller.publicKey, mint, deal, vault, profile, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
    .rpc();
  ok(`deal ${deal.toBase58()}`);

  console.log("Blink (Solana Action)");
  const actionsJson = (await (await fetch(`${APP}/actions.json`)).json()) as any;
  assert(actionsJson.rules?.length > 0, "actions.json served");
  const meta = await fetch(`${APP}/api/actions/deal/${deal.toBase58()}`);
  const metaBody = (await meta.json()) as any;
  assert(meta.headers.get("access-control-allow-origin") === "*", "CORS headers present");
  assert(meta.headers.get("x-action-version") && meta.headers.get("x-blockchain-ids"), "action version/chain headers present");
  assert(metaBody.type === "action" && metaBody.label.includes("25"), `GET metadata: "${metaBody.title}"`);
  const self = await post(`/api/actions/deal/${deal.toBase58()}`, { account: seller.publicKey.toBase58() });
  assert(self.status === 400, "seller can't pay own deal via Blink");
  const pay = await post(`/api/actions/deal/${deal.toBase58()}`, { account: buyer.publicKey.toBase58() });
  assert(pay.status === 200 && pay.body.type === "transaction", "POST returns a transaction");
  const tx = Transaction.from(Buffer.from(pay.body.transaction, "base64"));
  tx.sign(buyer); // what the buyer's wallet does when they click "Pay" in the Blink
  await connection.confirmTransaction(await connection.sendRawTransaction(tx.serialize()), "confirmed");
  let d = await asBuyer.account.deal.fetch(deal);
  assert("funded" in d.status && d.buyer.equals(buyer.publicKey), "deal funded from the Blink transaction");
  assert(Number((await getAccount(connection, vault)).amount) === 25_000_000, "25 USDC locked in vault");
  const again = await fetch(`${APP}/api/actions/deal/${deal.toBase58()}`).then((r) => r.json() as any);
  assert(again.disabled === true, "Blink disables itself once paid");

  console.log("Deliver → dispute → respond");
  await asSeller.methods.submitDelivery("PDF sent via WeTransfer: we.tl/t-abc123").accountsPartial({ seller: seller.publicKey, deal }).rpc();
  const early = await post("/api/arbitrate", { deal: deal.toBase58() });
  assert(early.status === 409, "arbitration refused while not in dispute");
  await asBuyer.methods
    .raiseDispute("Only received 1 design, not 2. Back side missing.")
    .accountsPartial({ authority: buyer.publicKey, deal })
    .rpc();
  const waiting = await post("/api/arbitrate", { deal: deal.toBase58() });
  assert(waiting.status === 409 && /respond/i.test(waiting.body.error), "arbitration waits for the seller's response");
  await asSeller.methods
    .respondDispute("The PDF has 2 pages: page 2 is the back side.")
    .accountsPartial({ authority: seller.publicKey, deal })
    .rpc();

  console.log("AI arbitration");
  const ruling = await post("/api/arbitrate", { deal: deal.toBase58() });
  if (ruling.status === 200) {
    ok(`ruling: ${ruling.body.ruling.buyer_refund_percent}% to buyer — ${ruling.body.ruling.ruling_summary}`);
    d = await asBuyer.account.deal.fetch(deal);
    assert("resolved" in d.status, "deal settled on-chain by the arbiter");
    assert((await connection.getAccountInfo(vault)) === null, "vault closed");
  } else {
    console.log(`  ⚠ arbitrate returned ${ruling.status}: ${ruling.body.error}`);
    assert(/API_KEY|not configured/.test(ruling.body.error), "clear error when no AI key is configured");
  }
  console.log("\nAll end-to-end checks passed.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
