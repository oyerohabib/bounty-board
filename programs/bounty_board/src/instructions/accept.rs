use anchor_lang::prelude::*;

use crate::constants::{BOUNTY_SEED, SUBMISSION_SEED, VAULT_SEED};
use crate::error::BountyError;
use crate::state::{Bounty, BountyStatus, Submission, Vault};

#[derive(Accounts)]
pub struct Accept<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: hunter receives the escrowed SOL; must own the submission
    #[account(mut)]
    pub hunter: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, creator.key().as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
        has_one = creator @ BountyError::UnauthorizedCreator,
        constraint = bounty.status == BountyStatus::Open @ BountyError::NotOpen,
        constraint = bounty.submission_count > 0 @ BountyError::NoSubmission
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
        close = hunter
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handle_accept(ctx: Context<Accept>) -> Result<()> {
    let amount = ctx.accounts.bounty.amount;
    ctx.accounts.bounty.status = BountyStatus::Completed;
    ctx.accounts.bounty.winner = ctx.accounts.hunter.key();
    // Vault closed to hunter (escrow + vault rent). Bounty + submission kept for history.
    msg!(
        "Bounty accepted; vault (~{} lamports + rent) paid to {}",
        amount,
        ctx.accounts.hunter.key()
    );
    Ok(())
}
