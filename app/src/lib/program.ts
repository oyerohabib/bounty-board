import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
} from "@solana/web3.js";
import type { BountyBoard } from "./bounty_board";
import idl from "./idl.json";

export const PROGRAM_ID = new PublicKey(
  (idl as { address: string }).address
);

export const connection = new Connection(
  process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet"),
  "confirmed"
);

export const BOUNTY_SEED = Buffer.from("bounty");
export const VAULT_SEED = Buffer.from("vault");

export type BountyAccount = {
  publicKey: PublicKey;
  account: {
    creator: PublicKey;
    bountyId: BN;
    amount: BN;
    deadline: BN;
    status: { open?: object; submitted?: object; completed?: object; cancelled?: object; expired?: object };
    hunter: PublicKey;
    submissionUri: string;
    bump: number;
    vaultBump: number;
  };
};

export function getProvider(
  wallet: AnchorProvider["wallet"]
): AnchorProvider {
  return new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

export function getProgram(provider: AnchorProvider): Program<BountyBoard> {
  return new Program(idl as BountyBoard, provider);
}

export function bountyPda(creator: PublicKey, bountyId: BN | number | bigint) {
  const id = bountyId instanceof BN ? bountyId : new BN(bountyId);
  return PublicKey.findProgramAddressSync(
    [BOUNTY_SEED, creator.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

export function vaultPda(bounty: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, bounty.toBuffer()],
    PROGRAM_ID
  );
}

export function statusLabel(
  status: BountyAccount["account"]["status"]
): string {
  if (status.open !== undefined) return "Open";
  if (status.submitted !== undefined) return "Submitted";
  if (status.completed !== undefined) return "Completed";
  if (status.cancelled !== undefined) return "Cancelled";
  if (status.expired !== undefined) return "Expired";
  return "Unknown";
}

export { SystemProgram, BN };
