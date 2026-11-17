use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    bounty_board::state::{Bounty, BountyStatus, Submission},
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

fn submission_pda(program_id: &Pubkey, bounty: &Pubkey, hunter: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            bounty_board::constants::SUBMISSION_SEED,
            bounty.as_ref(),
            hunter.as_ref(),
        ],
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
            title: "Fix login bug".to_string(),
            description: "PR that fixes auth redirect".to_string(),
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

fn submit_work_ix(
    program_id: Pubkey,
    hunter: Pubkey,
    bounty: Pubkey,
    submission: Pubkey,
    uri: String,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id,
        &bounty_board::instruction::SubmitWork {
            submission_uri: uri,
        }
        .data(),
        bounty_board::accounts::SubmitWork {
            hunter,
            bounty,
            submission,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

#[test]
fn test_multi_submit_accept_reclaim() {
    let (mut svm, creator, program_id) = setup();
    let hunter_a = Keypair::new();
    let hunter_b = Keypair::new();
    svm.airdrop(&hunter_a.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&hunter_b.pubkey(), 1_000_000_000).unwrap();

    let bounty_id = 1u64;
    let amount = 50_000_000u64;
    let deadline = 2_000_000_000i64;

    let (bounty, _) = bounty_pda(&program_id, &creator.pubkey(), bounty_id);
    let (vault, _) = vault_pda(&program_id, &bounty);
    let (sub_a, _) = submission_pda(&program_id, &bounty, &hunter_a.pubkey());
    let (sub_b, _) = submission_pda(&program_id, &bounty, &hunter_b.pubkey());

    let hunter_b_before = svm.get_account(&hunter_b.pubkey()).unwrap().lamports;

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

    {
        let mut data: &[u8] = &svm.get_account(&bounty).unwrap().data;
        let state = Bounty::try_deserialize(&mut data).unwrap();
        assert_eq!(state.title, "Fix login bug");
        assert_eq!(state.description, "PR that fixes auth redirect");
    }

    send_ix(
        &mut svm,
        &hunter_a,
        submit_work_ix(
            program_id,
            hunter_a.pubkey(),
            bounty,
            sub_a,
            "https://github.com/example/pr/1".to_string(),
        ),
    );
    send_ix(
        &mut svm,
        &hunter_b,
        submit_work_ix(
            program_id,
            hunter_b.pubkey(),
            bounty,
            sub_b,
            "https://github.com/example/pr/2".to_string(),
        ),
    );

    let bounty_account = svm.get_account(&bounty).unwrap();
    let mut data: &[u8] = &bounty_account.data;
    let state = Bounty::try_deserialize(&mut data).unwrap();
    assert_eq!(state.status, BountyStatus::Open);
    assert_eq!(state.submission_count, 2);

    let mut data_a: &[u8] = &svm.get_account(&sub_a).unwrap().data;
    let sub_state_a = Submission::try_deserialize(&mut data_a).unwrap();
    assert_eq!(sub_state_a.uri, "https://github.com/example/pr/1");
    assert_eq!(sub_state_a.hunter, hunter_a.pubkey());

    let mut data_b: &[u8] = &svm.get_account(&sub_b).unwrap().data;
    let sub_state_b = Submission::try_deserialize(&mut data_b).unwrap();
    assert_eq!(sub_state_b.uri, "https://github.com/example/pr/2");

    // Same hunter updates URI without bumping count
    send_ix(
        &mut svm,
        &hunter_a,
        submit_work_ix(
            program_id,
            hunter_a.pubkey(),
            bounty,
            sub_a,
            "https://github.com/example/pr/1b".to_string(),
        ),
    );
    let mut data: &[u8] = &svm.get_account(&bounty).unwrap().data;
    let state = Bounty::try_deserialize(&mut data).unwrap();
    assert_eq!(state.submission_count, 2);
    let mut data_a: &[u8] = &svm.get_account(&sub_a).unwrap().data;
    assert_eq!(
        Submission::try_deserialize(&mut data_a).unwrap().uri,
        "https://github.com/example/pr/1b"
    );

    // Accept hunter B
    send_ix(
        &mut svm,
        &creator,
        Instruction::new_with_bytes(
            program_id,
            &bounty_board::instruction::Accept {}.data(),
            bounty_board::accounts::Accept {
                creator: creator.pubkey(),
                hunter: hunter_b.pubkey(),
                bounty,
                submission: sub_b,
                vault,
            }
            .to_account_metas(None),
        ),
    );

    assert!(svm.get_account(&bounty).is_none());
    assert!(svm.get_account(&vault).is_none());
    assert!(svm.get_account(&sub_b).is_none());
    assert!(svm.get_account(&sub_a).is_some());

    let hunter_b_after = svm.get_account(&hunter_b.pubkey()).unwrap().lamports;
    assert!(hunter_b_after > hunter_b_before + amount);

    // Hunter A reclaims leftover submission rent
    let hunter_a_before = svm.get_account(&hunter_a.pubkey()).unwrap().lamports;
    send_ix(
        &mut svm,
        &hunter_a,
        Instruction::new_with_bytes(
            program_id,
            &bounty_board::instruction::ReclaimSubmission {}.data(),
            bounty_board::accounts::ReclaimSubmission {
                hunter: hunter_a.pubkey(),
                bounty,
                submission: sub_a,
            }
            .to_account_metas(None),
        ),
    );
    assert!(svm.get_account(&sub_a).is_none());
    let hunter_a_after = svm.get_account(&hunter_a.pubkey()).unwrap().lamports;
    assert!(hunter_a_after > hunter_a_before);
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
    assert!(creator_after > after_create);
    assert!(creator_after > creator_before - 50_000);
}

#[test]
fn test_expire_refund_after_deadline() {
    let (mut svm, creator, program_id) = setup();
    let caller = Keypair::new();
    svm.airdrop(&caller.pubkey(), 1_000_000_000).unwrap();

    let bounty_id = 3u64;
    let amount = 10_000_000u64;

    let (bounty, _) = bounty_pda(&program_id, &creator.pubkey(), bounty_id);
    let (vault, _) = vault_pda(&program_id, &bounty);

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

    svm.warp_to_slot(10);
    {
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
