import { BountyAccount } from "./program";

/** Newest bounty first. `bountyId` is the creation timestamp. */
export function byNewest(a: BountyAccount, b: BountyAccount): number {
  return b.account.bountyId.cmp(a.account.bountyId);
}
