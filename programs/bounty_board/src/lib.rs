pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("5rL8PzKb61y7VxB5ML1uWMTgqv2kUAA1qkUMoY6Xpm8y");

#[program]
pub mod bounty_board {
    use super::*;

    pub fn create_bounty(
        ctx: Context<CreateBounty>,
        bounty_id: u64,
        amount: u64,
        deadline: i64,
        title: String,
        description: String,
    ) -> Result<()> {
        instructions::create_bounty::handle_create_bounty(
            ctx,
            bounty_id,
            amount,
            deadline,
            title,
            description,
        )
    }

    pub fn submit_work(
        ctx: Context<SubmitWork>,
        submission_uri: String,
        uri_hash: [u8; 32],
    ) -> Result<()> {
        instructions::submit_work::handle_submit_work(ctx, submission_uri, uri_hash)
    }

    pub fn accept(ctx: Context<Accept>) -> Result<()> {
        instructions::accept::handle_accept(ctx)
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        instructions::cancel::handle_cancel(ctx)
    }

    pub fn expire_refund(ctx: Context<ExpireRefund>) -> Result<()> {
        instructions::expire_refund::handle_expire_refund(ctx)
    }

    pub fn reclaim_submission(ctx: Context<ReclaimSubmission>, uri_hash: [u8; 32]) -> Result<()> {
        instructions::reclaim_submission::handle_reclaim_submission(ctx, uri_hash)
    }

    pub fn create_token_bounty(
        ctx: Context<CreateTokenBounty>,
        bounty_id: u64,
        amount: u64,
        deadline: i64,
        title: String,
        description: String,
    ) -> Result<()> {
        instructions::create_token_bounty::handle_create_token_bounty(
            ctx,
            bounty_id,
            amount,
            deadline,
            title,
            description,
        )
    }

    pub fn accept_token(ctx: Context<AcceptToken>) -> Result<()> {
        instructions::accept_token::handle_accept_token(ctx)
    }

    pub fn cancel_token(ctx: Context<CancelToken>) -> Result<()> {
        instructions::cancel_token::handle_cancel_token(ctx)
    }

    pub fn expire_refund_token(ctx: Context<ExpireRefundToken>) -> Result<()> {
        instructions::expire_refund_token::handle_expire_refund_token(ctx)
    }
}
