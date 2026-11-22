import { BountyAccount, isOpenStatus } from "@/lib/program";

export type HistoryMove = {
  nextOpenKeys: Set<string>;
  noticed: number;
  announced: BountyAccount[];
  ownSettled: Set<string>;
};

/** Compare the last open board with a fresh fetch. */
export function collectHistoryMoves(
  rows: BountyAccount[],
  previousOpen: ReadonlySet<string> | null,
  ownSettled: ReadonlySet<string>
): HistoryMove {
  const nextOpenKeys = new Set(
    rows
      .filter((bounty) => isOpenStatus(bounty.account.status))
      .map((bounty) => bounty.publicKey.toBase58())
  );
  const remainingOwn = new Set(ownSettled);
  if (!previousOpen) {
    return {
      nextOpenKeys,
      noticed: 0,
      announced: [],
      ownSettled: remainingOwn,
    };
  }

  const settled = new Map(
    rows
      .filter((bounty) => !isOpenStatus(bounty.account.status))
      .map((bounty) => [bounty.publicKey.toBase58(), bounty] as const)
  );
  const announced: BountyAccount[] = [];
  let noticed = 0;
  for (const key of previousOpen) {
    if (nextOpenKeys.has(key)) {
      remainingOwn.delete(key);
      continue;
    }
    const row = settled.get(key);
    if (!row) continue;
    noticed += 1;
    if (remainingOwn.has(key)) {
      remainingOwn.delete(key);
      continue;
    }
    announced.push(row);
  }

  return { nextOpenKeys, noticed, announced, ownSettled: remainingOwn };
}
