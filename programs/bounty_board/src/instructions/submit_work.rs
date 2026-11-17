use anchor_lang::prelude::*;

use crate::constants::{BOUNTY_SEED, MAX_URI_LEN, SUBMISSION_SEED};
use crate::error::BountyError;
use crate::state::{Bounty, BountyStatus, Submission};

#[derive(Accounts)]
pub struct SubmitWork<'info> {
    #[account(mut)]
    pub hunter: Signer<'info>,

    #[account(
        mut,
        seeds = [BOUNTY_SEED, bounty.creator.as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
        constraint = bounty.status == BountyStatus::Open @ BountyError::NotOpen
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        init_if_needed,
        payer = hunter,
        space = 8 + Submission::INIT_SPACE,
        seeds = [SUBMISSION_SEED, bounty.key().as_ref(), hunter.key().as_ref()],
        bump
    )]
    pub submission: Account<'info, Submission>,

    pub system_program: Program<'info, System>,
}

pub fn handle_submit_work(ctx: Context<SubmitWork>, submission_uri: String) -> Result<()> {
    require!(
        !submission_uri.is_empty() && submission_uri.len() <= MAX_URI_LEN,
        BountyError::UriTooLong
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < ctx.accounts.bounty.deadline,
        BountyError::NotOpen
    );

    let bounty_key = ctx.accounts.bounty.key();
    let hunter_key = ctx.accounts.hunter.key();
    let is_new = ctx.accounts.submission.hunter == Pubkey::default();

    let submission = &mut ctx.accounts.submission;
    if is_new {
        submission.bounty = bounty_key;
        submission.hunter = hunter_key;
        submission.bump = ctx.bumps.submission;
        ctx.accounts.bounty.submission_count = ctx
            .accounts
            .bounty
            .submission_count
            .checked_add(1)
            .unwrap();
    } else {
        require!(
            submission.bounty == bounty_key && submission.hunter == hunter_key,
            BountyError::InvalidSubmission
        );
    }
    submission.uri = submission_uri;

    msg!(
        "Submission from {} (count={})",
        hunter_key,
        ctx.accounts.bounty.submission_count
    );
    Ok(())
}
