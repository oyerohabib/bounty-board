"use client";

import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

/** Wallet button only after mount — avoids SSR/client HTML mismatch. */
export default function WalletButton() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <button
        type="button"
        className="wallet-adapter-button wallet-adapter-button-trigger"
        disabled
        style={{ visibility: "hidden", height: 48, minWidth: 160 }}
        aria-hidden
      />
    );
  }

  return <WalletMultiButton />;
}
