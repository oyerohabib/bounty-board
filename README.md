# <img src="./logo.svg" alt="" width="32" height="32" /> Bounty Board

Post bounties, lock SOL, Devnet USDC, or a custom classic SPL token in escrow, and pay hunters when work lands — or cancel / expire-refund when it doesn’t. Settled bounties stay on the History page. Built on Solana with Anchor PDAs, program-owned vaults, and a wallet UI (Phantom, Solflare, or Backpack).

## Walkthrough

| Part 1 | Part 2 |
|:---:|:---:|
| <a href="https://www.loom.com/share/604d778b5a3a401cacbc0da07a44f020"><img src="https://cdn.loom.com/sessions/thumbnails/604d778b5a3a401cacbc0da07a44f020-84f273ac9b176e3b-full-play.gif" alt="Bounty Board walkthrough, part 1" width="420" /></a><br>[Watch part 1](https://www.loom.com/share/604d778b5a3a401cacbc0da07a44f020) | <a href="https://www.loom.com/share/f0df0406c8004ed48fa851495ad74504"><img src="https://cdn.loom.com/sessions/thumbnails/f0df0406c8004ed48fa851495ad74504-4637cc153df9538b-full-play.gif" alt="Bounty Board walkthrough, part 2" width="420" /></a><br>[Watch part 2](https://www.loom.com/share/f0df0406c8004ed48fa851495ad74504) |

## Stack

| Layer | Tech |
|-------|------|
| On-chain | Anchor 1.2 / Solana |
| Tests | LiteSVM (`cargo test`); app unit and browser tests |
| Frontend | Next.js 15, React 19, Tailwind, wallet-adapter (Phantom, Solflare, or Backpack) |
| Cluster | Devnet (UI default); localnet for offline deploy |

**Program ID:** `5rL8PzKb61y7VxB5ML1uWMTgqv2kUAA1qkUMoY6Xpm8y`

## Instructions

1. `create_bounty(bounty_id, amount, deadline, title, description)` — init bounty + vault PDAs, escrow SOL (title/description on-chain)  
2. `submit_work(uri, uri_hash)` — hunter opens/updates their Submission PDA; `UriClaim` enforces **unique URIs per bounty**; records `submitted_at`  
3. `accept` — creator picks a submission; vault pays that hunter; bounty + winning submission **stay on-chain** for history (`winner` set)  
4. `cancel` — creator refund while Open (vault closed; bounty kept as Cancelled)  
5. `expire_refund` — anyone after deadline; refunds creator (bounty kept as Expired)  
6. `reclaim_submission(uri_hash)` — non-winning hunter closes Submission + UriClaim after the bounty is settled (recover rent)  

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

Frontend tests, from `app`:

```bash
npm test
npx playwright install chromium
npm run test:e2e
```

`npm test` runs Vitest. `npm run test:e2e` starts the app and runs Playwright. GitHub Actions runs both on pull requests and on pushes to `main`.

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

## Devnet wallet funds

The wallet you connect in the UI is not the CLI deploy wallet. It needs a little SOL for rent on every bounty, including token bounties.

- **SOL:** https://faucet.solana.com/
- **USDC:** [Circle's faucet](https://faucet.circle.com/?chain=SOL). Choose Solana Devnet. It sends 20 USDC about every 2 hours. In the form, choose USDC.
- **Custom SPL mint** (classic Token program, not Token-2022). From the CLI wallet:

```bash
spl-token create-token --decimals 6 --url devnet
spl-token create-account <MINT> --owner <PHANTOM_ADDRESS> \
  --fee-payer ~/.config/solana/id.json --url devnet
spl-token mint <MINT> 1000 --recipient-owner <PHANTOM_ADDRESS> \
  --fee-payer ~/.config/solana/id.json \
  --mint-authority ~/.config/solana/id.json --url devnet
```

In the form, choose Custom and paste that mint address.

## Demo flow

1. Connect a wallet on **Devnet** (or localnet with matching RPC).
2. Post a bounty in SOL, Devnet USDC, or a custom mint. Title, description, amount, and deadline are all on-chain.
3. From other accounts, paste a **unique** submission URI → **Submit work** (duplicate links on the same bounty are rejected).
4. Creator picks a submission → **Accept & pay** (or **Cancel & refund** / **Expire refund** after deadline). The bounty moves to History.
5. Open **History** for completed, cancelled, and expired bounties (kept on-chain with timestamps and winner).
6. Losing hunters can **Reclaim rent** on leftover submission + URI-claim accounts.

**Note:** This schema change invalidates old on-chain bounties — redeploy after pulling (`anchor build` + `anchor program deploy`).

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
