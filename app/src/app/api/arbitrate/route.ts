import { NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import { DISPUTE_RESPONSE_SECS, MAX_NOTE_LEN } from "@/lib/config";
import { getRuling } from "@/lib/arbitrator";
import { configPda, fitBytes, resolveDisputeIxs, statusOf } from "@/lib/program";
import { arbiterKeypair, serverConnection, serverProgram } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  let dealKey: PublicKey;
  try {
    const body = await req.json();
    dealKey = new PublicKey(body.deal);
  } catch {
    return NextResponse.json({ error: "Body must be { deal: <deal address> }" }, { status: 400 });
  }

  const arbiter = arbiterKeypair();
  const program = serverProgram(arbiter);
  const connection = serverConnection();

  const deal = await program.account.deal.fetchNullable(dealKey);
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  if (statusOf(deal) !== "disputed") {
    return NextResponse.json({ error: "Deal is not in dispute" }, { status: 409 });
  }
  const responseWindowOpen =
    !deal.disputeResponse && Date.now() / 1000 < deal.disputedAt.toNumber() + DISPUTE_RESPONSE_SECS;
  if (responseWindowOpen) {
    return NextResponse.json(
      { error: "Waiting for the other party to respond (up to 24h) before arbitration can run." },
      { status: 409 }
    );
  }

  const config = await program.account.config.fetch(configPda());
  if (!config.arbiter.equals(arbiter.publicKey)) {
    return NextResponse.json({ error: "Server key is not the configured arbiter" }, { status: 500 });
  }

  // ── Ask the AI arbitrator for a ruling ──
  const result = await getRuling(deal);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ruling } = result;

  const percent = Math.min(100, Math.max(0, Math.round(ruling.buyer_refund_percent)));
  const buyerBps = percent * 100;
  const note = fitBytes(`AI ruling (${percent}% to buyer): ${ruling.ruling_summary}`, MAX_NOTE_LEN);

  // ── Execute it on-chain ──
  const tx = new Transaction().add(
    ...(await resolveDisputeIxs(program, dealKey, deal, arbiter.publicKey, config.treasury, buyerBps, note))
  );
  tx.feePayer = arbiter.publicKey;
  try {
    const signature = await program.provider.sendAndConfirm!(tx, [], { commitment: "confirmed" });
    return NextResponse.json({
      ruling: { ...ruling, buyer_refund_percent: percent },
      provider: result.provider,
      signature,
    });
  } catch (e) {
    const latest = await program.account.deal.fetch(dealKey);
    if (statusOf(latest) === "resolved") {
      return NextResponse.json({ error: "This dispute was already resolved" }, { status: 409 });
    }
    console.error("resolve_dispute failed", e, await connection.getBalance(arbiter.publicKey));
    return NextResponse.json(
      { error: "Ruling made, but the on-chain settlement failed. Check the arbiter's SOL balance." },
      { status: 500 }
    );
  }
}
