use anchor_lang::prelude::*;

use crate::constants::SUBMISSION_SEED;
use crate::error::BountyError;
use crate::state::Submission;

#[derive(Accounts)]
pub struct ReclaimSubmission<'info> {
    #[account(mut)]
    pub hunter: Signer<'info>,

    /// CHECK: bounty PDA — must be closed (lamports == 0 / no data) or we reject.
    /// After accept/cancel/expire the bounty account is closed.
    #[account(mut)]
    pub bounty: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [SUBMISSION_SEED, bounty.key().as_ref(), hunter.key().as_ref()],
        bump = submission.bump,
        constraint = submission.hunter == hunter.key() @ BountyError::InvalidSubmission,
        constraint = submission.bounty == bounty.key() @ BountyError::InvalidSubmission,
        close = hunter
    )]
    pub submission: Account<'info, Submission>,
}

pub fn handle_reclaim_submission(ctx: Context<ReclaimSubmission>) -> Result<()> {
    // Bounty must already be closed (accept/cancel/expire). An open bounty still has data.
    let bounty_info = ctx.accounts.bounty.to_account_info();
    require!(
        bounty_info.lamports() == 0 || bounty_info.data_is_empty(),
        BountyError::BountyStillOpen
    );

    msg!("Submission reclaimed by {}", ctx.accounts.hunter.key());
    Ok(())
}
