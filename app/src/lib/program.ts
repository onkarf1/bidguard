import { AnchorProvider, BN, Program, type IdlAccounts } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  type Transaction,
  type TransactionInstruction,
  type VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import idl from "@/idl/trustlink.json";
import type { Trustlink } from "@/idl/trustlink";

export type DealAccount = IdlAccounts<Trustlink>["deal"];
export type ConfigAccount = IdlAccounts<Trustlink>["config"];
export type SellerProfileAccount = IdlAccounts<Trustlink>["sellerProfile"];
export type DealStatus =
  | "open"
  | "funded"
  | "delivered"
  | "disputed"
  | "completed"
  | "refunded"
  | "resolved";

export const PROGRAM_ID = new PublicKey(idl.address);

export interface SignerWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

const readOnlyWallet: SignerWallet = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error("Read-only wallet cannot sign");
  },
  signAllTransactions: async () => {
    throw new Error("Read-only wallet cannot sign");
  },
};

export function getProgram(connection: Connection, wallet?: SignerWallet) {
  const provider = new AnchorProvider(connection, wallet ?? readOnlyWallet, {
    commitment: "confirmed",
  });
  return new Program<Trustlink>(idl as Trustlink, provider);
}
export type TrustlinkProgram = ReturnType<typeof getProgram>;

// ───────────── PDAs ─────────────

export const configPda = () =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];

export const dealPda = (seller: PublicKey, dealId: BN) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("deal"), seller.toBuffer(), dealId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  )[0];

export const vaultPda = (deal: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("vault"), deal.toBuffer()], PROGRAM_ID)[0];

export const profilePda = (seller: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("profile"), seller.toBuffer()], PROGRAM_ID)[0];

export const ata = (mint: PublicKey, owner: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true);

export const statusOf = (deal: DealAccount): DealStatus =>
  Object.keys(deal.status)[0] as DealStatus;

/** Trims a string so its UTF-8 encoding fits in `maxBytes` (on-chain limits are bytes, not chars). */
export function fitBytes(s: string, maxBytes: number) {
  const enc = new TextEncoder();
  let out = s.trim();
  while (enc.encode(out).length > maxBytes) out = out.slice(0, -1);
  return out;
}

// ───────────── instruction builders ─────────────
// Shared by the browser UI, the Blink endpoint and the arbiter backend.

export async function createDealIx(
  program: TrustlinkProgram,
  args: {
    seller: PublicKey;
    mint: PublicKey;
    dealId: BN;
    amount: BN;
    deadline: BN;
    title: string;
    terms: string;
  }
) {
  const deal = dealPda(args.seller, args.dealId);
  const ix = await program.methods
    .createDeal(args.dealId, args.amount, args.deadline, args.title, args.terms)
    .accountsPartial({
      seller: args.seller,
      mint: args.mint,
      deal,
      vault: vaultPda(deal),
      profile: profilePda(args.seller),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return { ix, deal };
}

export function fundDealIx(program: TrustlinkProgram, deal: PublicKey, d: DealAccount, buyer: PublicKey) {
  return program.methods
    .fundDeal()
    .accountsPartial({
      buyer,
      deal,
      vault: vaultPda(deal),
      mint: d.mint,
      buyerToken: ata(d.mint, buyer),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
}

export function submitDeliveryIx(program: TrustlinkProgram, deal: PublicKey, seller: PublicKey, note: string) {
  return program.methods.submitDelivery(note).accountsPartial({ seller, deal }).instruction();
}

export async function releaseFundsIxs(
  program: TrustlinkProgram,
  deal: PublicKey,
  d: DealAccount,
  authority: PublicKey,
  treasury: PublicKey
): Promise<TransactionInstruction[]> {
  return [
    createAssociatedTokenAccountIdempotentInstruction(authority, ata(d.mint, d.seller), d.seller, d.mint),
    await program.methods
      .releaseFunds()
      .accountsPartial({
        authority,
        config: configPda(),
        deal,
        vault: vaultPda(deal),
        mint: d.mint,
        seller: d.seller,
        sellerToken: ata(d.mint, d.seller),
        treasuryToken: ata(d.mint, treasury),
        profile: profilePda(d.seller),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction(),
  ];
}

export function refundExpiredIx(program: TrustlinkProgram, deal: PublicKey, d: DealAccount) {
  return program.methods
    .refundExpired()
    .accountsPartial({
      buyer: d.buyer,
      deal,
      vault: vaultPda(deal),
      mint: d.mint,
      seller: d.seller,
      buyerToken: ata(d.mint, d.buyer),
      profile: profilePda(d.seller),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
}

export function cancelDealIx(program: TrustlinkProgram, deal: PublicKey, seller: PublicKey) {
  return program.methods
    .cancelDeal()
    .accountsPartial({ seller, deal, vault: vaultPda(deal), tokenProgram: TOKEN_PROGRAM_ID })
    .instruction();
}

export function raiseDisputeIx(program: TrustlinkProgram, deal: PublicKey, authority: PublicKey, reason: string) {
  return program.methods.raiseDispute(reason).accountsPartial({ authority, deal }).instruction();
}

export function respondDisputeIx(program: TrustlinkProgram, deal: PublicKey, authority: PublicKey, response: string) {
  return program.methods.respondDispute(response).accountsPartial({ authority, deal }).instruction();
}

export async function resolveDisputeIxs(
  program: TrustlinkProgram,
  deal: PublicKey,
  d: DealAccount,
  arbiter: PublicKey,
  treasury: PublicKey,
  buyerBps: number,
  note: string
): Promise<TransactionInstruction[]> {
  return [
    createAssociatedTokenAccountIdempotentInstruction(arbiter, ata(d.mint, d.seller), d.seller, d.mint),
    createAssociatedTokenAccountIdempotentInstruction(arbiter, ata(d.mint, d.buyer), d.buyer, d.mint),
    await program.methods
      .resolveDispute(buyerBps, note)
      .accountsPartial({
        arbiter,
        config: configPda(),
        deal,
        vault: vaultPda(deal),
        mint: d.mint,
        seller: d.seller,
        buyer: d.buyer,
        sellerToken: ata(d.mint, d.seller),
        buyerToken: ata(d.mint, d.buyer),
        treasuryToken: ata(d.mint, treasury),
        profile: profilePda(d.seller),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction(),
  ];
}
