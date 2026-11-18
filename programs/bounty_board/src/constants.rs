use anchor_lang::prelude::*;

#[constant]
pub const BOUNTY_SEED: &[u8] = b"bounty";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const SUBMISSION_SEED: &[u8] = b"submission";

#[constant]
pub const URI_SEED: &[u8] = b"uri";

pub const MAX_URI_LEN: usize = 200;
pub const MAX_TITLE_LEN: usize = 64;
pub const MAX_DESCRIPTION_LEN: usize = 280;

/// Native SOL amounts are lamports.
pub const NATIVE_SOL_DECIMALS: u8 = 9;
