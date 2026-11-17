"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PhantomWalletName } from "@solana/wallet-adapter-phantom";
import { PublicKey } from "@solana/web3.js";

type PhantomProvider = {
  publicKey?: { toString(): string } | null;
  on?(
    event: "accountChanged",
    handler: (pubkey: PublicKey | null) => void
  ): void;
  off?(
    event: "accountChanged",
    handler: (pubkey: PublicKey | null) => void
  ): void;
  removeListener?(
    event: "accountChanged",
    handler: (pubkey: PublicKey | null) => void
  ): void;
};

function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  };
  return w.phantom?.solana ?? w.solana ?? null;
}

function pubkeyStr(value: PublicKey | { toString(): string } | null | undefined) {
  if (!value) return null;
  try {
    return new PublicKey(value.toString()).toBase58();
  } catch {
    return null;
  }
}

/**
 * Phantom Wallet Standard does not reliably emit accountChanged when the active
 * account changes. This hook handles it when it does fire; intentional switches
 * go through WalletButton "Switch account".
 */
export function usePhantomAccountSync() {
  const { publicKey, connected, select, connect, disconnect } = useWallet();
  const publicKeyRef = useRef(publicKey);
  const connectedRef = useRef(connected);
  const syncing = useRef(false);
  publicKeyRef.current = publicKey;
  connectedRef.current = connected;

  useEffect(() => {
    const provider = getPhantom();
    if (!provider?.on) return;

    const onAccountChanged = async (nextKey: PublicKey | null) => {
      const next = pubkeyStr(nextKey);
      const current = publicKeyRef.current?.toBase58() ?? null;
      if (!connectedRef.current || syncing.current) return;
      if (next === current && next !== null) return;

      syncing.current = true;
      try {
        try {
          await disconnect();
        } catch {
          /* ignore */
        }
        select(PhantomWalletName);
        await connect();
      } catch {
        /* user reject */
      } finally {
        syncing.current = false;
      }
    };

    provider.on("accountChanged", onAccountChanged);
    return () => {
      provider.off?.("accountChanged", onAccountChanged);
      provider.removeListener?.("accountChanged", onAccountChanged);
    };
  }, [select, connect, disconnect]);
}
