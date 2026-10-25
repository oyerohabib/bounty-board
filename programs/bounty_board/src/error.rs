use anchor_lang::prelude::*;

#[error_code]
pub enum BountyError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Bounty is not open for submissions")]
    NotOpen,
    #[msg("Bounty has no active submission")]
    NoSubmission,
    #[msg("Only the bounty creator can perform this action")]
    UnauthorizedCreator,
    #[msg("Bounty cannot be cancelled in its current state")]
    CannotCancel,
    #[msg("Deadline has not passed yet")]
    DeadlineNotReached,
    #[msg("Bounty is not eligible for expiry refund")]
    CannotExpire,
    #[msg("Submission URI is too long")]
    UriTooLong,
}
