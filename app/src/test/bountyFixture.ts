import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { BountyAccount } from "@/lib/program";

type StatusName = "open" | "completed" | "cancelled" | "expired";

export function testBounty(input: {
  id: number;
  title: string;
  description?: string;
  status?: StatusName;
  mint?: PublicKey;
  creator?: PublicKey;
  winner?: PublicKey;
  publicKey?: PublicKey;
}): BountyAccount {
  const statusName = input.status ?? "open";
  return {
    publicKey: input.publicKey ?? PublicKey.unique(),
    account: {
      creator: input.creator ?? PublicKey.unique(),
      bountyId: new BN(input.id),
      amount: new BN(1),
      deadline: new BN(0),
      status: { [statusName]: {} },
      submissionCount: 0,
      title: input.title,
      description: input.description ?? "",
      winner: input.winner ?? PublicKey.default,
      bump: 0,
      vaultBump: 0,
      mint: input.mint ?? PublicKey.default,
      decimals: input.mint ? 6 : 9,
    },
  };
}
