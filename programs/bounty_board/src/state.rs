use anchor_lang::prelude::*;

use crate::constants::{MAX_DESCRIPTION_LEN, MAX_TITLE_LEN, MAX_URI_LEN};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum BountyStatus {
    Open,
    Completed,
    Cancelled,
    Expired,
}

#[account]
#[derive(InitSpace)]
pub struct Bounty {
    pub creator: Pubkey,
    pub bounty_id: u64,
    pub amount: u64,
    pub deadline: i64,
    pub status: BountyStatus,
    pub submission_count: u32,
    #[max_len(MAX_TITLE_LEN)]
    pub title: String,
    #[max_len(MAX_DESCRIPTION_LEN)]
    pub description: String,
    /// Set on accept; default pubkey until then.
    pub winner: Pubkey,
    pub bump: u8,
    pub vault_bump: u8,
}

/// One submission per hunter for a given bounty.
#[account]
#[derive(InitSpace)]
pub struct Submission {
    pub bounty: Pubkey,
    pub hunter: Pubkey,
    #[max_len(MAX_URI_LEN)]
    pub uri: String,
    pub submitted_at: i64,
    pub bump: u8,
}

/// Enforces unique submission URIs per bounty.
#[account]
#[derive(InitSpace)]
pub struct UriClaim {
    pub bounty: Pubkey,
    pub hunter: Pubkey,
    pub bump: u8,
}

/// Empty program-owned account that holds escrowed SOL.
#[account]
#[derive(InitSpace)]
pub struct Vault {}
