use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    bounty_board::state::{Bounty, BountyStatus, Submission},
    litesvm::LiteSVM,
    solana_account::Account as SolAccount,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_program_option::COption,
    solana_program_pack::Pack,
    solana_sha256_hasher::hash,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    spl_associated_token_account_interface::{
        address::get_associated_token_address, program::ID as ASSOCIATED_TOKEN_PROGRAM_ID,
    },
    spl_token_interface::{
        state::{Account as SplAccount, AccountState, Mint},
        ID as TOKEN_PROGRAM_ID,
    },
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
    if let Err(err) = svm.send_transaction(tx) {
        panic!("transaction failed: {err:#?}");
    }
}

fn send_ix_err(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[payer]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
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

fn uri_hash_bytes(uri: &str) -> [u8; 32] {
    hash(uri.as_bytes()).to_bytes()
}

fn uri_claim_pda(program_id: &Pubkey, bounty: &Pubkey, uri: &str) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            bounty_board::constants::URI_SEED,
            bounty.as_ref(),
            &uri_hash_bytes(uri),
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
    {
        use anchor_lang::prelude::Clock;
        let clock = Clock {
            slot: 1,
            epoch_start_timestamp: 1_700_000_000,
            epoch: 0,
            leader_schedule_epoch: 0,
            unix_timestamp: 1_700_000_000,
        };
        let _ = svm.set_sysvar(&clock);
    }
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
    uri_claim: Pubkey,
    old_uri_claim: Option<Pubkey>,
    uri: String,
) -> Instruction {
    let uri_hash = uri_hash_bytes(&uri);
    Instruction::new_with_bytes(
        program_id,
        &bounty_board::instruction::SubmitWork {
            submission_uri: uri,
            uri_hash,
        }
        .data(),
        bounty_board::accounts::SubmitWork {
            hunter,
            bounty,
            submission,
            uri_claim,
            old_uri_claim,
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

    let uri_a = "https://github.com/example/pr/1";
    let uri_a2 = "https://github.com/example/pr/1b";
    let uri_b = "https://github.com/example/pr/2";
    let (claim_a, _) = uri_claim_pda(&program_id, &bounty, uri_a);
    let (claim_a2, _) = uri_claim_pda(&program_id, &bounty, uri_a2);
    let (claim_b, _) = uri_claim_pda(&program_id, &bounty, uri_b);

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
        assert_eq!(state.winner, Pubkey::default());
        assert_eq!(state.mint, Pubkey::default());
        assert_eq!(state.decimals, 9);
    }

    send_ix(
        &mut svm,
        &hunter_a,
        submit_work_ix(
            program_id,
            hunter_a.pubkey(),
            bounty,
            sub_a,
            claim_a,
            None,
            uri_a.to_string(),
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
            claim_b,
            None,
            uri_b.to_string(),
        ),
    );

    let bounty_account = svm.get_account(&bounty).unwrap();
    let mut data: &[u8] = &bounty_account.data;
    let state = Bounty::try_deserialize(&mut data).unwrap();
    assert_eq!(state.status, BountyStatus::Open);
    assert_eq!(state.submission_count, 2);

    let mut data_a: &[u8] = &svm.get_account(&sub_a).unwrap().data;
    let sub_state_a = Submission::try_deserialize(&mut data_a).unwrap();
    assert_eq!(sub_state_a.uri, uri_a);
    assert_eq!(sub_state_a.hunter, hunter_a.pubkey());
    assert!(sub_state_a.submitted_at > 0);

    // Duplicate URI rejected
    send_ix_err(
        &mut svm,
        &hunter_b,
        submit_work_ix(
            program_id,
            hunter_b.pubkey(),
            bounty,
            sub_b,
            claim_a,
            Some(claim_b),
            uri_a.to_string(),
        ),
    );

    // Same hunter updates URI without bumping count
    send_ix(
        &mut svm,
        &hunter_a,
        submit_work_ix(
            program_id,
            hunter_a.pubkey(),
            bounty,
            sub_a,
            claim_a2,
            Some(claim_a),
            uri_a2.to_string(),
        ),
    );
    let mut data: &[u8] = &svm.get_account(&bounty).unwrap().data;
    let state = Bounty::try_deserialize(&mut data).unwrap();
    assert_eq!(state.submission_count, 2);
    let mut data_a: &[u8] = &svm.get_account(&sub_a).unwrap().data;
    assert_eq!(
        Submission::try_deserialize(&mut data_a).unwrap().uri,
        uri_a2
    );
    assert!(svm.get_account(&claim_a).is_none());
    assert!(svm.get_account(&claim_a2).is_some());

    // Accept hunter B — bounty + winning submission kept for history
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

    assert!(svm.get_account(&bounty).is_some());
    assert!(svm.get_account(&vault).is_none());
    assert!(svm.get_account(&sub_b).is_some());
    assert!(svm.get_account(&sub_a).is_some());

    {
        let mut data: &[u8] = &svm.get_account(&bounty).unwrap().data;
        let state = Bounty::try_deserialize(&mut data).unwrap();
        assert_eq!(state.status, BountyStatus::Completed);
        assert_eq!(state.winner, hunter_b.pubkey());
    }

    let hunter_b_after = svm.get_account(&hunter_b.pubkey()).unwrap().lamports;
    // Winner receives escrow (+ vault rent); rent paid for submission/uri_claim remains locked.
    assert!(hunter_b_after > hunter_b_before + amount - 5_000_000);

    // Winner cannot reclaim
    send_ix_err(
        &mut svm,
        &hunter_b,
        Instruction::new_with_bytes(
            program_id,
            &bounty_board::instruction::ReclaimSubmission {
                uri_hash: uri_hash_bytes(uri_b),
            }
            .data(),
            bounty_board::accounts::ReclaimSubmission {
                hunter: hunter_b.pubkey(),
                bounty,
                submission: sub_b,
                uri_claim: claim_b,
            }
            .to_account_metas(None),
        ),
    );

    // Hunter A reclaims leftover submission + uri claim rent
    let hunter_a_before = svm.get_account(&hunter_a.pubkey()).unwrap().lamports;
    send_ix(
        &mut svm,
        &hunter_a,
        Instruction::new_with_bytes(
            program_id,
            &bounty_board::instruction::ReclaimSubmission {
                uri_hash: uri_hash_bytes(uri_a2),
            }
            .data(),
            bounty_board::accounts::ReclaimSubmission {
                hunter: hunter_a.pubkey(),
                bounty,
                submission: sub_a,
                uri_claim: claim_a2,
            }
            .to_account_metas(None),
        ),
    );
    assert!(svm.get_account(&sub_a).is_none());
    assert!(svm.get_account(&claim_a2).is_none());
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
    {
        let mut data: &[u8] = &svm.get_account(&bounty).unwrap().data;
        let state = Bounty::try_deserialize(&mut data).unwrap();
        assert_eq!(state.mint, Pubkey::default());
        assert_eq!(state.decimals, 9);
    }

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

    // Bounty kept for history; vault closed (escrow refunded)
    assert!(svm.get_account(&bounty).is_some());
    assert!(svm.get_account(&vault).is_none());
    {
        let mut data: &[u8] = &svm.get_account(&bounty).unwrap().data;
        let state = Bounty::try_deserialize(&mut data).unwrap();
        assert_eq!(state.status, BountyStatus::Cancelled);
    }

    let creator_after = svm.get_account(&creator.pubkey()).unwrap().lamports;
    assert!(creator_after > after_create);
    // Escrow returned via vault close; bounty rent remains locked for history
    assert!(creator_after + 5_000_000 > creator_before);
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

    let deadline = 1_700_000_100i64;
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
        assert_eq!(state.mint, Pubkey::default());
        assert_eq!(state.decimals, 9);
    }

    svm.warp_to_slot(10);
    {
        use anchor_lang::prelude::Clock;
        let clock = Clock {
            slot: 100,
            epoch_start_timestamp: deadline + 100,
            epoch: 1,
            leader_schedule_epoch: 1,
            unix_timestamp: deadline + 100,
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

    assert!(svm.get_account(&bounty).is_some());
    assert!(svm.get_account(&vault).is_none());
    {
        let mut data: &[u8] = &svm.get_account(&bounty).unwrap().data;
        let state = Bounty::try_deserialize(&mut data).unwrap();
        assert_eq!(state.status, BountyStatus::Expired);
    }
}

const TOKEN_FUNDED: u64 = 5_000_000;
const TOKEN_ESCROW: u64 = 1_500_000;

fn pack_into<P: Pack>(value: P) -> Vec<u8> {
    let mut data = vec![0u8; P::LEN];
    P::pack(value, &mut data).unwrap();
    data
}

fn set_token_account(svm: &mut LiteSVM, address: Pubkey, data: Vec<u8>) {
    svm.set_account(
        address,
        SolAccount {
            lamports: 1_000_000_000,
            data,
            owner: TOKEN_PROGRAM_ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

fn fund_creator_ata(svm: &mut LiteSVM, mint: &Keypair, creator: &Pubkey) -> Pubkey {
    let mint_data = pack_into(Mint {
        mint_authority: COption::Some(*creator),
        supply: TOKEN_FUNDED,
        decimals: 6,
        is_initialized: true,
        freeze_authority: COption::None,
    });
    set_token_account(svm, mint.pubkey(), mint_data);

    let ata = get_associated_token_address(creator, &mint.pubkey());
    let ata_data = pack_into(SplAccount {
        mint: mint.pubkey(),
        owner: *creator,
        amount: TOKEN_FUNDED,
        delegate: COption::None,
        state: AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    });
    set_token_account(svm, ata, ata_data);
    ata
}

fn token_amount(svm: &LiteSVM, address: &Pubkey) -> u64 {
    let account = svm.get_account(address).expect("token account");
    SplAccount::unpack(&account.data).unwrap().amount
}

fn create_token_bounty_ix(
    program_id: Pubkey,
    creator: Pubkey,
    mint: Pubkey,
    bounty: Pubkey,
    vault: Pubkey,
    creator_token_account: Pubkey,
    bounty_id: u64,
    amount: u64,
    deadline: i64,
) -> Instruction {
    Instruction::new_with_bytes(
        program_id,
        &bounty_board::instruction::CreateTokenBounty {
            bounty_id,
            amount,
            deadline,
            title: "Fix login bug".to_string(),
            description: "PR that fixes auth redirect".to_string(),
        }
        .data(),
        bounty_board::accounts::CreateTokenBounty {
            creator,
            mint,
            bounty,
            vault,
            creator_token_account,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn open_token_bounty(
    svm: &mut LiteSVM,
    creator: &Keypair,
    program_id: Pubkey,
    bounty_id: u64,
    deadline: i64,
) -> (Pubkey, Pubkey, Pubkey, Pubkey) {
    let mint = Keypair::new();
    let creator_ata = fund_creator_ata(svm, &mint, &creator.pubkey());
    let (bounty, _) = bounty_pda(&program_id, &creator.pubkey(), bounty_id);
    let (vault, _) = vault_pda(&program_id, &bounty);
    send_ix(
        svm,
        creator,
        create_token_bounty_ix(
            program_id,
            creator.pubkey(),
            mint.pubkey(),
            bounty,
            vault,
            creator_ata,
            bounty_id,
            TOKEN_ESCROW,
            deadline,
        ),
    );
    (mint.pubkey(), bounty, vault, creator_ata)
}

#[test]
fn test_token_bounty_accept_pays_hunter() {
    let (mut svm, creator, program_id) = setup();
    let hunter = Keypair::new();
    svm.airdrop(&hunter.pubkey(), 1_000_000_000).unwrap();

    let bounty_id = 11u64;
    let deadline = 2_000_000_000i64;
    let (mint, bounty, vault, creator_ata) =
        open_token_bounty(&mut svm, &creator, program_id, bounty_id, deadline);

    assert_eq!(
        token_amount(&svm, &creator_ata),
        TOKEN_FUNDED - TOKEN_ESCROW
    );
    assert_eq!(token_amount(&svm, &vault), TOKEN_ESCROW);
    {
        let mut data: &[u8] = &svm.get_account(&bounty).unwrap().data;
        let state = Bounty::try_deserialize(&mut data).unwrap();
        assert_eq!(state.mint, mint);
        assert_eq!(state.decimals, 6);
        assert_eq!(state.amount, TOKEN_ESCROW);
    }

    let uri = "https://github.com/example/pr/token";
    let (submission, _) = submission_pda(&program_id, &bounty, &hunter.pubkey());
    let (claim, _) = uri_claim_pda(&program_id, &bounty, uri);
    send_ix(
        &mut svm,
        &hunter,
        submit_work_ix(
            program_id,
            hunter.pubkey(),
            bounty,
            submission,
            claim,
            None,
            uri.to_string(),
        ),
    );

    // Native SOL settle cannot close a token vault.
    send_ix_err(
        &mut svm,
        &creator,
        Instruction::new_with_bytes(
            program_id,
            &bounty_board::instruction::Accept {}.data(),
            bounty_board::accounts::Accept {
                creator: creator.pubkey(),
                hunter: hunter.pubkey(),
                bounty,
                submission,
                vault,
            }
            .to_account_metas(None),
        ),
    );

    let hunter_ata = get_associated_token_address(&hunter.pubkey(), &mint);
    send_ix(
        &mut svm,
        &creator,
        Instruction::new_with_bytes(
            program_id,
            &bounty_board::instruction::AcceptToken {}.data(),
            bounty_board::accounts::AcceptToken {
                creator: creator.pubkey(),
                hunter: hunter.pubkey(),
                mint,
                bounty,
                submission,
                vault,
                hunter_token_account: hunter_ata,
                token_program: TOKEN_PROGRAM_ID,
                associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
    );

    assert!(svm.get_account(&vault).is_none());
    assert_eq!(token_amount(&svm, &hunter_ata), TOKEN_ESCROW);
    assert_eq!(
        token_amount(&svm, &creator_ata),
        TOKEN_FUNDED - TOKEN_ESCROW
    );
    {
        let mut data: &[u8] = &svm.get_account(&bounty).unwrap().data;
        let state = Bounty::try_deserialize(&mut data).unwrap();
        assert_eq!(state.status, BountyStatus::Completed);
        assert_eq!(state.winner, hunter.pubkey());
    }
}

#[test]
fn test_token_bounty_cancel_refunds_creator() {
    let (mut svm, creator, program_id) = setup();
    let bounty_id = 12u64;
    let deadline = 2_000_000_000i64;
    let (mint, bounty, vault, creator_ata) =
        open_token_bounty(&mut svm, &creator, program_id, bounty_id, deadline);

    send_ix_err(
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

    send_ix(
        &mut svm,
        &creator,
        Instruction::new_with_bytes(
            program_id,
            &bounty_board::instruction::CancelToken {}.data(),
            bounty_board::accounts::CancelToken {
                creator: creator.pubkey(),
                mint,
                bounty,
                vault,
                creator_token_account: creator_ata,
                token_program: TOKEN_PROGRAM_ID,
                associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
            }
            .to_account_metas(None),
        ),
    );

    assert!(svm.get_account(&vault).is_none());
    assert_eq!(token_amount(&svm, &creator_ata), TOKEN_FUNDED);
    {
        let mut data: &[u8] = &svm.get_account(&bounty).unwrap().data;
        let state = Bounty::try_deserialize(&mut data).unwrap();
        assert_eq!(state.status, BountyStatus::Cancelled);
    }
}

#[test]
fn test_token_bounty_expire_refunds_creator() {
    let (mut svm, creator, program_id) = setup();
    let caller = Keypair::new();
    svm.airdrop(&caller.pubkey(), 1_000_000_000).unwrap();

    let bounty_id = 13u64;
    let deadline = 1_700_000_100i64;
    let (mint, bounty, vault, creator_ata) =
        open_token_bounty(&mut svm, &creator, program_id, bounty_id, deadline);

    svm.warp_to_slot(10);
    {
        use anchor_lang::prelude::Clock;
        let clock = Clock {
            slot: 100,
            epoch_start_timestamp: deadline + 100,
            epoch: 1,
            leader_schedule_epoch: 1,
            unix_timestamp: deadline + 100,
        };
        let _ = svm.set_sysvar(&clock);
    }

    send_ix_err(
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

    send_ix(
        &mut svm,
        &caller,
        Instruction::new_with_bytes(
            program_id,
            &bounty_board::instruction::ExpireRefundToken {}.data(),
            bounty_board::accounts::ExpireRefundToken {
                caller: caller.pubkey(),
                creator: creator.pubkey(),
                mint,
                bounty,
                vault,
                creator_token_account: creator_ata,
                token_program: TOKEN_PROGRAM_ID,
                associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
            }
            .to_account_metas(None),
        ),
    );

    assert!(svm.get_account(&vault).is_none());
    assert_eq!(token_amount(&svm, &creator_ata), TOKEN_FUNDED);
    {
        let mut data: &[u8] = &svm.get_account(&bounty).unwrap().data;
        let state = Bounty::try_deserialize(&mut data).unwrap();
        assert_eq!(state.status, BountyStatus::Expired);
    }
}
