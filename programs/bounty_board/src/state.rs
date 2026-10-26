use anchor_lang::prelude::*;

use crate::constants::MAX_URI_LEN;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum BountyStatus {
    Open,
    Submitted,
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
    pub hunter: Pubkey,
    #[max_len(MAX_URI_LEN)]
    pub submission_uri: String,
    pub bump: u8,
    pub vault_bump: u8,
}

/// Empty program-owned account that holds escrowed SOL.
#[account]
#[derive(InitSpace)]
pub struct Vault {}
