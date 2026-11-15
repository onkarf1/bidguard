import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Ed25519Program,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  type Transaction,
  type TransactionInstruction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import idl from "@/idl/bidguard.json";
import type { Bidguard } from "@/idl/bidguard";
import { USDC_MINT } from "./config";
import { bidMessage } from "./bid";

export type SignerWallet = {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
};

export const PROGRAM_ID = new PublicKey(idl.address);

const readonlyWallet: SignerWallet = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error("read-only");
  },
  signAllTransactions: async () => {
    throw new Error("read-only");
  },
};

export function getProgram(connection: Connection, wallet?: SignerWallet) {
  const provider = new AnchorProvider(connection, wallet ?? readonlyWallet, { commitment: "confirmed" });
  return new Program<Bidguard>(idl as Bidguard, provider);
}
export type BidguardProgram = ReturnType<typeof getProgram>;

// ── addresses ──
const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
export const configPda = () => pda(Buffer.from("config"));
export const vaultPda = (bidder: PublicKey) => pda(Buffer.from("vault"), bidder.toBuffer());
export const vaultTokensPda = (bidder: PublicKey) => pda(Buffer.from("vault_tokens"), bidder.toBuffer());
export const auctionPda = (seller: PublicKey, id: BN) => pda(Buffer.from("auction"), seller.toBuffer(), id.toArrayLike(Buffer, "le", 8));
export const escrowPda = (auction: PublicKey) => pda(Buffer.from("escrow"), auction.toBuffer());
export const sellerProfilePda = (seller: PublicKey) => pda(Buffer.from("seller"), seller.toBuffer());
export const ata = (owner: PublicKey) => getAssociatedTokenAddressSync(USDC_MINT, owner, true);

export const STATUS = ["live", "funded", "shipped", "delivered", "disputed", "released", "refunded", "resolved", "cancelled"] as const;
export type EscrowStatus = (typeof STATUS)[number];
export const statusOf = (s: object): EscrowStatus => Object.keys(s)[0] as EscrowStatus;

// ── bid vault ──
export async function depositIx(program: BidguardProgram, bidder: PublicKey, amount: number) {
  return program.methods
    .deposit(new BN(amount))
    .accountsPartial({
      bidder,
      config: configPda(),
      vault: vaultPda(bidder),
      vaultTokens: vaultTokensPda(bidder),
      bidderToken: ata(bidder),
      mint: USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}
const owner = (bidder: PublicKey) => ({ bidder, vault: vaultPda(bidder), vaultTokens: vaultTokensPda(bidder) });
export const requestWithdrawIx = (p: BidguardProgram, bidder: PublicKey, amount: number) => p.methods.requestWithdraw(new BN(amount)).accountsPartial(owner(bidder)).instruction();
export const cancelWithdrawIx = (p: BidguardProgram, bidder: PublicKey) => p.methods.cancelWithdraw().accountsPartial(owner(bidder)).instruction();
export const setAgentIx = (p: BidguardProgram, bidder: PublicKey, agent: PublicKey, cap: number) =>
  p.methods.setAgent(agent, new BN(cap)).accountsPartial(owner(bidder)).instruction();
export async function withdrawIxs(p: BidguardProgram, bidder: PublicKey) {
  return [
    createAssociatedTokenAccountIdempotentInstruction(bidder, ata(bidder), bidder, USDC_MINT),
    await p.methods
      .withdraw()
      .accountsPartial({ ...owner(bidder), config: configPda(), bidderToken: ata(bidder), mint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ID })
      .instruction(),
  ];
}

// ── auctions ──
export async function createAuctionIx(
  p: BidguardProgram,
  a: { seller: PublicKey; operator: PublicKey; id: BN; startPrice: number; minIncrement: number; endsAt: number; listingHash: number[]; trustScore: number }
) {
  const auction = auctionPda(a.seller, a.id);
  return p.methods
    .createAuction(a.id, new BN(a.startPrice), new BN(a.minIncrement), new BN(a.endsAt), a.listingHash, a.trustScore)
    .accountsPartial({
      seller: a.seller,
      operator: a.operator,
      config: configPda(),
      auction,
      escrow: escrowPda(auction),
      sellerProfile: sellerProfilePda(a.seller),
      sellerToken: ata(a.seller),
      mint: USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** Ed25519 check of the winning bid followed by settlement (must be adjacent, in this order). */
export async function settleIxs(
  p: BidguardProgram,
  b: { operator: PublicKey; auction: PublicKey; bidder: PublicKey; signer: PublicKey; amount: number; nonce: number; expiry: number; signature: Uint8Array }
): Promise<TransactionInstruction[]> {
  const verify = Ed25519Program.createInstructionWithPublicKey({
    publicKey: b.signer.toBytes(),
    message: Buffer.from(bidMessage(b.auction.toBase58(), b.amount, b.nonce, b.expiry)),
    signature: b.signature,
  });
  const settle = await p.methods
    .settleAuction(b.bidder, new BN(b.amount), new BN(b.nonce), new BN(b.expiry))
    .accountsPartial({
      operator: b.operator,
      config: configPda(),
      auction: b.auction,
      escrow: escrowPda(b.auction),
      vault: vaultPda(b.bidder),
      vaultTokens: vaultTokensPda(b.bidder),
      mint: USDC_MINT,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
  return [verify, settle];
}

/** Accounts for every instruction that pays out of escrow, plus idempotent ATA creation for recipients. */
async function finalizeAccounts(p: BidguardProgram, auction: PublicKey, authority: PublicKey, payer: PublicKey) {
  const a = await p.account.auction.fetch(auction);
  const config = await p.account.config.fetch(configPda());
  const buyer = a.buyer.equals(PublicKey.default) ? a.seller : a.buyer;
  const pre = [a.seller, buyer, config.treasury].map((o) => createAssociatedTokenAccountIdempotentInstruction(payer, ata(o), o, USDC_MINT));
  return {
    pre,
    accounts: {
      authority,
      config: configPda(),
      auction,
      escrow: escrowPda(auction),
      sellerProfile: sellerProfilePda(a.seller),
      seller: a.seller,
      sellerToken: ata(a.seller),
      buyerToken: ata(buyer),
      treasuryToken: ata(config.treasury),
      mint: USDC_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  };
}

type FinalizeKind = "confirmDelivery" | "releaseAfterTimeout" | "refundUnshipped" | "cancelUnsold";
export async function finalizeIxs(p: BidguardProgram, kind: FinalizeKind, auction: PublicKey, authority: PublicKey, payer = authority) {
  const { pre, accounts } = await finalizeAccounts(p, auction, authority, payer);
  return [...pre, await p.methods[kind]().accountsPartial(accounts).instruction()];
}
export async function resolveDisputeIxs(p: BidguardProgram, auction: PublicKey, arbiter: PublicKey, buyerBps: number, note: string) {
  const { pre, accounts } = await finalizeAccounts(p, auction, arbiter, arbiter);
  return [...pre, await p.methods.resolveDispute(buyerBps, note).accountsPartial(accounts).instruction()];
}
export const markShippedIx = (p: BidguardProgram, seller: PublicKey, auction: PublicKey, tracking: string) =>
  p.methods.markShipped(tracking).accountsPartial({ seller, config: configPda(), auction }).instruction();
export const markDeliveredIx = (p: BidguardProgram, operator: PublicKey, auction: PublicKey) =>
  p.methods.markDelivered().accountsPartial({ operator, config: configPda(), auction }).instruction();
export const raiseDisputeIx = (p: BidguardProgram, buyer: PublicKey, auction: PublicKey, reason: string) =>
  p.methods.raiseDispute(reason).accountsPartial({ buyer, auction }).instruction();

/** Trims a string to fit an on-chain byte limit without breaking a UTF-8 character. */
export function fitBytes(s: string, max: number) {
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = s;
  while (enc.encode(out + "…").length > max) out = out.slice(0, -1);
  return out + "…";
}
