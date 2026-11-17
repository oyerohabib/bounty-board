use anchor_lang::prelude::*;

use crate::constants::{BOUNTY_SEED, VAULT_SEED};
use crate::error::BountyError;
use crate::state::{Bounty, BountyStatus, Vault};

#[derive(Accounts)]
pub struct ExpireRefund<'info> {
    /// Anyone can trigger expiry after the deadline.
    pub caller: Signer<'info>,

    /// CHECK: creator receives the refund
    #[account(mut, constraint = creator.key() == bounty.creator @ BountyError::UnauthorizedCreator)]
    pub creator: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, bounty.creator.as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
        constraint = bounty.status == BountyStatus::Open @ BountyError::CannotExpire,
        close = creator
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        mut,
        seeds = [VAULT_SEED, bounty.key().as_ref()],
        bump = bounty.vault_bump,
        close = creator
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handle_expire_refund(ctx: Context<ExpireRefund>) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= ctx.accounts.bounty.deadline,
        BountyError::DeadlineNotReached
    );

    let amount = ctx.accounts.bounty.amount;
    ctx.accounts.bounty.status = BountyStatus::Expired;
    msg!(
        "Bounty expired; {} lamports (+ rent) refunded to creator",
        amount
    );
    Ok(())
}
