import { PublicKey } from "@solana/web3.js";
import { BountyAccount, isSolBounty, statusLabel } from "./program";
import { DEVNET_USDC_MINT } from "./tokens";

export type AssetFilter = "all" | "sol" | "usdc" | "other";
export type StatusFilter = "all" | "completed" | "cancelled" | "expired";

/** Newest bounty first. `bountyId` is the creation timestamp. */
export function byNewest(a: BountyAccount, b: BountyAccount): number {
  return b.account.bountyId.cmp(a.account.bountyId);
}

export function matchesBounty(
  bounty: BountyAccount,
  query: string,
  asset: AssetFilter,
  status: StatusFilter = "all"
): boolean {
  const mint = bounty.account.mint;
  const sol = isSolBounty(bounty.account);
  const usdc = mint.equals(DEVNET_USDC_MINT);
  if (asset === "sol" && !sol) return false;
  if (asset === "usdc" && !usdc) return false;
  if (asset === "other" && (sol || usdc)) return false;

  if (status !== "all") {
    const label = statusLabel(bounty.account.status).toLowerCase();
    if (label !== status) return false;
  }

  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const winner = bounty.account.winner.equals(PublicKey.default)
    ? ""
    : bounty.account.winner.toBase58();
  const haystack = [
    bounty.account.title,
    bounty.account.description,
    bounty.account.creator.toBase58(),
    winner,
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(needle);
}
