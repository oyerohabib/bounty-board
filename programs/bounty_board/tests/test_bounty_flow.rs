use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    bounty_board::state::{Bounty, BountyStatus},
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

fn program_bytes() -> &'static [u8] {
    include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/bounty_board.so"
    ))
}

fn send_ix(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    svm.send_transaction(tx).expect("transaction failed");
}

fn bounty_pda(program_id: &Pubkey, creator: &Pubkey, bounty_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            bounty_board::constants::BOUNTY_SEED,
            creator.as_ref(),
            &bounty_id.to_le_bytes(),
        ],
        program_id,
    )
}

fn vault_pda(program_id: &Pubkey, bounty: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[bounty_board::constants::VAULT_SEED, bounty.as_ref()],
        program_id,
    )
}

fn setup() -> (LiteSVM, Keypair, Pubkey) {
    let program_id = bounty_board::id();
    let payer = Keypair::new();
    let mut svm = LiteSVM::new();
    svm.add_program(program_id, program_bytes()).unwrap();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    (svm, payer, program_id)
}

fn create_bounty_ix(
    program_id: Pubkey,
    creator: Pubkey,
    bounty: Pubkey,
    vault: Pubkey,
    bounty_id: u64,
    amount: u64,
    deadline: i64,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id,
        &bounty_board::instruction::CreateBounty {
            bounty_id,
            amount,
            deadline,
        }
        .data(),
        bounty_board::accounts::CreateBounty {
            creator,
            bounty,
            vault,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

#[test]
fn test_create_submit_accept() {
    let (mut svm, creator, program_id) = setup();
    let hunter = Keypair::new();
    svm.airdrop(&hunter.pubkey(), 1_000_000_000).unwrap();

    let bounty_id = 1u64;
    let amount = 50_000_000u64;
    let deadline = 2_000_000_000i64; // far future

    let (bounty, _) = bounty_pda(&program_id, &creator.pubkey(), bounty_id);
    let (vault, _) = vault_pda(&program_id, &bounty);

    let hunter_before = svm.get_account(&hunter.pubkey()).unwrap().lamports;

    send_ix(
        &mut svm,
        &creator,
        create_bounty_ix(
            program_id,
            creator.pubkey(),
            bounty,
            vault,
            bounty_id,
            amount,
            deadline,
        ),
    );

    let bounty_account = svm.get_account(&bounty).unwrap();
    let mut data: &[u8] = &bounty_account.data;
    let state = Bounty::try_deserialize(&mut data).unwrap();
    assert_eq!(state.amount, amount);
    assert_eq!(state.status, BountyStatus::Open);
    assert_eq!(state.creator, creator.pubkey());

    let vault_account = svm.get_account(&vault).unwrap();
    assert!(vault_account.lamports > amount);

    send_ix(
        &mut svm,
        &hunter,
        Instruction::new_with_bytes(
            program_id,
            &bounty_board::instruction::SubmitWork {
                submission_uri: "https://github.com/example/pr/1".to_string(),
            }
            .data(),
            bounty_board::accounts::SubmitWork {
                hunter: hunter.pubkey(),
                bounty,
            }
            .to_account_metas(None),
        ),
    );

    let bounty_account = svm.get_account(&bounty).unwrap();
    let mut data: &[u8] = &bounty_account.data;
    let state = Bounty::try_deserialize(&mut data).unwrap();
    assert_eq!(state.status, BountyStatus::Submitted);
    assert_eq!(state.hunter, hunter.pubkey());
    assert_eq!(state.submission_uri, "https://github.com/example/pr/1");

    send_ix(
        &mut svm,
        &creator,
        Instruction::new_with_bytes(
            program_id,
            &bounty_board::instruction::Accept {}.data(),
            bounty_board::accounts::Accept {
                creator: creator.pubkey(),
                hunter: hunter.pubkey(),
                bounty,
                vault,
            }
            .to_account_metas(None),
        ),
    );

    assert!(svm.get_account(&bounty).is_none());
    assert!(svm.get_account(&vault).is_none());

    let hunter_after = svm.get_account(&hunter.pubkey()).unwrap().lamports;
    assert!(hunter_after > hunter_before + amount);
}

#[test]
fn test_cancel_refunds_creator() {
    let (mut svm, creator, program_id) = setup();
    let bounty_id = 2u64;
    let amount = 25_000_000u64;
    let deadline = 2_000_000_000i64;

    let (bounty, _) = bounty_pda(&program_id, &creator.pubkey(), bounty_id);
    let (vault, _) = vault_pda(&program_id, &bounty);

    let creator_before = svm.get_account(&creator.pubkey()).unwrap().lamports;

    send_ix(
        &mut svm,
        &creator,
        create_bounty_ix(
            program_id,
            creator.pubkey(),
            bounty,
            vault,
            bounty_id,
            amount,
            deadline,
        ),
    );

    let after_create = svm.get_account(&creator.pubkey()).unwrap().lamports;
    assert!(after_create < creator_before);

    send_ix(
        &mut svm,
        &creator,
        Instruction::new_with_bytes(
            program_id,
            &bounty_board::instruction::Cancel {}.data(),
            bounty_board::accounts::Cancel {
                creator: creator.pubkey(),
                bounty,
                vault,
            }
            .to_account_metas(None),
        ),
    );

    assert!(svm.get_account(&bounty).is_none());
    assert!(svm.get_account(&vault).is_none());

    let creator_after = svm.get_account(&creator.pubkey()).unwrap().lamports;
    // Refunded escrow + rents (minus tx fees)
    assert!(creator_after > after_create);
    assert!(creator_after > creator_before - 50_000); // small fee tolerance
}

#[test]
fn test_expire_refund_after_deadline() {
    let (mut svm, creator, program_id) = setup();
    let caller = Keypair::new();
    svm.airdrop(&caller.pubkey(), 1_000_000_000).unwrap();

    let bounty_id = 3u64;
    let amount = 10_000_000u64;
    // deadline in the past relative to LiteSVM clock defaults — warp if needed
    let deadline = 1i64;

    let (bounty, _) = bounty_pda(&program_id, &creator.pubkey(), bounty_id);
    let (vault, _) = vault_pda(&program_id, &bounty);

    // Create with a future deadline first, then warp clock past it for expire.
    let future = 1_700_000_000i64;
    send_ix(
        &mut svm,
        &creator,
        create_bounty_ix(
            program_id,
            creator.pubkey(),
            bounty,
            vault,
            bounty_id,
            amount,
            future,
        ),
    );

    // Warp past deadline
    svm.warp_to_slot(10);
    // LiteSVM may not advance unix timestamp with warp_to_slot alone.
    // Re-create isn't possible; instead set clock via expire with already-past deadline
    // by creating a second bounty that uses past deadline — create requires future deadline.
    // So we test expire by manually needing past deadline: use `expire` after setting sysvar.
    let _ = deadline;

    // Use expire path: set clock forward if API exists
    #[allow(unused_must_use)]
    {
        // Many LiteSVM versions expose set_sysvar for Clock
        use anchor_lang::prelude::Clock;
        let clock = Clock {
            slot: 100,
            epoch_start_timestamp: future + 100,
            epoch: 1,
            leader_schedule_epoch: 1,
            unix_timestamp: future + 100,
        };
        let _ = svm.set_sysvar(&clock);
    }

    send_ix(
        &mut svm,
        &caller,
        Instruction::new_with_bytes(
            program_id,
            &bounty_board::instruction::ExpireRefund {}.data(),
            bounty_board::accounts::ExpireRefund {
                caller: caller.pubkey(),
                creator: creator.pubkey(),
                bounty,
                vault,
            }
            .to_account_metas(None),
        ),
    );

    assert!(svm.get_account(&bounty).is_none());
    assert!(svm.get_account(&vault).is_none());
}
