use anchor_lang::prelude::*;

use crate::constants::{BOUNTY_SEED, MAX_URI_LEN};
use crate::error::BountyError;
use crate::state::{Bounty, BountyStatus};

#[derive(Accounts)]
pub struct SubmitWork<'info> {
    pub hunter: Signer<'info>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, bounty.creator.as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
        constraint = bounty.status == BountyStatus::Open || bounty.status == BountyStatus::Submitted
            @ BountyError::NotOpen
    )]
    pub bounty: Account<'info, Bounty>,
}

pub fn handle_submit_work(ctx: Context<SubmitWork>, submission_uri: String) -> Result<()> {
    require!(
        submission_uri.len() <= MAX_URI_LEN,
        BountyError::UriTooLong
    );
    require!(!submission_uri.is_empty(), BountyError::UriTooLong);

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < ctx.accounts.bounty.deadline,
        BountyError::NotOpen
    );

    let bounty = &mut ctx.accounts.bounty;
    bounty.hunter = ctx.accounts.hunter.key();
    bounty.submission_uri = submission_uri;
    bounty.status = BountyStatus::Submitted;

    msg!("Work submitted by {}", bounty.hunter);
    Ok(())
}
