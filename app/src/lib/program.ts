import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { sha256 } from "@noble/hashes/sha256";
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
export const URI_SEED = Buffer.from("uri");

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
    winner: PublicKey;
    bump: number;
    vaultBump: number;
    /** Default pubkey means native SOL. */
    mint: PublicKey;
    /** 9 for SOL; mint decimals for SPL. */
    decimals: number;
  };
};

export function isSolMint(mint: PublicKey): boolean {
  return mint.equals(PublicKey.default);
}

export function isSolBounty(account: BountyAccount["account"]): boolean {
  return isSolMint(account.mint);
}

/** Parse a decimal string into base units. Rejects more fractional digits than `decimals`. */
export function parseBaseUnits(input: string, decimals: number): BN | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) return null;
  const base = `${whole}${frac.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  if (base === "0") return null;
  return new BN(base);
}

/** Format base units without float rounding. Trailing zeros are trimmed. */
export function formatBaseUnits(amount: BN, decimals: number): string {
  const negative = amount.isNeg();
  const raw = amount.abs().toString(10).padStart(decimals + 1, "0");
  const whole = raw.slice(0, raw.length - decimals);
  const frac = raw.slice(raw.length - decimals).replace(/0+$/, "");
  const text = frac.length > 0 ? `${whole}.${frac}` : whole;
  return negative ? `-${text}` : text;
}

export type SubmissionAccount = {
  publicKey: PublicKey;
  account: {
    bounty: PublicKey;
    hunter: PublicKey;
    uri: string;
    submittedAt: BN;
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

/** True when stored bump + seeds recreate this pubkey (rejects pre-upgrade layouts). */
export function isCurrentBountyAccount(
  pubkey: PublicKey,
  account: BountyAccount["account"]
): boolean {
  try {
    const id = account.bountyId.toArrayLike(Buffer, "le", 8);
    const derived = PublicKey.createProgramAddressSync(
      [
        BOUNTY_SEED,
        account.creator.toBuffer(),
        id,
        Buffer.from([account.bump]),
      ],
      PROGRAM_ID
    );
    return derived.equals(pubkey);
  } catch {
    return false;
  }
}

export function isCurrentSubmissionAccount(
  pubkey: PublicKey,
  account: SubmissionAccount["account"]
): boolean {
  try {
    const derived = PublicKey.createProgramAddressSync(
      [
        SUBMISSION_SEED,
        account.bounty.toBuffer(),
        account.hunter.toBuffer(),
        Buffer.from([account.bump]),
      ],
      PROGRAM_ID
    );
    return derived.equals(pubkey);
  } catch {
    return false;
  }
}

/** Decode program accounts one-by-one so pre-upgrade layouts don't crash `.all()`. */
export async function fetchBoardAccounts(program: Program<BountyBoard>): Promise<{
  bounties: BountyAccount[];
  submissions: SubmissionAccount[];
  skippedStale: number;
}> {
  const rows = await program.provider.connection.getProgramAccounts(PROGRAM_ID);
  const bounties: BountyAccount[] = [];
  const submissions: SubmissionAccount[] = [];
  let skippedStale = 0;
  for (const { pubkey, account } of rows) {
    try {
      const decoded = program.coder.accounts.decode(
        "bounty",
        account.data
      ) as BountyAccount["account"];
      if (!isCurrentBountyAccount(pubkey, decoded)) {
        skippedStale += 1;
        continue;
      }
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
      if (!isCurrentSubmissionAccount(pubkey, decoded)) {
        skippedStale += 1;
        continue;
      }
      submissions.push({ publicKey: pubkey, account: decoded });
    } catch {
      // vault, uri claim, or stale layout — skip
    }
  }
  return { bounties, submissions, skippedStale };
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

/** SHA-256 of URI bytes — matches on-chain `solana_sha256_hasher::hash`. */
export function uriHashBytes(uri: string): number[] {
  return Array.from(sha256(new TextEncoder().encode(uri)));
}

export function uriClaimPda(bounty: PublicKey, uri: string) {
  return PublicKey.findProgramAddressSync(
    [URI_SEED, bounty.toBuffer(), Buffer.from(uriHashBytes(uri))],
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

export function isOpenStatus(
  status: BountyAccount["account"]["status"]
): boolean {
  return status.open !== undefined;
}

export const MAX_URI_LEN = 200;
/** Rent headroom for Submission + UriClaim PDAs + fees */
export const SUBMISSION_RENT_SOL = 0.005;

/** Pull a readable message out of Anchor / wallet-adapter / wallet errors. */
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

  const anchorMsg = extractAnchorErrorMessage(chunks.join("\n"));
  if (anchorMsg) return friendlyAnchorMessage(anchorMsg);

  const text = [...new Set(chunks.filter(Boolean))].join(" — ") || "Transaction failed";
  if (/unexpected error/i.test(text)) {
    return `${text}. Confirm the wallet is on Devnet, disconnect/reconnect the creator account, and approve the outbound SOL to the hunter when the wallet prompts.`;
  }
  if (/ConstraintSeeds|seeds constraint/i.test(text)) {
    return "This bounty was created before the latest program upgrade — create a new bounty and try again.";
  }
  if (/insufficient/i.test(text)) {
    return `${text}. Fund this wallet account on Devnet and retry.`;
  }
  return text;
}

/** Expected on-chain / wallet failures — UI should show these without console.error. */
export class TxUserError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "TxUserError";
    this.userMessage = userMessage;
  }
}

function extractAnchorErrorMessage(text: string): string | null {
  const m = text.match(/Error Message:\s*([^\n|]+)/i);
  return m?.[1]?.trim() || null;
}

function friendlyAnchorMessage(anchorMsg: string): string {
  if (/already claimed/i.test(anchorMsg)) {
    return `${anchorMsg} Pick a unique URI for this bounty.`;
  }
  if (/seeds constraint/i.test(anchorMsg)) {
    return "This bounty was created before the latest program upgrade — create a new bounty and try again.";
  }
  return anchorMsg;
}

function messageFromSimFailure(
  logs: string[] | null | undefined,
  err: unknown
): string {
  const blob = (logs ?? []).join("\n");
  const anchorMsg = extractAnchorErrorMessage(blob);
  if (anchorMsg) return friendlyAnchorMessage(anchorMsg);

  const useful = (logs ?? []).filter((l) =>
    /Error|failed|insufficient|custom program|Program log/i.test(l)
  );
  return (
    useful.slice(-4).join(" — ") ||
    (typeof err === "string" ? err : JSON.stringify(err)) ||
    "Transaction simulation failed"
  );
}

type SendTx = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction: any,
  connection: Connection,
  options?: { preflightCommitment?: Commitment; skipPreflight?: boolean }
) => Promise<string>;

export type RpcOutcome =
  | { ok: true; signature: string }
  | { ok: false; message: string };

/**
 * Simulate, then send via wallet-adapter `sendTransaction` (more reliable with
 * browser wallets than AnchorProvider's internal signTransaction path).
 * Expected on-chain failures return `{ ok: false }` instead of throwing.
 */
export async function rpcWithSim(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  builder: { transaction: () => Promise<any> },
  feePayer: PublicKey,
  conn: Connection,
  sendTransaction: SendTx
): Promise<RpcOutcome> {
  const tx = await builder.transaction();
  tx.feePayer = feePayer;
  const latest = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;

  const sim = await conn.simulateTransaction(tx);
  if (sim.value.err) {
    return {
      ok: false,
      message: messageFromSimFailure(sim.value.logs, sim.value.err),
    };
  }

  try {
    const sig = await sendTransaction(tx, conn, {
      preflightCommitment: "confirmed",
      skipPreflight: false,
    });
    await conn.confirmTransaction(
      { signature: sig, ...latest },
      "confirmed"
    );
    return { ok: true, signature: sig };
  } catch (e) {
    if (e instanceof TxUserError) return { ok: false, message: e.userMessage };
    const msg = formatTxError(e);
    if (/user rejected|rejected the request/i.test(msg)) {
      return { ok: false, message: "Request cancelled in wallet." };
    }
    throw e;
  }
}

export { SystemProgram, BN };
