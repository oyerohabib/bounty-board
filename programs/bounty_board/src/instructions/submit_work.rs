use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

use crate::constants::{BOUNTY_SEED, MAX_URI_LEN, SUBMISSION_SEED, URI_SEED};
use crate::error::BountyError;
use crate::state::{Bounty, BountyStatus, Submission, UriClaim};

#[derive(Accounts)]
#[instruction(submission_uri: String, uri_hash: [u8; 32])]
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

    /// Claim PDA for the new/current URI (unique per bounty).
    #[account(
        init_if_needed,
        payer = hunter,
        space = 8 + UriClaim::INIT_SPACE,
        seeds = [URI_SEED, bounty.key().as_ref(), uri_hash.as_ref()],
        bump
    )]
    pub uri_claim: Account<'info, UriClaim>,

    /// Previous URI claim when the hunter changes their link.
    #[account(mut, close = hunter)]
    pub old_uri_claim: Option<Account<'info, UriClaim>>,

    pub system_program: Program<'info, System>,
}

pub fn handle_submit_work(
    ctx: Context<SubmitWork>,
    submission_uri: String,
    uri_hash: [u8; 32],
) -> Result<()> {
    require!(
        !submission_uri.is_empty() && submission_uri.len() <= MAX_URI_LEN,
        BountyError::UriTooLong
    );
    require!(
        hash(submission_uri.as_bytes()).to_bytes() == uri_hash,
        BountyError::InvalidUriHash
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < ctx.accounts.bounty.deadline,
        BountyError::NotOpen
    );

    let bounty_key = ctx.accounts.bounty.key();
    let hunter_key = ctx.accounts.hunter.key();
    let is_new = ctx.accounts.submission.hunter == Pubkey::default();

    // URI must be free or already owned by this hunter.
    let claim_hunter = ctx.accounts.uri_claim.hunter;
    if claim_hunter != Pubkey::default() && claim_hunter != hunter_key {
        return err!(BountyError::UriAlreadyClaimed);
    }

    if is_new {
        require!(
            ctx.accounts.old_uri_claim.is_none(),
            BountyError::InvalidSubmission
        );

        let submission = &mut ctx.accounts.submission;
        submission.bounty = bounty_key;
        submission.hunter = hunter_key;
        submission.uri = submission_uri;
        submission.submitted_at = clock.unix_timestamp;
        submission.bump = ctx.bumps.submission;

        let uri_claim = &mut ctx.accounts.uri_claim;
        uri_claim.bounty = bounty_key;
        uri_claim.hunter = hunter_key;
        uri_claim.bump = ctx.bumps.uri_claim;

        ctx.accounts.bounty.submission_count = ctx
            .accounts
            .bounty
            .submission_count
            .checked_add(1)
            .unwrap();
    } else {
        require!(
            ctx.accounts.submission.bounty == bounty_key
                && ctx.accounts.submission.hunter == hunter_key,
            BountyError::InvalidSubmission
        );

        let old_uri = ctx.accounts.submission.uri.clone();
        if old_uri != submission_uri {
            let old_claim = ctx
                .accounts
                .old_uri_claim
                .as_ref()
                .ok_or(BountyError::InvalidSubmission)?;
            require!(
                old_claim.bounty == bounty_key && old_claim.hunter == hunter_key,
                BountyError::InvalidSubmission
            );
            let old_hash = hash(old_uri.as_bytes()).to_bytes();
            let (expected_old, _) = Pubkey::find_program_address(
                &[URI_SEED, bounty_key.as_ref(), old_hash.as_ref()],
                ctx.program_id,
            );
            require!(
                old_claim.key() == expected_old,
                BountyError::InvalidSubmission
            );

            let uri_claim = &mut ctx.accounts.uri_claim;
            if uri_claim.hunter == Pubkey::default() {
                uri_claim.bounty = bounty_key;
                uri_claim.hunter = hunter_key;
                uri_claim.bump = ctx.bumps.uri_claim;
            } else {
                require!(
                    uri_claim.hunter == hunter_key,
                    BountyError::UriAlreadyClaimed
                );
            }

            ctx.accounts.submission.uri = submission_uri;
        } else {
            require!(
                ctx.accounts.old_uri_claim.is_none(),
                BountyError::InvalidSubmission
            );
        }

        ctx.accounts.submission.submitted_at = clock.unix_timestamp;
    }

    msg!(
        "Submission from {} at {} (count={})",
        hunter_key,
        ctx.accounts.submission.submitted_at,
        ctx.accounts.bounty.submission_count
    );
    Ok(())
}
