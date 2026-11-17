use anchor_lang::prelude::*;

#[error_code]
pub enum BountyError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Bounty is not open for submissions")]
    NotOpen,
    #[msg("Bounty has no submissions to accept")]
    NoSubmission,
    #[msg("Only the bounty creator can perform this action")]
    UnauthorizedCreator,
    #[msg("Bounty cannot be cancelled in its current state")]
    CannotCancel,
    #[msg("Deadline has not passed yet")]
    DeadlineNotReached,
    #[msg("Bounty is not eligible for expiry refund")]
    CannotExpire,
    #[msg("Submission URI is too long or empty")]
    UriTooLong,
    #[msg("Title is empty or too long")]
    InvalidTitle,
    #[msg("Description is empty or too long")]
    InvalidDescription,
    #[msg("Submission account does not match hunter and bounty")]
    InvalidSubmission,
    #[msg("Cannot reclaim while the bounty is still open")]
    BountyStillOpen,
    #[msg("This submission URI is already claimed on this bounty")]
    UriAlreadyClaimed,
    #[msg("URI hash does not match the submission URI")]
    InvalidUriHash,
    #[msg("Winning submission cannot be reclaimed")]
    CannotReclaimWinner,
}
