"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import {
  WalletError,
  WalletNotReadyError,
} from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";
import { usePhantomAccountSync } from "@/hooks/usePhantomAccountSync";
import "@solana/wallet-adapter-react-ui/styles.css";

/** Must sit under WalletProvider so useWallet() works. */
function PhantomAccountSync() {
  usePhantomAccountSync();
  return null;
}

export default function AppWalletProvider({
  children,
}: {
  children: ReactNode;
}) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet"),
    []
  );
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  const onError = useCallback((error: WalletError) => {
    // User cancelled the Phantom popup — not an app bug.
    if (
      error.name === "WalletConnectionError" ||
      error.message?.toLowerCase().includes("user rejected") ||
      error instanceof WalletNotReadyError
    ) {
      console.info(error.message);
      return;
    }
    console.error(error);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={onError}>
        <WalletModalProvider>
          <PhantomAccountSync />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
