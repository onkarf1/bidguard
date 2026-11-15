//! BidGuard: deposit-backed live auctions with escrow and AI-vetted listings.
//!
//! Three failure modes of live auctions, three on-chain answers:
//!   * fake listings      → an auction can only go live when the operator (the agent crew's
//!                          orchestrator) co-signs it, and the listing hash + trust score are
//!                          recorded on-chain;
//!   * phantom bidders    → every bidder pre-funds a Bid Vault; bids are gas-free signed messages,
//!                          and the winning one is verified on-chain (Ed25519 program) before the
//!                          vault pays into escrow; withdrawals need a cooldown so funds can't
//!                          vanish mid-auction;
//!   * seller fraud       → the winning payment sits in escrow until delivery, with timeouts that
//!                          protect the buyer, and a seller bond that is slashed on a lost dispute.
//!
//! Escrow lifecycle (per auction):
//!
//!   Live ──settle──▶ Funded ──mark_shipped──▶ Shipped ──mark_delivered──▶ Delivered ──(timeout)──▶ Released
//!    │                 │                         │  └──confirm_delivery────────────────────────────▶ Released
//!  cancel_unsold    refund_unshipped           raise_dispute ─▶ Disputed ──resolve_dispute (arbiter)─▶ Resolved
//!    ▼                 ▼ (ship window passed:      (also from Delivered)
//!  Cancelled         Refunded  bond goes to buyer)
//!
//! AI agents only *recommend* a dispute outcome; the arbiter key (a multisig in production)
//! executes it, and the program limits where funds can go.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{load_current_index_checked, load_instruction_at_checked};
use anchor_spl::token_interface::{self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("6upAUdnE4srVXtYEw1AMhxBxmoZLZ45sJq9dMgRwcp8");

pub const CONFIG_SEED: &[u8] = b"config";
pub const VAULT_SEED: &[u8] = b"vault";
pub const VAULT_TOKENS_SEED: &[u8] = b"vault_tokens";
pub const AUCTION_SEED: &[u8] = b"auction";
pub const ESCROW_SEED: &[u8] = b"escrow";
pub const SELLER_SEED: &[u8] = b"seller";

pub const MAX_TRACKING_LEN: usize = 64;
pub const MAX_NOTE_LEN: usize = 200;
pub const MAX_FEE_BPS: u16 = 1_000; // 10% hard cap
pub const BPS: u64 = 10_000;

/// The Ed25519 signature-verification native program.
pub const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");

#[program]
pub mod bidguard {
    use super::*;

    // ───────────────────────── platform ─────────────────────────

    pub fn initialize_config(ctx: Context<InitializeConfig>, params: ConfigParams) -> Result<()> {
        params.validate()?;
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.mint = ctx.accounts.mint.key();
        c.bump = ctx.bumps.config;
        c.apply(params);
        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, params: ConfigParams) -> Result<()> {
        params.validate()?;
        ctx.accounts.config.apply(params);
        Ok(())
    }

    // ───────────────────────── bid vault ─────────────────────────

    /// Pre-fund bidding power. Like registering with a deposit at a live auction house.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, BidGuardError::InvalidAmount);
        let v = &mut ctx.accounts.vault;
        if v.bidder == Pubkey::default() {
            v.bidder = ctx.accounts.bidder.key();
            v.bump = ctx.bumps.vault;
            v.tokens_bump = ctx.bumps.vault_tokens;
        }
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.bidder_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault_tokens.to_account_info(),
                    authority: ctx.accounts.bidder.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;
        emit!(VaultDeposited { bidder: v.bidder, amount });
        Ok(())
    }

    /// Withdrawals are two-step: request now, execute after the cooldown. The auction server
    /// subtracts pending withdrawals from bidding power, so a bid can never be backed by money
    /// that is about to leave.
    pub fn request_withdraw(ctx: Context<VaultOwner>, amount: u64) -> Result<()> {
        require!(amount > 0 && amount <= ctx.accounts.vault_tokens.amount, BidGuardError::InvalidAmount);
        let v = &mut ctx.accounts.vault;
        v.pending_withdrawal = amount;
        v.withdraw_requested_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn cancel_withdraw(ctx: Context<VaultOwner>) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        v.pending_withdrawal = 0;
        v.withdraw_requested_at = 0;
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let v = &ctx.accounts.vault;
        require!(v.pending_withdrawal > 0, BidGuardError::NoPendingWithdrawal);
        require!(now >= v.withdraw_requested_at + ctx.accounts.config.withdraw_cooldown_secs, BidGuardError::CooldownActive);
        let amount = v.pending_withdrawal.min(ctx.accounts.vault_tokens.amount);
        let bidder = v.bidder;
        let seeds: &[&[u8]] = &[VAULT_SEED, bidder.as_ref(), &[v.bump]];
        pay(
            &ctx.accounts.token_program,
            &ctx.accounts.vault_tokens,
            &ctx.accounts.mint,
            &ctx.accounts.bidder_token,
            &ctx.accounts.vault.to_account_info(),
            &[seeds],
            amount,
        )?;
        let v = &mut ctx.accounts.vault;
        v.pending_withdrawal = 0;
        v.withdraw_requested_at = 0;
        Ok(())
    }

    /// Lets a buyer's Concierge Agent bid for them with its own key, up to a hard cap that the
    /// program enforces at settlement. The agent can never spend more than `cap` in total.
    pub fn set_agent(ctx: Context<VaultOwner>, agent: Pubkey, cap: u64) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        v.agent = agent;
        v.agent_cap = cap;
        v.agent_spent = 0;
        Ok(())
    }

    // ───────────────────────── auctions ─────────────────────────

    /// Goes live only when the operator co-signs, i.e. after the agent crew approved the listing.
    /// The seller posts a bond that is slashed if they lose a dispute or never ship.
    pub fn create_auction(
        ctx: Context<CreateAuction>,
        auction_id: u64,
        start_price: u64,
        min_increment: u64,
        ends_at: i64,
        listing_hash: [u8; 32],
        trust_score: u8,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(start_price > 0 && min_increment > 0, BidGuardError::InvalidAmount);
        require!(ends_at > now, BidGuardError::InvalidEndTime);
        require!(trust_score <= 100, BidGuardError::InvalidTrustScore);
        let config = &ctx.accounts.config;
        let bond = mul_bps(start_price, config.bond_bps as u64)?.max(config.min_bond);

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.seller_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            bond,
            ctx.accounts.mint.decimals,
        )?;

        let a = &mut ctx.accounts.auction;
        a.seller = ctx.accounts.seller.key();
        a.mint = ctx.accounts.mint.key();
        a.auction_id = auction_id;
        a.start_price = start_price;
        a.min_increment = min_increment;
        a.bond = bond;
        a.ends_at = ends_at;
        a.created_at = now;
        a.status = AuctionStatus::Live;
        a.listing_hash = listing_hash;
        a.trust_score = trust_score;
        a.bump = ctx.bumps.auction;
        a.escrow_bump = ctx.bumps.escrow;

        let p = &mut ctx.accounts.seller_profile;
        if p.seller == Pubkey::default() {
            p.seller = a.seller;
            p.bump = ctx.bumps.seller_profile;
        }
        p.auctions_created += 1;
        emit!(AuctionCreated { auction: a.key(), seller: a.seller, start_price, ends_at, trust_score });
        Ok(())
    }

    /// Settles the winning bid. The previous instruction in the transaction must be an Ed25519
    /// signature check of the bid message, signed by the bidder (or their capped agent key).
    /// Funds move straight from the winner's Bid Vault into this auction's escrow.
    pub fn settle_auction(ctx: Context<SettleAuction>, bidder: Pubkey, amount: u64, nonce: u64, expiry: i64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let auction_key = ctx.accounts.auction.key();
        {
            let a = &ctx.accounts.auction;
            require!(a.status == AuctionStatus::Live, BidGuardError::WrongStatus);
            require!(now >= a.ends_at, BidGuardError::AuctionNotEnded);
            require!(amount >= a.start_price, BidGuardError::BidTooLow);
        }
        require!(now <= expiry, BidGuardError::BidExpired);

        let message = bid_message(&auction_key, amount, nonce, expiry);
        let signer = verified_ed25519_signer(&ctx.accounts.instructions, message.as_bytes())?;

        let v = &mut ctx.accounts.vault;
        if signer != bidder {
            // Signed by the buyer's Concierge Agent: must be the registered agent, within its cap.
            require!(v.agent != Pubkey::default() && signer == v.agent, BidGuardError::BadSignature);
            let spent = v.agent_spent.checked_add(amount).ok_or(BidGuardError::MathOverflow)?;
            require!(spent <= v.agent_cap, BidGuardError::AgentCapExceeded);
            v.agent_spent = spent;
        }
        let available = ctx.accounts.vault_tokens.amount.saturating_sub(v.pending_withdrawal);
        require!(available >= amount, BidGuardError::InsufficientVault);

        let seeds: &[&[u8]] = &[VAULT_SEED, bidder.as_ref(), &[v.bump]];
        pay(
            &ctx.accounts.token_program,
            &ctx.accounts.vault_tokens,
            &ctx.accounts.mint,
            &ctx.accounts.escrow,
            &ctx.accounts.vault.to_account_info(),
            &[seeds],
            amount,
        )?;

        let a = &mut ctx.accounts.auction;
        a.buyer = bidder;
        a.price = amount;
        a.settled_at = now;
        a.status = AuctionStatus::Funded;
        emit!(AuctionSettled { auction: auction_key, buyer: bidder, price: amount, by_agent: signer != bidder });
        Ok(())
    }

    /// No valid bids: the operator (who saw every bid) closes it and the seller gets the bond back.
    pub fn cancel_unsold(ctx: Context<Finalize>) -> Result<()> {
        require_keys_eq!(ctx.accounts.authority.key(), ctx.accounts.config.operator, BidGuardError::Unauthorized);
        let a = &ctx.accounts.auction;
        require!(a.status == AuctionStatus::Live, BidGuardError::WrongStatus);
        require!(Clock::get()?.unix_timestamp >= a.ends_at, BidGuardError::AuctionNotEnded);
        payout(&ctx, 0, 0, a.bond)?;
        ctx.accounts.auction.status = AuctionStatus::Cancelled;
        close_escrow(&ctx)
    }

    // ───────────────────────── fulfilment ─────────────────────────

    pub fn mark_shipped(ctx: Context<SellerAction>, tracking: String) -> Result<()> {
        require!(!tracking.is_empty() && tracking.len() <= MAX_TRACKING_LEN, BidGuardError::NoteTooLong);
        let now = Clock::get()?.unix_timestamp;
        let ship_window = ctx.accounts.config.ship_window_secs;
        let a = &mut ctx.accounts.auction;
        require!(a.status == AuctionStatus::Funded, BidGuardError::WrongStatus);
        require!(now <= a.settled_at + ship_window, BidGuardError::ShipWindowClosed);
        a.tracking = tracking;
        a.shipped_at = now;
        a.status = AuctionStatus::Shipped;
        Ok(())
    }

    /// Carrier-tracking oracle: the operator reports delivery, which starts the buyer's review window.
    pub fn mark_delivered(ctx: Context<OperatorAction>) -> Result<()> {
        let a = &mut ctx.accounts.auction;
        require!(a.status == AuctionStatus::Shipped, BidGuardError::WrongStatus);
        a.delivered_at = Clock::get()?.unix_timestamp;
        a.status = AuctionStatus::Delivered;
        Ok(())
    }

    /// The buyer is happy: pay the seller now and return their bond.
    pub fn confirm_delivery(ctx: Context<Finalize>) -> Result<()> {
        let a = &ctx.accounts.auction;
        require_keys_eq!(ctx.accounts.authority.key(), a.buyer, BidGuardError::Unauthorized);
        require!(a.status == AuctionStatus::Shipped || a.status == AuctionStatus::Delivered, BidGuardError::WrongStatus);
        release(ctx)
    }

    /// The buyer stayed silent after delivery: anyone may release once the review window passed.
    pub fn release_after_timeout(ctx: Context<Finalize>) -> Result<()> {
        let a = &ctx.accounts.auction;
        require!(a.status == AuctionStatus::Delivered, BidGuardError::WrongStatus);
        require!(Clock::get()?.unix_timestamp >= a.delivered_at + ctx.accounts.config.release_window_secs, BidGuardError::WindowNotPassed);
        release(ctx)
    }

    /// The seller never shipped: anyone may refund the buyer once the ship window passed.
    /// The seller's bond goes to the buyer as compensation.
    pub fn refund_unshipped(ctx: Context<Finalize>) -> Result<()> {
        let a = &ctx.accounts.auction;
        require!(a.status == AuctionStatus::Funded, BidGuardError::WrongStatus);
        require!(Clock::get()?.unix_timestamp > a.settled_at + ctx.accounts.config.ship_window_secs, BidGuardError::WindowNotPassed);
        let (price, bond) = (a.price, a.bond);
        payout(&ctx, 0, price + bond, 0)?;
        ctx.accounts.auction.status = AuctionStatus::Refunded;
        let p = &mut ctx.accounts.seller_profile;
        p.failed_shipments += 1;
        close_escrow(&ctx)
    }

    // ───────────────────────── disputes ─────────────────────────

    pub fn raise_dispute(ctx: Context<BuyerAction>, reason: String) -> Result<()> {
        require!(!reason.is_empty() && reason.len() <= MAX_NOTE_LEN, BidGuardError::NoteTooLong);
        let a = &mut ctx.accounts.auction;
        require!(a.status == AuctionStatus::Shipped || a.status == AuctionStatus::Delivered, BidGuardError::WrongStatus);
        a.dispute_reason = reason;
        a.disputed_at = Clock::get()?.unix_timestamp;
        a.status = AuctionStatus::Disputed;
        Ok(())
    }

    /// Executes a dispute outcome. The Dispute Judge Agent recommends `buyer_bps`; only the arbiter
    /// key can execute it. Funds can only go to the buyer, the seller or the fee treasury.
    /// If the buyer receives half or more, the seller's bond is slashed to the buyer.
    pub fn resolve_dispute(ctx: Context<Finalize>, buyer_bps: u16, note: String) -> Result<()> {
        require_keys_eq!(ctx.accounts.authority.key(), ctx.accounts.config.arbiter, BidGuardError::Unauthorized);
        require!(buyer_bps as u64 <= BPS, BidGuardError::InvalidSplit);
        require!(note.len() <= MAX_NOTE_LEN, BidGuardError::NoteTooLong);
        let a = &ctx.accounts.auction;
        require!(a.status == AuctionStatus::Disputed, BidGuardError::WrongStatus);
        let to_buyer = mul_bps(a.price, buyer_bps as u64)?;
        let seller_gross = a.price - to_buyer;
        let fee = mul_bps(seller_gross, ctx.accounts.config.fee_bps as u64)?;
        let buyer_wins = buyer_bps as u64 * 2 >= BPS;
        let bond = a.bond;
        let (buyer_total, seller_total) = if buyer_wins { (to_buyer + bond, seller_gross - fee) } else { (to_buyer, seller_gross - fee + bond) };
        payout(&ctx, fee, buyer_total, seller_total)?;
        let a = &mut ctx.accounts.auction;
        a.buyer_bps = buyer_bps;
        a.resolution_note = note;
        a.status = AuctionStatus::Resolved;
        let p = &mut ctx.accounts.seller_profile;
        if buyer_wins {
            p.disputes_lost += 1;
        } else {
            p.disputes_won += 1;
            p.sales_completed += 1;
            p.volume += seller_gross;
        }
        close_escrow(&ctx)
    }
}

// ───────────────────────── helpers ─────────────────────────

/// The exact text a bidder signs in their wallet. Human-readable on purpose: wallets show it.
pub fn bid_message(auction: &Pubkey, amount: u64, nonce: u64, expiry: i64) -> String {
    format!("BidGuard bid v1\nauction: {}\namount: {}\nnonce: {}\nexpires: {}", auction, amount, nonce, expiry)
}

/// Checks that the instruction just before this one is a single Ed25519 verification of
/// `expected` (all data inline), and returns the public key that signed it.
fn verified_ed25519_signer(ix_sysvar: &AccountInfo, expected: &[u8]) -> Result<Pubkey> {
    let current = load_current_index_checked(ix_sysvar)? as usize;
    require!(current > 0, BidGuardError::MissingSignatureCheck);
    let ix = load_instruction_at_checked(current - 1, ix_sysvar)?;
    require_keys_eq!(ix.program_id, ED25519_PROGRAM_ID, BidGuardError::MissingSignatureCheck);
    let d = &ix.data;
    require!(d.len() >= 16 && d[0] == 1, BidGuardError::BadSignature);
    let u16_at = |i: usize| u16::from_le_bytes([d[i], d[i + 1]]);
    let (sig_ix, pk_off, pk_ix, msg_off, msg_len, msg_ix) = (u16_at(4), u16_at(6) as usize, u16_at(8), u16_at(10) as usize, u16_at(12) as usize, u16_at(14));
    // Every piece must live inside the Ed25519 instruction itself (no pointing at other data).
    require!(sig_ix == u16::MAX && pk_ix == u16::MAX && msg_ix == u16::MAX, BidGuardError::BadSignature);
    require!(d.len() >= pk_off + 32 && d.len() >= msg_off + msg_len, BidGuardError::BadSignature);
    require!(&d[msg_off..msg_off + msg_len] == expected, BidGuardError::BadSignature);
    Ok(Pubkey::try_from(&d[pk_off..pk_off + 32]).map_err(|_| error!(BidGuardError::BadSignature))?)
}

fn mul_bps(amount: u64, bps: u64) -> Result<u64> {
    let v = (amount as u128).checked_mul(bps as u128).ok_or(BidGuardError::MathOverflow)? / BPS as u128;
    u64::try_from(v).map_err(|_| error!(BidGuardError::MathOverflow))
}

fn pay<'info>(
    token_program: &Interface<'info, TokenInterface>,
    from: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    authority: &AccountInfo<'info>,
    signer: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked { from: from.to_account_info(), mint: mint.to_account_info(), to: to.to_account_info(), authority: authority.clone() },
            signer,
        ),
        amount,
        mint.decimals,
    )
}

/// Pays out of an auction's escrow: fee → treasury, then buyer and seller shares.
fn payout(ctx: &Context<Finalize>, fee: u64, to_buyer: u64, to_seller: u64) -> Result<()> {
    let a = &ctx.accounts.auction;
    let id = a.auction_id.to_le_bytes();
    let seeds: &[&[u8]] = &[AUCTION_SEED, a.seller.as_ref(), &id, &[a.bump]];
    let auth = ctx.accounts.auction.to_account_info();
    let acc = &ctx.accounts;
    pay(&acc.token_program, &acc.escrow, &acc.mint, &acc.treasury_token, &auth, &[seeds], fee)?;
    pay(&acc.token_program, &acc.escrow, &acc.mint, &acc.buyer_token, &auth, &[seeds], to_buyer)?;
    pay(&acc.token_program, &acc.escrow, &acc.mint, &acc.seller_token, &auth, &[seeds], to_seller)
}

/// Closes the (now empty) escrow token account and returns its rent to the seller who paid it.
fn close_escrow(ctx: &Context<Finalize>) -> Result<()> {
    let a = &ctx.accounts.auction;
    let id = a.auction_id.to_le_bytes();
    let seeds: &[&[u8]] = &[AUCTION_SEED, a.seller.as_ref(), &id, &[a.bump]];
    token_interface::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.escrow.to_account_info(),
            destination: ctx.accounts.seller.to_account_info(),
            authority: ctx.accounts.auction.to_account_info(),
        },
        &[seeds],
    ))
}

fn release(ctx: Context<Finalize>) -> Result<()> {
    let a = &ctx.accounts.auction;
    let fee = mul_bps(a.price, ctx.accounts.config.fee_bps as u64)?;
    let (price, bond) = (a.price, a.bond);
    payout(&ctx, fee, 0, price - fee + bond)?;
    ctx.accounts.auction.status = AuctionStatus::Released;
    let p = &mut ctx.accounts.seller_profile;
    p.sales_completed += 1;
    p.volume += price;
    emit!(AuctionReleased { auction: ctx.accounts.auction.key(), seller: ctx.accounts.auction.seller, amount: price - fee });
    close_escrow(&ctx)
}

// ───────────────────────── accounts ─────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigParams {
    pub operator: Pubkey,
    pub arbiter: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub bond_bps: u16,
    pub min_bond: u64,
    pub ship_window_secs: i64,
    pub release_window_secs: i64,
    pub withdraw_cooldown_secs: i64,
}

impl ConfigParams {
    fn validate(&self) -> Result<()> {
        require!(self.fee_bps <= MAX_FEE_BPS, BidGuardError::FeeTooHigh);
        require!(self.bond_bps as u64 <= BPS, BidGuardError::InvalidSplit);
        require!(self.ship_window_secs > 0 && self.release_window_secs > 0 && self.withdraw_cooldown_secs >= 0, BidGuardError::InvalidWindow);
        Ok(())
    }
}

impl Config {
    fn apply(&mut self, p: ConfigParams) {
        self.operator = p.operator;
        self.arbiter = p.arbiter;
        self.treasury = p.treasury;
        self.fee_bps = p.fee_bps;
        self.bond_bps = p.bond_bps;
        self.min_bond = p.min_bond;
        self.ship_window_secs = p.ship_window_secs;
        self.release_window_secs = p.release_window_secs;
        self.withdraw_cooldown_secs = p.withdraw_cooldown_secs;
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = mint)]
    pub config: Account<'info, Config>,
    #[account(init_if_needed, payer = bidder, space = 8 + BidVault::INIT_SPACE, seeds = [VAULT_SEED, bidder.key().as_ref()], bump)]
    pub vault: Account<'info, BidVault>,
    #[account(
        init_if_needed,
        payer = bidder,
        seeds = [VAULT_TOKENS_SEED, bidder.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = vault,
        token::token_program = token_program
    )]
    pub vault_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = bidder, token::token_program = token_program)]
    pub bidder_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VaultOwner<'info> {
    pub bidder: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, bidder.key().as_ref()], bump = vault.bump, constraint = vault.bidder == bidder.key() @ BidGuardError::Unauthorized)]
    pub vault: Account<'info, BidVault>,
    #[account(seeds = [VAULT_TOKENS_SEED, bidder.key().as_ref()], bump = vault.tokens_bump)]
    pub vault_tokens: InterfaceAccount<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub bidder: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = mint)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [VAULT_SEED, bidder.key().as_ref()], bump = vault.bump, constraint = vault.bidder == bidder.key() @ BidGuardError::Unauthorized)]
    pub vault: Account<'info, BidVault>,
    #[account(mut, seeds = [VAULT_TOKENS_SEED, bidder.key().as_ref()], bump = vault.tokens_bump)]
    pub vault_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = bidder, token::token_program = token_program)]
    pub bidder_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(auction_id: u64)]
pub struct CreateAuction<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    /// The orchestrator's key: proves the agent crew approved this listing.
    pub operator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = mint, has_one = operator)]
    pub config: Account<'info, Config>,
    #[account(init, payer = seller, space = 8 + Auction::INIT_SPACE, seeds = [AUCTION_SEED, seller.key().as_ref(), &auction_id.to_le_bytes()], bump)]
    pub auction: Account<'info, Auction>,
    #[account(
        init,
        payer = seller,
        seeds = [ESCROW_SEED, auction.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = auction,
        token::token_program = token_program
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    #[account(init_if_needed, payer = seller, space = 8 + SellerProfile::INIT_SPACE, seeds = [SELLER_SEED, seller.key().as_ref()], bump)]
    pub seller_profile: Account<'info, SellerProfile>,
    #[account(mut, token::mint = mint, token::authority = seller, token::token_program = token_program)]
    pub seller_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bidder: Pubkey)]
pub struct SettleAuction<'info> {
    pub operator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = mint, has_one = operator)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [AUCTION_SEED, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()], bump = auction.bump, has_one = mint)]
    pub auction: Account<'info, Auction>,
    #[account(mut, seeds = [ESCROW_SEED, auction.key().as_ref()], bump = auction.escrow_bump)]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [VAULT_SEED, bidder.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, BidVault>,
    #[account(mut, seeds = [VAULT_TOKENS_SEED, bidder.as_ref()], bump = vault.tokens_bump)]
    pub vault_tokens: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: the instructions sysvar, used to read the Ed25519 verification instruction.
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SellerAction<'info> {
    pub seller: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [AUCTION_SEED, seller.key().as_ref(), &auction.auction_id.to_le_bytes()], bump = auction.bump, has_one = seller)]
    pub auction: Account<'info, Auction>,
}

#[derive(Accounts)]
pub struct BuyerAction<'info> {
    pub buyer: Signer<'info>,
    #[account(mut, seeds = [AUCTION_SEED, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()], bump = auction.bump, has_one = buyer)]
    pub auction: Account<'info, Auction>,
}

#[derive(Accounts)]
pub struct OperatorAction<'info> {
    pub operator: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = operator)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [AUCTION_SEED, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()], bump = auction.bump)]
    pub auction: Account<'info, Auction>,
}

/// Shared by every instruction that pays out of escrow. Who may call each one is checked in the handler.
#[derive(Accounts)]
pub struct Finalize<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = mint)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [AUCTION_SEED, auction.seller.as_ref(), &auction.auction_id.to_le_bytes()], bump = auction.bump, has_one = mint, has_one = seller)]
    pub auction: Account<'info, Auction>,
    #[account(mut, seeds = [ESCROW_SEED, auction.key().as_ref()], bump = auction.escrow_bump)]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [SELLER_SEED, auction.seller.as_ref()], bump = seller_profile.bump)]
    pub seller_profile: Account<'info, SellerProfile>,
    /// CHECK: must equal `auction.seller` (has_one); only receives the escrow account's rent.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    #[account(mut, token::mint = mint, token::authority = auction.seller, token::token_program = token_program)]
    pub seller_token: InterfaceAccount<'info, TokenAccount>,
    /// The winning buyer's token account; for unsold auctions any account owned by the seller is fine (nothing is paid to it).
    #[account(
        mut,
        token::mint = mint,
        constraint = buyer_token.owner == auction.buyer || auction.buyer == Pubkey::default() @ BidGuardError::Unauthorized,
        token::token_program = token_program
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = config.treasury, token::token_program = token_program)]
    pub treasury_token: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

// ───────────────────────── state ─────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Auction server / agent orchestrator: approves listings, settles winning bids, reports delivery.
    pub operator: Pubkey,
    /// Executes dispute outcomes recommended by the Dispute Judge Agent (a multisig in production).
    pub arbiter: Pubkey,
    pub treasury: Pubkey,
    pub mint: Pubkey,
    pub fee_bps: u16,
    pub bond_bps: u16,
    pub min_bond: u64,
    pub ship_window_secs: i64,
    pub release_window_secs: i64,
    pub withdraw_cooldown_secs: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct BidVault {
    pub bidder: Pubkey,
    pub pending_withdrawal: u64,
    pub withdraw_requested_at: i64,
    /// Optional Concierge Agent key allowed to sign bids for this vault, up to `agent_cap`.
    pub agent: Pubkey,
    pub agent_cap: u64,
    pub agent_spent: u64,
    pub bump: u8,
    pub tokens_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub mint: Pubkey,
    pub auction_id: u64,
    pub start_price: u64,
    pub min_increment: u64,
    pub bond: u64,
    pub price: u64,
    pub ends_at: i64,
    pub created_at: i64,
    pub settled_at: i64,
    pub shipped_at: i64,
    pub delivered_at: i64,
    pub disputed_at: i64,
    pub status: AuctionStatus,
    pub buyer_bps: u16,
    /// SHA-256 of the approved listing (title, description, photos), tying the auction to what the agents checked.
    pub listing_hash: [u8; 32],
    pub trust_score: u8,
    pub bump: u8,
    pub escrow_bump: u8,
    #[max_len(MAX_TRACKING_LEN)]
    pub tracking: String,
    #[max_len(MAX_NOTE_LEN)]
    pub dispute_reason: String,
    #[max_len(MAX_NOTE_LEN)]
    pub resolution_note: String,
}

/// Portable on-chain seller reputation.
#[account]
#[derive(InitSpace)]
pub struct SellerProfile {
    pub seller: Pubkey,
    pub auctions_created: u64,
    pub sales_completed: u64,
    pub failed_shipments: u64,
    pub disputes_won: u64,
    pub disputes_lost: u64,
    pub volume: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum AuctionStatus {
    Live,
    Funded,
    Shipped,
    Delivered,
    Disputed,
    Released,
    Refunded,
    Resolved,
    Cancelled,
}

// ───────────────────────── events & errors ─────────────────────────

#[event]
pub struct VaultDeposited {
    pub bidder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AuctionCreated {
    pub auction: Pubkey,
    pub seller: Pubkey,
    pub start_price: u64,
    pub ends_at: i64,
    pub trust_score: u8,
}

#[event]
pub struct AuctionSettled {
    pub auction: Pubkey,
    pub buyer: Pubkey,
    pub price: u64,
    pub by_agent: bool,
}

#[event]
pub struct AuctionReleased {
    pub auction: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum BidGuardError {
    #[msg("Amount must be greater than zero and within your balance")]
    InvalidAmount,
    #[msg("Fee is above the 10% cap")]
    FeeTooHigh,
    #[msg("Invalid split")]
    InvalidSplit,
    #[msg("Invalid time window")]
    InvalidWindow,
    #[msg("End time must be in the future")]
    InvalidEndTime,
    #[msg("Trust score must be 0-100")]
    InvalidTrustScore,
    #[msg("Not allowed")]
    Unauthorized,
    #[msg("The auction is not in the right state for this")]
    WrongStatus,
    #[msg("The auction hasn't ended yet")]
    AuctionNotEnded,
    #[msg("Bid is below the starting price")]
    BidTooLow,
    #[msg("This signed bid has expired")]
    BidExpired,
    #[msg("Missing the Ed25519 signature check for the bid")]
    MissingSignatureCheck,
    #[msg("The bid signature doesn't match")]
    BadSignature,
    #[msg("The Concierge Agent would exceed its spending cap")]
    AgentCapExceeded,
    #[msg("Not enough available funds in the Bid Vault")]
    InsufficientVault,
    #[msg("No withdrawal was requested")]
    NoPendingWithdrawal,
    #[msg("Withdrawal cooldown has not passed yet")]
    CooldownActive,
    #[msg("The shipping window has closed")]
    ShipWindowClosed,
    #[msg("The waiting period hasn't passed yet")]
    WindowNotPassed,
    #[msg("Text is empty or too long")]
    NoteTooLong,
    #[msg("Math overflow")]
    MathOverflow,
}
