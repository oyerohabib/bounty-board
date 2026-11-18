use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::{
    BOUNTY_SEED, MAX_DESCRIPTION_LEN, MAX_TITLE_LEN, NATIVE_SOL_DECIMALS, VAULT_SEED,
};
use crate::error::BountyError;
use crate::state::{Bounty, BountyStatus, Vault};

#[derive(Accounts)]
#[instruction(bounty_id: u64)]
pub struct CreateBounty<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + Bounty::INIT_SPACE,
        seeds = [BOUNTY_SEED, creator.key().as_ref(), &bounty_id.to_le_bytes()],
        bump
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        init,
        payer = creator,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, bounty.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_bounty(
    ctx: Context<CreateBounty>,
    bounty_id: u64,
    amount: u64,
    deadline: i64,
    title: String,
    description: String,
) -> Result<()> {
    require!(amount > 0, BountyError::InvalidAmount);
    require!(
        !title.is_empty() && title.len() <= MAX_TITLE_LEN,
        BountyError::InvalidTitle
    );
    require!(
        !description.is_empty() && description.len() <= MAX_DESCRIPTION_LEN,
        BountyError::InvalidDescription
    );

    let clock = Clock::get()?;
    require!(
        deadline > clock.unix_timestamp,
        BountyError::InvalidDeadline
    );

    let bounty = &mut ctx.accounts.bounty;
    bounty.creator = ctx.accounts.creator.key();
    bounty.bounty_id = bounty_id;
    bounty.amount = amount;
    bounty.deadline = deadline;
    bounty.status = BountyStatus::Open;
    bounty.submission_count = 0;
    bounty.title = title;
    bounty.description = description;
    bounty.winner = Pubkey::default();
    bounty.bump = ctx.bumps.bounty;
    bounty.vault_bump = ctx.bumps.vault;
    bounty.mint = Pubkey::default();
    bounty.decimals = NATIVE_SOL_DECIMALS;

    system_program::transfer(
        CpiContext::new(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    msg!(
        "Bounty {} created for {} lamports, deadline {}",
        bounty_id,
        amount,
        deadline
    );
    Ok(())
}
