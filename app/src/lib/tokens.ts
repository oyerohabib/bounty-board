import { BN } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { formatBaseUnits, isSolMint } from "./program";

/** Circle's official Devnet USDC mint (6 decimals, classic Token program). */
export const DEVNET_USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

export const USDC_DECIMALS = 6;

export { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID };

export function associatedTokenAddress(mint: PublicKey, owner: PublicKey) {
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

export function assetLabel(mint: PublicKey): string {
  if (isSolMint(mint)) return "SOL";
  if (mint.equals(DEVNET_USDC_MINT)) return "USDC";
  const base58 = mint.toBase58();
  return `${base58.slice(0, 4)}…${base58.slice(-4)}`;
}

export function formatAssetAmount(amount: BN, decimals: number, mint: PublicKey) {
  return `${formatBaseUnits(amount, decimals)} ${assetLabel(mint)}`;
}

export async function fetchMintDecimals(
  connection: Connection,
  mint: PublicKey
): Promise<number> {
  const info = await getMint(connection, mint, "confirmed", TOKEN_PROGRAM_ID);
  return info.decimals;
}

/** Base units held by `owner`, or 0 when the ATA does not exist yet. */
export async function fetchTokenBalance(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey
): Promise<BN> {
  const ata = associatedTokenAddress(mint, owner);
  try {
    const account = await getAccount(
      connection,
      ata,
      "confirmed",
      TOKEN_PROGRAM_ID
    );
    return new BN(account.amount.toString());
  } catch {
    return new BN(0);
  }
}
