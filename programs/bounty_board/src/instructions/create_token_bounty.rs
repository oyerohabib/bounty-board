use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{BOUNTY_SEED, MAX_DESCRIPTION_LEN, MAX_TITLE_LEN, VAULT_SEED};
use crate::error::BountyError;
use crate::state::{Bounty, BountyStatus};

#[derive(Accounts)]
#[instruction(bounty_id: u64)]
pub struct CreateTokenBounty<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub mint: Account<'info, Mint>,

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
        seeds = [VAULT_SEED, bounty.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = bounty,
        token::token_program = token_program
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_token_bounty(
    ctx: Context<CreateTokenBounty>,
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

    let decimals = ctx.accounts.mint.decimals;
    let mint = ctx.accounts.mint.key();

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
    bounty.mint = mint;
    bounty.decimals = decimals;

    token::transfer(
        CpiContext::new(
            token::ID,
            Transfer {
                from: ctx.accounts.creator_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        ),
        amount,
    )?;

    ctx.accounts.vault.reload()?;
    require!(
        ctx.accounts.vault.amount == amount,
        BountyError::VaultBalanceMismatch
    );

    msg!(
        "Token bounty {} created for {} base units of {}, deadline {}",
        bounty_id,
        amount,
        mint,
        deadline
    );
    Ok(())
}
