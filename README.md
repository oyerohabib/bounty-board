# Solana Bounty Board

Mid-level Solana + Anchor escrow app: creators post bounties and lock SOL; hunters submit proof; creators accept (pay) or cancel (refund); anyone can trigger an expiry refund after the deadline.

Built as MLH Web3 / Solana practice: PDAs, program-owned vaults, Anchor instructions, wallet-adapter UI.

## Stack

| Layer | Tech |
|-------|------|
| On-chain | Anchor 1.2 / Solana |
| Tests | LiteSVM (`cargo test`) |
| Frontend | Next.js 15 + Phantom wallet-adapter |
| Cluster | Devnet (UI default); localnet for offline deploy |

**Program ID:** `5rL8PzKb61y7VxB5ML1uWMTgqv2kUAA1qkUMoY6Xpm8y`

## Instructions

1. `create_bounty(bounty_id, amount, deadline)` — init bounty + vault PDAs, escrow SOL  
2. `submit_work(uri)` — hunter claims with a submission URL  
3. `accept` — close vault to hunter, close bounty to creator  
4. `cancel` — creator refund while Open/Submitted  
5. `expire_refund` — anyone after deadline; refunds creator  

Off-chain title/description live in browser `localStorage` (v1).

## Setup

```bash
# Toolchain (once)
# rustup, Solana CLI, Anchor (avm install latest && avm use latest)

export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX15.2.sdk   # macOS 15+ linker workaround

# Build + test
anchor build
cargo test -p bounty_board --test test_bounty_flow

# Frontend
cd app && npm install --legacy-peer-deps && npm run dev
```

Open http://localhost:3000 — connect Phantom (Devnet).

## Deploy

### Localnet (verified in this repo)

```bash
solana-test-validator --reset
solana config set --url localhost
solana airdrop 100
anchor program deploy --provider.cluster localnet
```

Point the UI at local RPC:

```bash
cd app
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8899 npm run dev
```

### Devnet

Public RPC `requestAirdrop` is closed. Fund the deploy wallet first:

1. Address: `solana address` (default `~/.config/solana/id.json`)
2. Request SOL at https://faucet.solana.com/ (or https://www.devnetfaucet.org/)
3. Then:

```bash
solana config set --url devnet
anchor build
anchor program deploy --provider.cluster devnet
```

Resume a failed buffer deploy if needed:

```bash
anchor program deploy --provider.cluster devnet \
  --buffer target/deploy/bounty_board-upgrade-buffer.json
```

## Demo flow

1. Connect Phantom on **Devnet** (or localnet with matching RPC).
2. Post a bounty (title/description local; amount + deadline on-chain).
3. From a second wallet, paste a submission URI → **Submit work**.
4. Creator → **Accept & pay** (or **Cancel & refund** / **Expire refund** after deadline).

## Project layout

```
programs/bounty_board/   # Anchor program + LiteSVM tests
app/                     # Next.js UI
target/idl/              # Generated IDL (copied into app/src/lib)
Anchor.toml
```

## Notes

- On some macOS versions, set `SDKROOT` to `MacOSX15.2.sdk` when running `anchor build` if IDL generation fails with `arm64e.x1` linker errors.
- Do not commit keypairs under `target/deploy/*-keypair.json` to a public remote.
