use anchor_lang::prelude::*;

use crate::constants::{BOUNTY_SEED, VAULT_SEED};
use crate::error::BountyError;
use crate::state::{Bounty, BountyStatus, Vault};

#[derive(Accounts)]
pub struct Accept<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: hunter receives the escrowed SOL; must match bounty.hunter
    #[account(mut, constraint = hunter.key() == bounty.hunter @ BountyError::NoSubmission)]
    pub hunter: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, creator.key().as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
        has_one = creator @ BountyError::UnauthorizedCreator,
        constraint = bounty.status == BountyStatus::Submitted @ BountyError::NoSubmission,
        close = creator
    )]
    pub bounty: Account<'info, Bounty>,

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
    msg!(
        "Bounty accepted; vault (~{} lamports + rent) paid to hunter",
        amount
    );
    Ok(())
}
