import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Ed25519Program, Keypair, LAMPORTS_PER_SOL, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccount, createMint, getAccount, mintTo } from "@solana/spl-token";
import { expect } from "chai";
import { Bidguard } from "../target/types/bidguard";

const USDC = 1_000_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("bidguard", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Bidguard as Program<Bidguard>;
  const conn = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const operator = Keypair.generate();
  const arbiter = Keypair.generate();
  const seller = Keypair.generate();
  const alice = Keypair.generate(); // bidder
  const bob = Keypair.generate(); // bidder
  const agent = Keypair.generate(); // alice's Concierge Agent
  let mint: PublicKey;
  const ata: Record<string, PublicKey> = {};
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

  const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, program.programId)[0];
  const vaultOf = (b: PublicKey) => pda(Buffer.from("vault"), b.toBuffer());
  const vaultTokensOf = (b: PublicKey) => pda(Buffer.from("vault_tokens"), b.toBuffer());
  const auctionOf = (s: PublicKey, id: BN) => pda(Buffer.from("auction"), s.toBuffer(), id.toArrayLike(Buffer, "le", 8));
  const escrowOf = (a: PublicKey) => pda(Buffer.from("escrow"), a.toBuffer());
  const profileOf = (s: PublicKey) => pda(Buffer.from("seller"), s.toBuffer());
  const balance = async (a: PublicKey) => Number((await getAccount(conn, a)).amount);
  /** Waits for the validator's clock (not the laptop's) to pass `seconds` from now. */
  /** Waits until the chain clock is past this auction's on-chain end time. */
  async function waitForEnd(auction: PublicKey) {
    const endsAt = (await program.account.auction.fetch(auction)).endsAt.toNumber();
    for (;;) {
      const now = await conn.getBlockTime(await conn.getSlot("confirmed"));
      if (now && now > endsAt + 1) return;
      await sleep(400);
    }
  }

  async function chainWait(seconds: number) {
    const start = (await conn.getBlockTime(await conn.getSlot("confirmed")))!;
    for (;;) {
      await sleep(400);
      const now = await conn.getBlockTime(await conn.getSlot("confirmed"));
      if (now && now > start + seconds) return;
    }
  }

  const bidMessage = (auction: PublicKey, amount: number, nonce: number, expiry: number) =>
    Buffer.from(`BidGuard bid v1\nauction: ${auction.toBase58()}\namount: ${amount}\nnonce: ${nonce}\nexpires: ${expiry}`);

  let nextId = 1;
  async function createAuction(opts: { startPrice?: number; endsIn?: number; signer?: Keypair } = {}) {
    const id = new BN(nextId++);
    const auction = auctionOf(seller.publicKey, id);
    const endsAt = Math.floor(Date.now() / 1000) + Math.max(3, opts.endsIn ?? 3);
    await program.methods
      .createAuction(id, new BN((opts.startPrice ?? 20) * USDC), new BN(1 * USDC), new BN(endsAt), Array(32).fill(7), 91)
      .accountsPartial({
        seller: seller.publicKey,
        operator: (opts.signer ?? operator).publicKey,
        config,
        auction,
        escrow: escrowOf(auction),
        sellerProfile: profileOf(seller.publicKey),
        sellerToken: ata.seller,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([seller, opts.signer ?? operator])
      .rpc();
    return { id, auction };
  }

  async function settle(auction: PublicKey, bidder: PublicKey, amount: number, signedBy: Keypair, signedAmount = amount) {
    const nonce = Date.now();
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const verify = Ed25519Program.createInstructionWithPrivateKey({ privateKey: signedBy.secretKey, message: bidMessage(auction, signedAmount * USDC, nonce, expiry) });
    return program.methods
      .settleAuction(bidder, new BN(amount * USDC), new BN(nonce), new BN(expiry))
      .accountsPartial({
        operator: operator.publicKey,
        config,
        auction,
        escrow: escrowOf(auction),
        vault: vaultOf(bidder),
        vaultTokens: vaultTokensOf(bidder),
        mint,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([verify])
      .signers([operator])
      .rpc();
  }

  const finalize = (auction: PublicKey, buyer: PublicKey | null, authority: Keypair) => ({
    authority: authority.publicKey,
    config,
    auction,
    escrow: escrowOf(auction),
    sellerProfile: profileOf(seller.publicKey),
    seller: seller.publicKey,
    sellerToken: ata.seller,
    buyerToken: buyer ? ata[buyer.equals(alice.publicKey) ? "alice" : "bob"] : ata.seller,
    treasuryToken: ata.arbiter,
    mint,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  async function expectError(p: Promise<unknown>, code: string) {
    try {
      await p;
      expect.fail(`expected ${code}`);
    } catch (e: any) {
      expect(String(e?.error?.errorCode?.code ?? e?.message ?? e)).to.contain(code);
    }
  }

  before(async () => {
    for (const kp of [operator, arbiter, seller, alice, bob, agent]) {
      await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL), "confirmed");
    }
    mint = await createMint(conn, admin, admin.publicKey, null, 6);
    for (const [name, kp] of Object.entries({ seller, alice, bob, arbiter })) {
      ata[name] = await createAssociatedTokenAccount(conn, admin, mint, kp.publicKey);
      await mintTo(conn, admin, mint, ata[name], admin, 1_000 * USDC);
    }
    await program.methods
      .initializeConfig({
        operator: operator.publicKey,
        arbiter: arbiter.publicKey,
        treasury: arbiter.publicKey,
        feeBps: 250,
        bondBps: 500,
        minBond: new BN(1 * USDC),
        shipWindowSecs: new BN(3),
        releaseWindowSecs: new BN(2),
        withdrawCooldownSecs: new BN(2),
      })
      .accountsPartial({ admin: admin.publicKey, config, mint, systemProgram: SystemProgram.programId })
      .rpc();
  });

  const deposit = (who: Keypair, name: string, amount: number) =>
    program.methods
      .deposit(new BN(amount * USDC))
      .accountsPartial({ bidder: who.publicKey, config, vault: vaultOf(who.publicKey), vaultTokens: vaultTokensOf(who.publicKey), bidderToken: ata[name], mint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .signers([who])
      .rpc();

  it("bidders pre-fund a Bid Vault; withdrawals need a cooldown", async () => {
    await deposit(alice, "alice", 300);
    await deposit(bob, "bob", 100);
    expect(await balance(vaultTokensOf(alice.publicKey))).to.equal(300 * USDC);

    const owner = (who: Keypair) => ({ bidder: who.publicKey, vault: vaultOf(who.publicKey), vaultTokens: vaultTokensOf(who.publicKey) });
    await program.methods.requestWithdraw(new BN(50 * USDC)).accountsPartial(owner(bob)).signers([bob]).rpc();
    const w = { ...owner(bob), config, bidderToken: ata.bob, mint, tokenProgram: TOKEN_PROGRAM_ID };
    await expectError(program.methods.withdraw().accountsPartial(w).signers([bob]).rpc(), "CooldownActive");
    await chainWait(3);
    await program.methods.withdraw().accountsPartial(w).signers([bob]).rpc();
    expect(await balance(vaultTokensOf(bob.publicKey))).to.equal(50 * USDC);
  });

  it("only operator-approved (agent-vetted) listings can go live, and the seller posts a bond", async () => {
    await expectError(createAuction({ signer: Keypair.generate() }), "ConstraintHasOne");
    const { auction } = await createAuction({ startPrice: 40 });
    const a = await program.account.auction.fetch(auction);
    expect(a.trustScore).to.equal(91);
    expect(a.bond.toNumber()).to.equal(2 * USDC); // 5% of 40
    expect(await balance(escrowOf(auction))).to.equal(2 * USDC);
  });

  it("settles the winning signed bid on-chain, rejecting early, forged and tampered settlements", async () => {
    const { auction } = await createAuction({ startPrice: 20, endsIn: 2 });
    await expectError(settle(auction, alice.publicKey, 25, alice), "AuctionNotEnded");
    await waitForEnd(auction);
    await expectError(settle(auction, alice.publicKey, 25, bob), "BadSignature"); // bob forges alice's bid
    await expectError(settle(auction, alice.publicKey, 30, alice, 25), "BadSignature"); // amount tampered
    await expectError(settle(auction, bob.publicKey, 80, bob), "InsufficientVault"); // phantom bidder
    await settle(auction, alice.publicKey, 25, alice);
    const a = await program.account.auction.fetch(auction);
    expect(a.buyer.toBase58()).to.equal(alice.publicKey.toBase58());
    expect(a.price.toNumber()).to.equal(25 * USDC);
    expect(await balance(escrowOf(auction))).to.equal(25 * USDC + 1 * USDC); // price + min bond
    expect(await balance(vaultTokensOf(alice.publicKey))).to.equal(275 * USDC);
  });

  it("happy path: ship → delivered (oracle) → buyer confirms → seller paid, bond returned, fee taken", async () => {
    const { auction } = await createAuction({ startPrice: 20, endsIn: 1 });
    await waitForEnd(auction);
    await settle(auction, alice.publicKey, 40, alice);
    const sellerBefore = await balance(ata.seller);
    await program.methods.markShipped("1Z999AA10123456784").accountsPartial({ seller: seller.publicKey, config, auction }).signers([seller]).rpc();
    await program.methods.markDelivered().accountsPartial({ operator: operator.publicKey, config, auction }).signers([operator]).rpc();
    await expectError(program.methods.confirmDelivery().accountsPartial(finalize(auction, alice.publicKey, bob)).signers([bob]).rpc(), "Unauthorized");
    await program.methods.confirmDelivery().accountsPartial(finalize(auction, alice.publicKey, alice)).signers([alice]).rpc();
    const fee = 40 * USDC * 0.025;
    expect(await balance(ata.seller)).to.equal(sellerBefore + 40 * USDC - fee + 1 * USDC); // + bond back
    expect((await program.account.auction.fetch(auction)).status).to.have.property("released");
    expect((await program.account.sellerProfile.fetch(profileOf(seller.publicKey))).salesCompleted.toNumber()).to.equal(1);
    expect(await conn.getAccountInfo(escrowOf(auction))).to.equal(null); // escrow closed
  });

  it("auto-releases to the seller after the review window if the buyer is silent", async () => {
    const { auction } = await createAuction({ startPrice: 20, endsIn: 1 });
    await waitForEnd(auction);
    await settle(auction, alice.publicKey, 20, alice);
    await program.methods.markShipped("TRACK-2").accountsPartial({ seller: seller.publicKey, config, auction }).signers([seller]).rpc();
    await program.methods.markDelivered().accountsPartial({ operator: operator.publicKey, config, auction }).signers([operator]).rpc();
    await expectError(program.methods.releaseAfterTimeout().accountsPartial(finalize(auction, alice.publicKey, bob)).signers([bob]).rpc(), "WindowNotPassed");
    await chainWait(3);
    await program.methods.releaseAfterTimeout().accountsPartial(finalize(auction, alice.publicKey, bob)).signers([bob]).rpc();
    expect((await program.account.auction.fetch(auction)).status).to.have.property("released");
  });

  it("refunds the buyer and slashes the bond when the seller never ships", async () => {
    const { auction } = await createAuction({ startPrice: 20, endsIn: 1 });
    await waitForEnd(auction);
    await settle(auction, alice.publicKey, 30, alice);
    const before = await balance(ata.alice);
    await expectError(program.methods.refundUnshipped().accountsPartial(finalize(auction, alice.publicKey, bob)).signers([bob]).rpc(), "WindowNotPassed");
    await chainWait(5);
    await program.methods.refundUnshipped().accountsPartial(finalize(auction, alice.publicKey, bob)).signers([bob]).rpc();
    expect(await balance(ata.alice)).to.equal(before + 30 * USDC + 1 * USDC); // price + slashed bond
    expect((await program.account.sellerProfile.fetch(profileOf(seller.publicKey))).failedShipments.toNumber()).to.equal(1);
  });

  it("disputes: only the arbiter executes; a buyer win slashes the seller's bond", async () => {
    const { auction } = await createAuction({ startPrice: 20, endsIn: 1 });
    await waitForEnd(auction);
    await settle(auction, alice.publicKey, 50, alice);
    await program.methods.markShipped("TRACK-3").accountsPartial({ seller: seller.publicKey, config, auction }).signers([seller]).rpc();
    await program.methods.raiseDispute("Box arrived empty").accountsPartial({ buyer: alice.publicKey, auction }).signers([alice]).rpc();
    await expectError(program.methods.resolveDispute(10_000, "AI said refund").accountsPartial(finalize(auction, alice.publicKey, operator)).signers([operator]).rpc(), "Unauthorized");
    const before = await balance(ata.alice);
    await program.methods.resolveDispute(10_000, "Refund: tracking shows 0.1 lb package").accountsPartial(finalize(auction, alice.publicKey, arbiter)).signers([arbiter]).rpc();
    expect(await balance(ata.alice)).to.equal(before + 50 * USDC + 1 * USDC); // full refund + slashed bond
    expect((await program.account.sellerProfile.fetch(profileOf(seller.publicKey))).disputesLost.toNumber()).to.equal(1);
  });

  it("a Concierge Agent can bid for its owner, but never beyond its on-chain cap", async () => {
    await program.methods.setAgent(agent.publicKey, new BN(60 * USDC)).accountsPartial({ bidder: alice.publicKey, vault: vaultOf(alice.publicKey), vaultTokens: vaultTokensOf(alice.publicKey) }).signers([alice]).rpc();
    const first = await createAuction({ startPrice: 20, endsIn: 1 });
    const second = await createAuction({ startPrice: 20, endsIn: 1 });
    await waitForEnd(second.auction);
    await settle(first.auction, alice.publicKey, 45, agent);
    expect((await program.account.auction.fetch(first.auction)).buyer.toBase58()).to.equal(alice.publicKey.toBase58());
    await expectError(settle(second.auction, alice.publicKey, 20, agent), "AgentCapExceeded"); // 45 + 20 > 60
  });

  it("unsold auctions return the bond to the seller", async () => {
    const { auction } = await createAuction({ startPrice: 20, endsIn: 1 });
    await waitForEnd(auction);
    const before = await balance(ata.seller);
    await expectError(program.methods.cancelUnsold().accountsPartial(finalize(auction, null, seller)).signers([seller]).rpc(), "Unauthorized");
    await program.methods.cancelUnsold().accountsPartial(finalize(auction, null, operator)).signers([operator]).rpc();
    expect(await balance(ata.seller)).to.equal(before + 1 * USDC);
    expect((await program.account.auction.fetch(auction)).status).to.have.property("cancelled");
  });
});
