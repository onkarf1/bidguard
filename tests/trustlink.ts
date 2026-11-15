import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";
import { Trustlink } from "../target/types/trustlink";

const USDC = (n: number) => new BN(Math.round(n * 1_000_000));

describe("trustlink", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Trustlink as Program<Trustlink>;
  const conn = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const seller = Keypair.generate();
  const buyer = Keypair.generate();
  const stranger = Keypair.generate();
  const arbiter = Keypair.generate();
  const treasury = Keypair.generate();

  let mint: PublicKey;
  let sellerToken: PublicKey;
  let buyerToken: PublicKey;
  let strangerToken: PublicKey;
  let treasuryToken: PublicKey;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );
  const [profilePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), seller.publicKey.toBuffer()],
    program.programId
  );

  const dealPdas = (id: number) => {
    const [deal] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("deal"),
        seller.publicKey.toBuffer(),
        new BN(id).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), deal.toBuffer()],
      program.programId
    );
    return { deal, vault };
  };

  const balance = async (ata: PublicKey) =>
    Number((await getAccount(conn, ata)).amount);

  const expectError = async (p: Promise<unknown>, code: string) => {
    try {
      await p;
      expect.fail(`expected ${code}`);
    } catch (e: any) {
      expect(e?.error?.errorCode?.code ?? String(e)).to.contain(code);
    }
  };

  const createDeal = async (id: number, amount: BN, deadlineSecs = 3600) => {
    const { deal, vault } = dealPdas(id);
    await program.methods
      .createDeal(
        new BN(id),
        amount,
        new BN(Math.floor(Date.now() / 1000) + deadlineSecs),
        "Logo design",
        "3 logo concepts + final SVG/PNG files, 2 revision rounds"
      )
      .accountsPartial({
        seller: seller.publicKey,
        mint,
        deal,
        vault,
        profile: profilePda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller])
      .rpc();
    return { deal, vault };
  };

  const fund = (deal: PublicKey, vault: PublicKey, who = buyer, whoToken = buyerToken) =>
    program.methods
      .fundDeal()
      .accountsPartial({
        buyer: who.publicKey,
        deal,
        vault,
        mint,
        buyerToken: whoToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([who])
      .rpc();

  before(async () => {
    for (const kp of [seller, buyer, stranger, arbiter]) {
      const sig = await conn.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
    }
    mint = await createMint(conn, payer, payer.publicKey, null, 6);
    sellerToken = (await getOrCreateAssociatedTokenAccount(conn, payer, mint, seller.publicKey)).address;
    buyerToken = (await getOrCreateAssociatedTokenAccount(conn, payer, mint, buyer.publicKey)).address;
    strangerToken = (await getOrCreateAssociatedTokenAccount(conn, payer, mint, stranger.publicKey)).address;
    treasuryToken = (await getOrCreateAssociatedTokenAccount(conn, payer, mint, treasury.publicKey)).address;
    await mintTo(conn, payer, mint, buyerToken, payer, 1_000_000_000); // 1000 USDC
    await mintTo(conn, payer, mint, sellerToken, payer, 1_000_000_000);

    await program.methods
      .initializeConfig(arbiter.publicKey, treasury.publicKey, 100) // 1% fee
      .accountsPartial({
        admin: payer.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("happy path: create → fund → deliver → buyer releases", async () => {
    const { deal, vault } = await createDeal(1, USDC(50));
    let d = await program.account.deal.fetch(deal);
    expect(d.status).to.deep.equal({ open: {} });

    await fund(deal, vault);
    expect(await balance(vault)).to.equal(50_000_000);
    d = await program.account.deal.fetch(deal);
    expect(d.status).to.deep.equal({ funded: {} });
    expect(d.buyer.toBase58()).to.equal(buyer.publicKey.toBase58());

    await program.methods
      .submitDelivery("https://drive.example.com/logo-final.zip")
      .accountsPartial({ seller: seller.publicKey, deal })
      .signers([seller])
      .rpc();

    // Seller cannot self-release during the buyer's review period.
    await expectError(
      program.methods
        .releaseFunds()
        .accountsPartial({
          authority: seller.publicKey,
          config: configPda,
          deal,
          vault,
          mint,
          seller: seller.publicKey,
          sellerToken,
          treasuryToken,
          profile: profilePda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc(),
      "ReviewPeriodActive"
    );

    const sellerBefore = await balance(sellerToken);
    await program.methods
      .releaseFunds()
      .accountsPartial({
        authority: buyer.publicKey,
        config: configPda,
        deal,
        vault,
        mint,
        seller: seller.publicKey,
        sellerToken,
        treasuryToken,
        profile: profilePda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    expect((await balance(sellerToken)) - sellerBefore).to.equal(49_500_000);
    expect(await balance(treasuryToken)).to.equal(500_000);
    expect(await conn.getAccountInfo(vault)).to.be.null; // vault closed
    d = await program.account.deal.fetch(deal);
    expect(d.status).to.deep.equal({ completed: {} });

    const p = await program.account.sellerProfile.fetch(profilePda);
    expect(p.dealsCompleted.toNumber()).to.equal(1);
    expect(p.totalVolume.toNumber()).to.equal(50_000_000);
  });

  it("rejects the seller funding their own deal", async () => {
    const { deal, vault } = await createDeal(2, USDC(10));
    await expectError(fund(deal, vault, seller, sellerToken), "SellerCannotBuy");
  });

  it("seller can cancel an unfunded deal and reclaim rent", async () => {
    const { deal, vault } = dealPdas(2);
    await program.methods
      .cancelDeal()
      .accountsPartial({
        seller: seller.publicKey,
        deal,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();
    expect(await conn.getAccountInfo(deal)).to.be.null;
    expect(await conn.getAccountInfo(vault)).to.be.null;
  });

  it("dispute: buyer disputes, seller responds, arbiter splits 70/30", async () => {
    const { deal, vault } = await createDeal(3, USDC(100));
    await fund(deal, vault);
    await program.methods
      .submitDelivery("Shipped via DTDC, tracking #123")
      .accountsPartial({ seller: seller.publicKey, deal })
      .signers([seller])
      .rpc();

    await program.methods
      .raiseDispute("Item arrived damaged, 2 of 3 pieces broken")
      .accountsPartial({ authority: buyer.publicKey, deal })
      .signers([buyer])
      .rpc();

    // Strangers can't respond; the disputer can't respond to themselves.
    await expectError(
      program.methods
        .respondDispute("lol")
        .accountsPartial({ authority: stranger.publicKey, deal })
        .signers([stranger])
        .rpc(),
      "Unauthorized"
    );
    await expectError(
      program.methods
        .respondDispute("me again")
        .accountsPartial({ authority: buyer.publicKey, deal })
        .signers([buyer])
        .rpc(),
      "Unauthorized"
    );

    const resolve = (signer: Keypair, bps: number) =>
      program.methods
        .resolveDispute(bps, "AI ruling: partial damage evidenced; 70% refund")
        .accountsPartial({
          arbiter: signer.publicKey,
          config: configPda,
          deal,
          vault,
          mint,
          seller: seller.publicKey,
          buyer: buyer.publicKey,
          sellerToken,
          buyerToken,
          treasuryToken,
          profile: profilePda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([signer])
        .rpc();

    // Arbiter must wait for the seller's side of the story.
    await expectError(resolve(arbiter, 7000), "AwaitingResponse");

    await program.methods
      .respondDispute("Packed with bubble wrap; courier mishandled it")
      .accountsPartial({ authority: seller.publicKey, deal })
      .signers([seller])
      .rpc();

    await expectError(resolve(stranger, 0), "Unauthorized");

    const buyerBefore = await balance(buyerToken);
    const sellerBefore = await balance(sellerToken);
    const treasuryBefore = await balance(treasuryToken);
    await resolve(arbiter, 7000);

    expect((await balance(buyerToken)) - buyerBefore).to.equal(70_000_000);
    expect((await balance(sellerToken)) - sellerBefore).to.equal(29_700_000);
    expect((await balance(treasuryToken)) - treasuryBefore).to.equal(300_000);

    const d = await program.account.deal.fetch(deal);
    expect(d.status).to.deep.equal({ resolved: {} });
    expect(d.buyerBps).to.equal(7000);
    const p = await program.account.sellerProfile.fetch(profilePda);
    expect(p.disputesLost.toNumber()).to.equal(1);
  });

  it("buyer cannot claim a refund before the deadline", async () => {
    const { deal, vault } = await createDeal(4, USDC(5));
    await fund(deal, vault);
    await expectError(
      program.methods
        .refundExpired()
        .accountsPartial({
          buyer: buyer.publicKey,
          deal,
          vault,
          mint,
          seller: seller.publicKey,
          buyerToken,
          profile: profilePda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyer])
        .rpc(),
      "DeadlineNotReached"
    );
  });

  it("buyer gets a full refund once the deadline passes with no delivery", async () => {
    const { deal, vault } = await createDeal(5, USDC(20), 3);
    await fund(deal, vault);
    await new Promise((r) => setTimeout(r, 5000));
    const before = await balance(buyerToken);
    await program.methods
      .refundExpired()
      .accountsPartial({
        buyer: buyer.publicKey,
        deal,
        vault,
        mint,
        seller: seller.publicKey,
        buyerToken,
        profile: profilePda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();
    expect((await balance(buyerToken)) - before).to.equal(20_000_000);
    const d = await program.account.deal.fetch(deal);
    expect(d.status).to.deep.equal({ refunded: {} });
  });
});
