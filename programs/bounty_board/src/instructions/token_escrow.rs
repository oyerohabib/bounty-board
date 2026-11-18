use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Transfer};

use crate::constants::BOUNTY_SEED;
use crate::error::BountyError;
use crate::state::Bounty;

/// Move the escrowed balance from the bounty-owned vault, then close it.
/// Rent lamports go to `rent_to` (the creator, who funded the vault).
pub fn transfer_and_close<'info>(
    vault: AccountInfo<'info>,
    destination: AccountInfo<'info>,
    bounty_account: AccountInfo<'info>,
    rent_to: AccountInfo<'info>,
    bounty: &Bounty,
    vault_amount: u64,
) -> Result<()> {
    require!(
        vault_amount == bounty.amount,
        BountyError::VaultBalanceMismatch
    );

    let bounty_id = bounty.bounty_id.to_le_bytes();
    let bump = [bounty.bump];
    let seeds: &[&[u8]] = &[
        BOUNTY_SEED,
        bounty.creator.as_ref(),
        bounty_id.as_ref(),
        &bump,
    ];
    let signer = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            token::ID,
            Transfer {
                from: vault.clone(),
                to: destination,
                authority: bounty_account.clone(),
            },
            signer,
        ),
        bounty.amount,
    )?;

    token::close_account(CpiContext::new_with_signer(
        token::ID,
        CloseAccount {
            account: vault,
            destination: rent_to,
            authority: bounty_account,
        },
        signer,
    ))?;

    Ok(())
}
