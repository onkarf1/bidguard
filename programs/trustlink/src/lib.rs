//! TrustLink — trustless escrow for freelancers and social sellers.
//!
//! Lifecycle of a deal:
//!
//!   Open ──fund──▶ Funded ──submit_delivery──▶ Delivered ──release──▶ Completed
//!    │               │  ╲                          │
//!  cancel            │   ╲ raise_dispute           │ raise_dispute
//!    ▼               │    ╲                        ▼
//!  (closed)          │     ╲──────────────────▶ Disputed ──resolve_dispute (arbiter)──▶ Resolved
//!                    │
//!                    └─refund_expired (deadline passed, nothing delivered)──▶ Refunded
//!
//! Funds sit in a PDA-owned token vault the whole time. Neither party can move
//! them unilaterally, except through the timeout paths that protect each side
//! from a counterparty who disappears.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("3xYeBR8Cb1Eh8Fwb4U36ceUGE9V1MfjtzSc2z6JJv1Bg");

pub const CONFIG_SEED: &[u8] = b"config";
pub const DEAL_SEED: &[u8] = b"deal";
pub const VAULT_SEED: &[u8] = b"vault";
pub const PROFILE_SEED: &[u8] = b"profile";

pub const MAX_TITLE_LEN: usize = 64;
pub const MAX_TERMS_LEN: usize = 256;
pub const MAX_NOTE_LEN: usize = 200;

/// How long a buyer has to review a delivery before the seller may claim.
pub const REVIEW_PERIOD_SECS: i64 = 3 * 24 * 60 * 60;
/// How long the counterparty has to answer a dispute before the arbiter may rule without them.
pub const DISPUTE_RESPONSE_SECS: i64 = 24 * 60 * 60;
pub const MAX_FEE_BPS: u16 = 500; // 5% hard cap
pub const BPS_DENOMINATOR: u64 = 10_000;

#[program]
pub mod trustlink {
    use super::*;

    /// One-time platform setup: who arbitrates disputes, and where fees go.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        arbiter: Pubkey,
        treasury: Pubkey,
        fee_bps: u16,
    ) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, TrustLinkError::FeeTooHigh);
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.arbiter = arbiter;
        config.treasury = treasury;
        config.fee_bps = fee_bps;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        arbiter: Pubkey,
        treasury: Pubkey,
        fee_bps: u16,
    ) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, TrustLinkError::FeeTooHigh);
        let config = &mut ctx.accounts.config;
        config.arbiter = arbiter;
        config.treasury = treasury;
        config.fee_bps = fee_bps;
        Ok(())
    }

    /// Seller opens a deal. Anyone holding the link can then fund it.
    pub fn create_deal(
        ctx: Context<CreateDeal>,
        deal_id: u64,
        amount: u64,
        delivery_deadline: i64,
        title: String,
        terms: String,
    ) -> Result<()> {
        require!(amount > 0, TrustLinkError::InvalidAmount);
        require!(
            !title.is_empty() && title.len() <= MAX_TITLE_LEN,
            TrustLinkError::InvalidTitle
        );
        require!(terms.len() <= MAX_TERMS_LEN, TrustLinkError::TextTooLong);
        let now = Clock::get()?.unix_timestamp;
        require!(delivery_deadline > now, TrustLinkError::InvalidDeadline);

        let deal = &mut ctx.accounts.deal;
        deal.seller = ctx.accounts.seller.key();
        deal.buyer = Pubkey::default();
        deal.mint = ctx.accounts.mint.key();
        deal.deal_id = deal_id;
        deal.amount = amount;
        deal.delivery_deadline = delivery_deadline;
        deal.created_at = now;
        deal.funded_at = 0;
        deal.delivered_at = 0;
        deal.disputed_at = 0;
        deal.status = DealStatus::Open;
        deal.disputed_by = Pubkey::default();
        deal.buyer_bps = 0;
        deal.bump = ctx.bumps.deal;
        deal.vault_bump = ctx.bumps.vault;
        deal.title = title;
        deal.terms = terms;
        deal.delivery_note = String::new();
        deal.dispute_reason = String::new();
        deal.dispute_response = String::new();
        deal.resolution_note = String::new();

        let profile = &mut ctx.accounts.profile;
        if profile.seller == Pubkey::default() {
            profile.seller = ctx.accounts.seller.key();
            profile.bump = ctx.bumps.profile;
        }
        profile.deals_created = profile.deals_created.saturating_add(1);

        emit!(DealCreated {
            deal: deal.key(),
            seller: deal.seller,
            amount,
        });
        Ok(())
    }

    /// Buyer locks the full amount in the vault.
    pub fn fund_deal(ctx: Context<FundDeal>) -> Result<()> {
        let deal = &ctx.accounts.deal;
        require!(deal.status == DealStatus::Open, TrustLinkError::InvalidStatus);
        require_keys_neq!(
            ctx.accounts.buyer.key(),
            deal.seller,
            TrustLinkError::SellerCannotBuy
        );
        let now = Clock::get()?.unix_timestamp;
        require!(now < deal.delivery_deadline, TrustLinkError::DeadlinePassed);

        let amount = deal.amount;
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.buyer_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        let deal = &mut ctx.accounts.deal;
        deal.buyer = ctx.accounts.buyer.key();
        deal.funded_at = now;
        deal.status = DealStatus::Funded;

        emit!(DealFunded {
            deal: deal.key(),
            buyer: deal.buyer,
            amount,
        });
        Ok(())
    }

    /// Seller marks the work as delivered (link to files, tracking number, etc.).
    pub fn submit_delivery(ctx: Context<SellerAction>, delivery_note: String) -> Result<()> {
        require!(
            delivery_note.len() <= MAX_NOTE_LEN,
            TrustLinkError::TextTooLong
        );
        let deal = &mut ctx.accounts.deal;
        require!(deal.status == DealStatus::Funded, TrustLinkError::InvalidStatus);
        deal.delivery_note = delivery_note;
        deal.delivered_at = Clock::get()?.unix_timestamp;
        deal.status = DealStatus::Delivered;
        Ok(())
    }

    /// Pays the seller (minus platform fee). Callable by:
    /// - the buyer, any time after funding (they're happy), or
    /// - the seller, once the review period after delivery has elapsed with no dispute.
    pub fn release_funds(ctx: Context<ReleaseFunds>) -> Result<()> {
        let deal = &ctx.accounts.deal;
        let caller = ctx.accounts.authority.key();
        let now = Clock::get()?.unix_timestamp;

        if caller == deal.buyer {
            require!(
                deal.status == DealStatus::Funded || deal.status == DealStatus::Delivered,
                TrustLinkError::InvalidStatus
            );
        } else if caller == deal.seller {
            require!(
                deal.status == DealStatus::Delivered,
                TrustLinkError::InvalidStatus
            );
            require!(
                now >= deal.delivered_at.saturating_add(REVIEW_PERIOD_SECS),
                TrustLinkError::ReviewPeriodActive
            );
        } else {
            return err!(TrustLinkError::Unauthorized);
        }

        let amount = deal.amount;
        let fee = fee_for(amount, ctx.accounts.config.fee_bps)?;
        let seller_amount = amount.checked_sub(fee).ok_or(TrustLinkError::MathOverflow)?;

        let seller_key = deal.seller;
        let id_bytes = deal.deal_id.to_le_bytes();
        let bump = [deal.bump];
        let seeds: &[&[u8]] = &[DEAL_SEED, seller_key.as_ref(), &id_bytes, &bump];
        let signer = &[seeds];

        let a = &ctx.accounts;
        let deal_info = a.deal.to_account_info();
        vault_transfer(&a.token_program, &a.vault, &a.mint, &a.seller_token, &deal_info, signer, seller_amount)?;
        vault_transfer(&a.token_program, &a.vault, &a.mint, &a.treasury_token, &deal_info, signer, fee)?;
        close_vault(&a.token_program, &a.vault, &a.seller.to_account_info(), &deal_info, signer)?;

        let profile = &mut ctx.accounts.profile;
        profile.deals_completed = profile.deals_completed.saturating_add(1);
        profile.total_volume = profile.total_volume.saturating_add(amount);

        let deal = &mut ctx.accounts.deal;
        deal.status = DealStatus::Completed;

        emit!(DealSettled {
            deal: deal.key(),
            to_seller: seller_amount,
            to_buyer: 0,
            fee,
        });
        Ok(())
    }

    /// Buyer gets a full refund if the seller never delivered by the deadline.
    pub fn refund_expired(ctx: Context<RefundExpired>) -> Result<()> {
        let deal = &ctx.accounts.deal;
        require!(deal.status == DealStatus::Funded, TrustLinkError::InvalidStatus);
        let now = Clock::get()?.unix_timestamp;
        require!(now > deal.delivery_deadline, TrustLinkError::DeadlineNotReached);

        let amount = deal.amount;
        let seller_key = deal.seller;
        let id_bytes = deal.deal_id.to_le_bytes();
        let bump = [deal.bump];
        let seeds: &[&[u8]] = &[DEAL_SEED, seller_key.as_ref(), &id_bytes, &bump];
        let signer = &[seeds];

        let a = &ctx.accounts;
        let deal_info = a.deal.to_account_info();
        vault_transfer(&a.token_program, &a.vault, &a.mint, &a.buyer_token, &deal_info, signer, amount)?;
        close_vault(&a.token_program, &a.vault, &a.seller.to_account_info(), &deal_info, signer)?;

        let profile = &mut ctx.accounts.profile;
        profile.deals_refunded = profile.deals_refunded.saturating_add(1);

        let deal = &mut ctx.accounts.deal;
        deal.status = DealStatus::Refunded;

        emit!(DealSettled {
            deal: deal.key(),
            to_seller: 0,
            to_buyer: amount,
            fee: 0,
        });
        Ok(())
    }

    /// Seller withdraws a deal nobody has paid for yet; rent is returned.
    pub fn cancel_deal(ctx: Context<CancelDeal>) -> Result<()> {
        let deal = &ctx.accounts.deal;
        require!(deal.status == DealStatus::Open, TrustLinkError::InvalidStatus);

        let seller_key = deal.seller;
        let id_bytes = deal.deal_id.to_le_bytes();
        let bump = [deal.bump];
        let seeds: &[&[u8]] = &[DEAL_SEED, seller_key.as_ref(), &id_bytes, &bump];
        let signer = &[seeds];

        let a = &ctx.accounts;
        close_vault(
            &a.token_program,
            &a.vault,
            &a.seller.to_account_info(),
            &a.deal.to_account_info(),
            signer,
        )?;
        // The deal account itself is closed by the `close = seller` constraint.
        Ok(())
    }

    /// Either party freezes the deal and asks for arbitration.
    pub fn raise_dispute(ctx: Context<PartyAction>, reason: String) -> Result<()> {
        require!(reason.len() <= MAX_NOTE_LEN, TrustLinkError::TextTooLong);
        require!(!reason.is_empty(), TrustLinkError::TextTooLong);
        let caller = ctx.accounts.authority.key();
        let deal = &mut ctx.accounts.deal;
        require!(
            caller == deal.buyer || caller == deal.seller,
            TrustLinkError::Unauthorized
        );
        require!(
            deal.status == DealStatus::Funded || deal.status == DealStatus::Delivered,
            TrustLinkError::InvalidStatus
        );
        deal.status = DealStatus::Disputed;
        deal.disputed_by = caller;
        deal.disputed_at = Clock::get()?.unix_timestamp;
        deal.dispute_reason = reason;
        Ok(())
    }

    /// The other party tells their side of the story (once).
    pub fn respond_dispute(ctx: Context<PartyAction>, response: String) -> Result<()> {
        require!(response.len() <= MAX_NOTE_LEN, TrustLinkError::TextTooLong);
        require!(!response.is_empty(), TrustLinkError::TextTooLong);
        let caller = ctx.accounts.authority.key();
        let deal = &mut ctx.accounts.deal;
        require!(deal.status == DealStatus::Disputed, TrustLinkError::InvalidStatus);
        require!(
            (caller == deal.buyer || caller == deal.seller) && caller != deal.disputed_by,
            TrustLinkError::Unauthorized
        );
        require!(
            deal.dispute_response.is_empty(),
            TrustLinkError::AlreadyResponded
        );
        deal.dispute_response = response;
        Ok(())
    }

    /// Arbiter splits the escrow. `buyer_bps` = share refunded to the buyer (0..=10000).
    /// The arbiter must wait for the counterparty's response, or for the response window to lapse.
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        buyer_bps: u16,
        resolution_note: String,
    ) -> Result<()> {
        require!(
            (buyer_bps as u64) <= BPS_DENOMINATOR,
            TrustLinkError::InvalidSplit
        );
        require!(
            resolution_note.len() <= MAX_NOTE_LEN,
            TrustLinkError::TextTooLong
        );
        let deal = &ctx.accounts.deal;
        require!(deal.status == DealStatus::Disputed, TrustLinkError::InvalidStatus);
        let now = Clock::get()?.unix_timestamp;
        require!(
            !deal.dispute_response.is_empty()
                || now >= deal.disputed_at.saturating_add(DISPUTE_RESPONSE_SECS),
            TrustLinkError::AwaitingResponse
        );

        let amount = deal.amount;
        let to_buyer = (amount as u128)
            .checked_mul(buyer_bps as u128)
            .ok_or(TrustLinkError::MathOverflow)?
            / BPS_DENOMINATOR as u128;
        let to_buyer = u64::try_from(to_buyer).map_err(|_| TrustLinkError::MathOverflow)?;
        let seller_gross = amount.checked_sub(to_buyer).ok_or(TrustLinkError::MathOverflow)?;
        let fee = fee_for(seller_gross, ctx.accounts.config.fee_bps)?;
        let to_seller = seller_gross.checked_sub(fee).ok_or(TrustLinkError::MathOverflow)?;

        let seller_key = deal.seller;
        let id_bytes = deal.deal_id.to_le_bytes();
        let bump = [deal.bump];
        let seeds: &[&[u8]] = &[DEAL_SEED, seller_key.as_ref(), &id_bytes, &bump];
        let signer = &[seeds];

        let a = &ctx.accounts;
        let deal_info = a.deal.to_account_info();
        vault_transfer(&a.token_program, &a.vault, &a.mint, &a.buyer_token, &deal_info, signer, to_buyer)?;
        vault_transfer(&a.token_program, &a.vault, &a.mint, &a.seller_token, &deal_info, signer, to_seller)?;
        vault_transfer(&a.token_program, &a.vault, &a.mint, &a.treasury_token, &deal_info, signer, fee)?;
        close_vault(&a.token_program, &a.vault, &a.seller.to_account_info(), &deal_info, signer)?;

        let profile = &mut ctx.accounts.profile;
        if buyer_bps as u64 > BPS_DENOMINATOR / 2 {
            profile.disputes_lost = profile.disputes_lost.saturating_add(1);
        } else {
            profile.disputes_won = profile.disputes_won.saturating_add(1);
        }
        profile.total_volume = profile.total_volume.saturating_add(seller_gross);

        let deal = &mut ctx.accounts.deal;
        deal.status = DealStatus::Resolved;
        deal.buyer_bps = buyer_bps;
        deal.resolution_note = resolution_note;

        emit!(DealSettled {
            deal: deal.key(),
            to_seller,
            to_buyer,
            fee,
        });
        Ok(())
    }
}

// ───────────────────────────── helpers ─────────────────────────────

fn fee_for(amount: u64, fee_bps: u16) -> Result<u64> {
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(TrustLinkError::MathOverflow)?
        / BPS_DENOMINATOR as u128;
    u64::try_from(fee).map_err(|_| error!(TrustLinkError::MathOverflow))
}

fn vault_transfer<'info>(
    token_program: &Interface<'info, TokenInterface>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    deal: &AccountInfo<'info>,
    signer: &[&[&[u8]]],
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: deal.clone(),
            },
            signer,
        ),
        amount,
        mint.decimals,
    )
}

fn close_vault<'info>(
    token_program: &Interface<'info, TokenInterface>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    destination: &AccountInfo<'info>,
    deal: &AccountInfo<'info>,
    signer: &[&[&[u8]]],
) -> Result<()> {
    token_interface::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: destination.clone(),
            authority: deal.clone(),
        },
        signer,
    ))
}

// ───────────────────────────── accounts ─────────────────────────────

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(deal_id: u64)]
pub struct CreateDeal<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = seller,
        space = 8 + Deal::INIT_SPACE,
        seeds = [DEAL_SEED, seller.key().as_ref(), &deal_id.to_le_bytes()],
        bump
    )]
    pub deal: Account<'info, Deal>,
    #[account(
        init,
        payer = seller,
        seeds = [VAULT_SEED, deal.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = deal,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = seller,
        space = 8 + SellerProfile::INIT_SPACE,
        seeds = [PROFILE_SEED, seller.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, SellerProfile>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundDeal<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = mint
    )]
    pub deal: Account<'info, Deal>,
    #[account(mut, seeds = [VAULT_SEED, deal.key().as_ref()], bump = deal.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = buyer,
        token::token_program = token_program
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SellerAction<'info> {
    pub seller: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = seller @ TrustLinkError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
}

#[derive(Accounts)]
pub struct PartyAction<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump
    )]
    pub deal: Account<'info, Deal>,
}

#[derive(Accounts)]
pub struct ReleaseFunds<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = mint,
        has_one = seller
    )]
    pub deal: Account<'info, Deal>,
    #[account(mut, seeds = [VAULT_SEED, deal.key().as_ref()], bump = deal.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: verified against `deal.seller` via `has_one`; only receives vault rent.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = seller,
        token::token_program = token_program
    )]
    pub seller_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = config.treasury,
        token::token_program = token_program
    )]
    pub treasury_token: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [PROFILE_SEED, seller.key().as_ref()], bump = profile.bump)]
    pub profile: Account<'info, SellerProfile>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct RefundExpired<'info> {
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = mint,
        has_one = buyer @ TrustLinkError::Unauthorized,
        has_one = seller
    )]
    pub deal: Account<'info, Deal>,
    #[account(mut, seeds = [VAULT_SEED, deal.key().as_ref()], bump = deal.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: verified against `deal.seller` via `has_one`; only receives vault rent.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = buyer,
        token::token_program = token_program
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [PROFILE_SEED, seller.key().as_ref()], bump = profile.bump)]
    pub profile: Account<'info, SellerProfile>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CancelDeal<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = seller @ TrustLinkError::Unauthorized,
        close = seller
    )]
    pub deal: Account<'info, Deal>,
    #[account(mut, seeds = [VAULT_SEED, deal.key().as_ref()], bump = deal.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(address = config.arbiter @ TrustLinkError::Unauthorized)]
    pub arbiter: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = mint,
        has_one = seller,
        has_one = buyer
    )]
    pub deal: Account<'info, Deal>,
    #[account(mut, seeds = [VAULT_SEED, deal.key().as_ref()], bump = deal.vault_bump)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: verified against `deal.seller` via `has_one`; only receives vault rent.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    /// CHECK: verified against `deal.buyer` via `has_one`.
    pub buyer: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = seller,
        token::token_program = token_program
    )]
    pub seller_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = buyer,
        token::token_program = token_program
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = config.treasury,
        token::token_program = token_program
    )]
    pub treasury_token: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [PROFILE_SEED, seller.key().as_ref()], bump = profile.bump)]
    pub profile: Account<'info, SellerProfile>,
    pub token_program: Interface<'info, TokenInterface>,
}

// ───────────────────────────── state ─────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub arbiter: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Deal {
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub mint: Pubkey,
    pub deal_id: u64,
    pub amount: u64,
    pub delivery_deadline: i64,
    pub created_at: i64,
    pub funded_at: i64,
    pub delivered_at: i64,
    pub disputed_at: i64,
    pub status: DealStatus,
    pub disputed_by: Pubkey,
    /// Share of the escrow refunded to the buyer by the arbiter, in basis points.
    pub buyer_bps: u16,
    pub bump: u8,
    pub vault_bump: u8,
    #[max_len(MAX_TITLE_LEN)]
    pub title: String,
    #[max_len(MAX_TERMS_LEN)]
    pub terms: String,
    #[max_len(MAX_NOTE_LEN)]
    pub delivery_note: String,
    #[max_len(MAX_NOTE_LEN)]
    pub dispute_reason: String,
    #[max_len(MAX_NOTE_LEN)]
    pub dispute_response: String,
    #[max_len(MAX_NOTE_LEN)]
    pub resolution_note: String,
}

/// Portable, on-chain reputation for a seller.
#[account]
#[derive(InitSpace)]
pub struct SellerProfile {
    pub seller: Pubkey,
    pub deals_created: u64,
    pub deals_completed: u64,
    pub deals_refunded: u64,
    pub disputes_won: u64,
    pub disputes_lost: u64,
    pub total_volume: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum DealStatus {
    Open,
    Funded,
    Delivered,
    Disputed,
    Completed,
    Refunded,
    Resolved,
}

// ───────────────────────────── events & errors ─────────────────────────────

#[event]
pub struct DealCreated {
    pub deal: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DealFunded {
    pub deal: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DealSettled {
    pub deal: Pubkey,
    pub to_seller: u64,
    pub to_buyer: u64,
    pub fee: u64,
}

#[error_code]
pub enum TrustLinkError {
    #[msg("Fee exceeds the 5% cap")]
    FeeTooHigh,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Title must be 1-64 bytes")]
    InvalidTitle,
    #[msg("Text is empty or too long")]
    TextTooLong,
    #[msg("Delivery deadline must be in the future")]
    InvalidDeadline,
    #[msg("Deal is not in the right state for this action")]
    InvalidStatus,
    #[msg("The seller cannot fund their own deal")]
    SellerCannotBuy,
    #[msg("The delivery deadline has passed")]
    DeadlinePassed,
    #[msg("The delivery deadline has not passed yet")]
    DeadlineNotReached,
    #[msg("The buyer's review period is still active")]
    ReviewPeriodActive,
    #[msg("Signer is not allowed to perform this action")]
    Unauthorized,
    #[msg("This dispute already has a response")]
    AlreadyResponded,
    #[msg("Waiting for the other party to respond to the dispute")]
    AwaitingResponse,
    #[msg("Buyer share must be between 0 and 10000 bps")]
    InvalidSplit,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
