use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::{BOUNTY_SEED, VAULT_SEED};
use crate::error::BountyError;
use crate::instructions::token_escrow;
use crate::state::{Bounty, BountyStatus};

#[derive(Accounts)]
pub struct CancelToken<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, creator.key().as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
        has_one = creator @ BountyError::UnauthorizedCreator,
        constraint = bounty.status == BountyStatus::Open @ BountyError::CannotCancel,
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

pub fn handle_cancel_token(ctx: Context<CancelToken>) -> Result<()> {
    let amount = ctx.accounts.bounty.amount;
    let vault_amount = ctx.accounts.vault.amount;
    ctx.accounts.bounty.status = BountyStatus::Cancelled;

    token_escrow::transfer_and_close(
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.creator_token_account.to_account_info(),
        ctx.accounts.bounty.to_account_info(),
        ctx.accounts.creator.to_account_info(),
        &ctx.accounts.bounty,
        vault_amount,
    )?;

    msg!("Token bounty cancelled; {} base units refunded", amount);
    Ok(())
}
