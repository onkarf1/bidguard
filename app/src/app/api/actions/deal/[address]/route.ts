// Solana Action ("Blink") for paying a deal straight from a link on X, Discord, WhatsApp, etc.
// Spec: https://solana.com/docs/advanced/actions
import { PublicKey, Transaction } from "@solana/web3.js";
import { APP_URL, BLOCKCHAIN_ID } from "@/lib/config";
import { fromBaseUnits, shortKey } from "@/lib/format";
import { fundDealIx, profilePda, statusOf } from "@/lib/program";
import { serverConnection, serverProgram } from "@/lib/server";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Action-Version, X-Blockchain-Ids",
  "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
  "Content-Type": "application/json",
  "X-Action-Version": "2.4",
  "X-Blockchain-Ids": BLOCKCHAIN_ID,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

type Params = { params: { address: string } };

export const OPTIONS = () => new Response(null, { headers: HEADERS });

export async function GET(_req: Request, { params }: Params) {
  let dealKey: PublicKey;
  try {
    dealKey = new PublicKey(params.address);
  } catch {
    return json({ message: "Invalid deal address" }, 400);
  }
  const program = serverProgram();
  const deal = await program.account.deal.fetchNullable(dealKey);
  if (!deal) return json({ message: "Deal not found" }, 404);

  const profile = await program.account.sellerProfile.fetchNullable(profilePda(deal.seller));
  const rep = profile
    ? `${profile.dealsCompleted.toNumber()} completed deals · ${profile.disputesLost.toNumber()} disputes lost`
    : "New seller";
  const amount = fromBaseUnits(deal.amount);
  const open = statusOf(deal) === "open";

  return json({
    type: "action",
    icon: `${APP_URL}/icon.svg`,
    title: `${deal.title} · ${amount} USDC`,
    description: `${deal.terms}\n\nSeller ${shortKey(deal.seller)} — ${rep}.\nYour payment is held in escrow by TrustLink until you approve delivery.`,
    label: open ? `Pay ${amount} USDC into escrow` : "Already paid",
    disabled: !open,
    links: {
      actions: [{ type: "transaction", label: `Pay ${amount} USDC`, href: `/api/actions/deal/${dealKey.toBase58()}` }],
    },
  });
}

export async function POST(req: Request, { params }: Params) {
  let dealKey: PublicKey;
  let buyer: PublicKey;
  try {
    dealKey = new PublicKey(params.address);
    buyer = new PublicKey((await req.json()).account);
  } catch {
    return json({ message: "Invalid deal address or account" }, 400);
  }
  const program = serverProgram();
  const deal = await program.account.deal.fetchNullable(dealKey);
  if (!deal) return json({ message: "Deal not found" }, 404);
  if (statusOf(deal) !== "open") return json({ message: "This deal has already been paid" }, 409);
  if (deal.seller.equals(buyer)) return json({ message: "You can't pay your own deal" }, 400);

  const connection = serverConnection();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: buyer, blockhash, lastValidBlockHeight }).add(
    await fundDealIx(program, dealKey, deal, buyer)
  );

  return json({
    type: "transaction",
    transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    message: `Paid ${fromBaseUnits(deal.amount)} USDC into escrow. Track it at ${APP_URL}/deal/${dealKey.toBase58()}`,
  });
}
