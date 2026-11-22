# Bounty Board UI

Next.js 15 frontend for the Solana Bounty Board program — wallet connect (Phantom, Solflare, or Backpack), post bounties in SOL, Devnet USDC, or a custom SPL mint, submit work, accept/cancel/expire.

## Getting Started

```bash
npm install --legacy-peer-deps
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Connect Phantom on Devnet (default) or set `NEXT_PUBLIC_RPC_URL` for localnet.

## Tests

```bash
npm test
npx playwright install chromium
npm run test:e2e
```

`npm test` runs the Vitest unit tests. `npm run test:e2e` starts the app and runs the Playwright browser tests. Install Chromium once before the first browser run. GitHub Actions runs both.

See the [root README](../README.md) for program build, test, and deploy steps.
