use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

use crate::constants::{BOUNTY_SEED, SUBMISSION_SEED, URI_SEED};
use crate::error::BountyError;
use crate::state::{Bounty, BountyStatus, Submission, UriClaim};

#[derive(Accounts)]
#[instruction(uri_hash: [u8; 32])]
pub struct ReclaimSubmission<'info> {
    #[account(mut)]
    pub hunter: Signer<'info>,

    #[account(
        seeds = [BOUNTY_SEED, bounty.creator.as_ref(), &bounty.bounty_id.to_le_bytes()],
        bump = bounty.bump,
        constraint = bounty.status != BountyStatus::Open @ BountyError::BountyStillOpen,
        constraint = bounty.winner != hunter.key() @ BountyError::CannotReclaimWinner
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        mut,
        seeds = [SUBMISSION_SEED, bounty.key().as_ref(), hunter.key().as_ref()],
        bump = submission.bump,
        constraint = submission.hunter == hunter.key() @ BountyError::InvalidSubmission,
        constraint = submission.bounty == bounty.key() @ BountyError::InvalidSubmission,
        close = hunter
    )]
    pub submission: Account<'info, Submission>,

    #[account(
        mut,
        seeds = [URI_SEED, bounty.key().as_ref(), uri_hash.as_ref()],
        bump = uri_claim.bump,
        constraint = uri_claim.hunter == hunter.key() @ BountyError::InvalidSubmission,
        constraint = uri_claim.bounty == bounty.key() @ BountyError::InvalidSubmission,
        close = hunter
    )]
    pub uri_claim: Account<'info, UriClaim>,
}

pub fn handle_reclaim_submission(ctx: Context<ReclaimSubmission>, uri_hash: [u8; 32]) -> Result<()> {
    require!(
        hash(ctx.accounts.submission.uri.as_bytes()).to_bytes() == uri_hash,
        BountyError::InvalidUriHash
    );
    msg!(
        "Submission reclaimed by {} (URI claim released)",
        ctx.accounts.hunter.key()
    );
    Ok(())
}
