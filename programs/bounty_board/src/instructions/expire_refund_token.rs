use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::{BOUNTY_SEED, VAULT_SEED};
use crate::error::BountyError;
use crate::instructions::token_escrow;
use crate::state::{Bounty, BountyStatus};

#[derive(Accounts)]
pub struct ExpireRefundToken<'info> {
    /// Anyone can trigger expiry after the deadline.
    pub caller: Signer<'info>,

    /// CHECK: creator receives the refunded tokens and vault rent
    #[account(mut, constraint = creator.key() == bounty.creator @ BountyError::UnauthorizedCreator)]
    pub creator: SystemAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, bounty.creator.as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
        constraint = bounty.status == BountyStatus::Open @ BountyError::CannotExpire,
        constraint = bounty.mint == mint.key() @ BountyError::WrongAsset
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        mut,
        seeds = [VAULT_SEED, bounty.key().as_ref()],
        bump = bounty.vault_bump,
        token::mint = mint,
        token::authority = bounty,
        token::token_program = token_program
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handle_expire_refund_token(ctx: Context<ExpireRefundToken>) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= ctx.accounts.bounty.deadline,
        BountyError::DeadlineNotReached
    );

    let amount = ctx.accounts.bounty.amount;
    let vault_amount = ctx.accounts.vault.amount;
    ctx.accounts.bounty.status = BountyStatus::Expired;

    token_escrow::transfer_and_close(
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.creator_token_account.to_account_info(),
        ctx.accounts.bounty.to_account_info(),
        ctx.accounts.creator.to_account_info(),
        &ctx.accounts.bounty,
        vault_amount,
    )?;

    msg!(
        "Token bounty expired; {} base units refunded to creator",
        amount
    );
    Ok(())
}
