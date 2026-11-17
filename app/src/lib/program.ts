import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
  type Commitment,
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
export const SUBMISSION_SEED = Buffer.from("submission");

export type BountyAccount = {
  publicKey: PublicKey;
  account: {
    creator: PublicKey;
    bountyId: BN;
    amount: BN;
    deadline: BN;
    status: {
      open?: object;
      completed?: object;
      cancelled?: object;
      expired?: object;
    };
    submissionCount: number;
    title: string;
    description: string;
    bump: number;
    vaultBump: number;
  };
};

export type SubmissionAccount = {
  publicKey: PublicKey;
  account: {
    bounty: PublicKey;
    hunter: PublicKey;
    uri: string;
    bump: number;
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

/** Decode program accounts one-by-one so pre-upgrade layouts don't crash `.all()`. */
export async function fetchBoardAccounts(program: Program<BountyBoard>): Promise<{
  bounties: BountyAccount[];
  submissions: SubmissionAccount[];
}> {
  const rows = await program.provider.connection.getProgramAccounts(PROGRAM_ID);
  const bounties: BountyAccount[] = [];
  const submissions: SubmissionAccount[] = [];
  for (const { pubkey, account } of rows) {
    try {
      const decoded = program.coder.accounts.decode(
        "bounty",
        account.data
      ) as BountyAccount["account"];
      bounties.push({ publicKey: pubkey, account: decoded });
      continue;
    } catch {
      // not a current bounty
    }
    try {
      const decoded = program.coder.accounts.decode(
        "submission",
        account.data
      ) as SubmissionAccount["account"];
      submissions.push({ publicKey: pubkey, account: decoded });
    } catch {
      // vault or stale layout — skip
    }
  }
  return { bounties, submissions };
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

export function submissionPda(bounty: PublicKey, hunter: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [SUBMISSION_SEED, bounty.toBuffer(), hunter.toBuffer()],
    PROGRAM_ID
  );
}

export function statusLabel(
  status: BountyAccount["account"]["status"]
): string {
  if (status.open !== undefined) return "Open";
  if (status.completed !== undefined) return "Completed";
  if (status.cancelled !== undefined) return "Cancelled";
  if (status.expired !== undefined) return "Expired";
  return "Unknown";
}

export const MAX_URI_LEN = 200;
/** Rough rent headroom for init_if_needed Submission PDA + fees */
export const SUBMISSION_RENT_SOL = 0.003;

/** Pull a readable message out of Anchor / wallet-adapter / Phantom errors. */
export function formatTxError(e: unknown): string {
  const err = e as {
    message?: string;
    error?: { errorMessage?: string; code?: number | string };
    logs?: string[];
    getLogs?: () => string[] | Promise<string[]>;
    cause?: unknown;
    transactionMessage?: string;
  };

  const chunks: string[] = [];
  if (err?.error?.errorMessage) chunks.push(String(err.error.errorMessage));
  if (err?.transactionMessage) chunks.push(String(err.transactionMessage));
  if (err?.message) chunks.push(String(err.message));

  let logs = err?.logs;
  if (!logs?.length && typeof err?.getLogs === "function") {
    try {
      const got = err.getLogs();
      if (Array.isArray(got)) logs = got;
    } catch {
      /* ignore */
    }
  }
  if (logs?.length) {
    const useful = logs.filter((l) =>
      /Error|failed|insufficient|custom program|Program log/i.test(l)
    );
    if (useful.length) chunks.push(useful.slice(-6).join(" | "));
  }

  if (err?.cause) {
    const nested = formatTxError(err.cause);
    if (nested && !chunks.includes(nested)) chunks.push(nested);
  }

  const text = [...new Set(chunks.filter(Boolean))].join(" — ") || "Transaction failed";
  if (/unexpected error/i.test(text)) {
    return `${text}. Confirm Phantom is on Devnet, disconnect/reconnect the creator account, and approve the outbound SOL to the hunter when Phantom prompts.`;
  }
  if (/insufficient/i.test(text)) {
    return `${text}. Fund this Phantom account on Devnet and retry.`;
  }
  return text;
}

type SendTx = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction: any,
  connection: Connection,
  options?: { preflightCommitment?: Commitment; skipPreflight?: boolean }
) => Promise<string>;

/**
 * Simulate, then send via wallet-adapter `sendTransaction` (more reliable with
 * Phantom than AnchorProvider's internal signTransaction path).
 */
export async function rpcWithSim(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  builder: { transaction: () => Promise<any> },
  feePayer: PublicKey,
  conn: Connection,
  sendTransaction: SendTx
): Promise<string> {
  const tx = await builder.transaction();
  tx.feePayer = feePayer;
  const latest = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;

  const sim = await conn.simulateTransaction(tx);
  if (sim.value.err) {
    const logs = sim.value.logs ?? [];
    const useful = logs.filter((l) =>
      /Error|failed|insufficient|custom program|Program log/i.test(l)
    );
    const detail =
      useful.slice(-8).join(" | ") || JSON.stringify(sim.value.err);
    throw new Error(`Simulation failed: ${detail}`);
  }

  const sig = await sendTransaction(tx, conn, {
    preflightCommitment: "confirmed",
    skipPreflight: false,
  });
  await conn.confirmTransaction(
    { signature: sig, ...latest },
    "confirmed"
  );
  return sig;
}

export { SystemProgram, BN };
