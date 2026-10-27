use anchor_lang::prelude::*;

use crate::constants::{BOUNTY_SEED, VAULT_SEED};
use crate::error::BountyError;
use crate::state::{Bounty, BountyStatus, Vault};

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, creator.key().as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
        has_one = creator @ BountyError::UnauthorizedCreator,
        constraint = bounty.status == BountyStatus::Open || bounty.status == BountyStatus::Submitted
            @ BountyError::CannotCancel,
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

pub fn handle_cancel(ctx: Context<Cancel>) -> Result<()> {
    let amount = ctx.accounts.bounty.amount;
    ctx.accounts.bounty.status = BountyStatus::Cancelled;
    msg!("Bounty cancelled; {} lamports (+ rent) refunded", amount);
    Ok(())
}
