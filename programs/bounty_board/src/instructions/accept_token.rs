use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::{BOUNTY_SEED, SUBMISSION_SEED, VAULT_SEED};
use crate::error::BountyError;
use crate::instructions::token_escrow;
use crate::state::{Bounty, BountyStatus, Submission};

#[derive(Accounts)]
pub struct AcceptToken<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: hunter owns the submission and receives the escrowed tokens
    #[account(mut)]
    pub hunter: SystemAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, creator.key().as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
        has_one = creator @ BountyError::UnauthorizedCreator,
        constraint = bounty.status == BountyStatus::Open @ BountyError::NotOpen,
        constraint = bounty.submission_count > 0 @ BountyError::NoSubmission,
        constraint = bounty.mint == mint.key() @ BountyError::WrongAsset
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        seeds = [SUBMISSION_SEED, bounty.key().as_ref(), hunter.key().as_ref()],
        bump = submission.bump,
        constraint = submission.bounty == bounty.key() @ BountyError::InvalidSubmission,
        constraint = submission.hunter == hunter.key() @ BountyError::InvalidSubmission
    )]
    pub submission: Account<'info, Submission>,

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
        init_if_needed,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = hunter,
        associated_token::token_program = token_program
    )]
    pub hunter_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_accept_token(ctx: Context<AcceptToken>) -> Result<()> {
    let amount = ctx.accounts.bounty.amount;
    let vault_amount = ctx.accounts.vault.amount;
    let hunter = ctx.accounts.hunter.key();

    ctx.accounts.bounty.status = BountyStatus::Completed;
    ctx.accounts.bounty.winner = hunter;

    token_escrow::transfer_and_close(
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.hunter_token_account.to_account_info(),
        ctx.accounts.bounty.to_account_info(),
        ctx.accounts.creator.to_account_info(),
        &ctx.accounts.bounty,
        vault_amount,
    )?;

    msg!(
        "Token bounty accepted; {} base units paid to {}",
        amount,
        hunter
    );
    Ok(())
}
