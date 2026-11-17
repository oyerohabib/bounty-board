"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  WalletReadyState,
  type WalletName,
} from "@solana/wallet-adapter-base";
import { PhantomWalletName } from "@solana/wallet-adapter-phantom";
import {
  beginAccountSwitch,
  endAccountSwitch,
} from "@/lib/accountSwitch";
import { notifyWarning } from "@/lib/toast";

function shortAddress(base58: string): string {
  return `${base58.slice(0, 4)}…${base58.slice(-4)}`;
}

function isUsable(readyState: WalletReadyState) {
  return (
    readyState === WalletReadyState.Installed ||
    readyState === WalletReadyState.Loadable
  );
}

/** Multi-wallet connect picker; Switch account remains Phantom-only. */
export default function WalletButton() {
  const [ready, setReady] = useState(false);
  const [intent, setIntent] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sawDisconnect = useRef(false);

  const {
    publicKey,
    connected,
    connecting,
    disconnecting,
    wallet,
    wallets,
    select,
    connect,
    disconnect,
  } = useWallet();

  const isPhantom =
    wallet?.adapter.name === PhantomWalletName;

  const sortedWallets = useMemo(() => {
    return [...wallets].sort((a, b) => {
      const aOk = isUsable(a.adapter.readyState) ? 0 : 1;
      const bOk = isUsable(b.adapter.readyState) ? 0 : 1;
      if (aOk !== bOk) return aOk - bOk;
      return a.adapter.name.localeCompare(b.adapter.name);
    });
  }, [wallets]);

  useEffect(() => {
    setReady(true);
  }, []);

  // After select(), wait for wallet then connect (avoids select/connect race).
  useEffect(() => {
    // Connect success flips `connected` and re-runs this effect; cleanup would
    // cancel the in-flight finally and leave intent stuck true — clear here.
    if (intent && connected) {
      setIntent(false);
      return;
    }
    if (!intent || !wallet || connecting) return;
    let cancelled = false;
    const adapterConnected = wallet.adapter.connected;
    (async () => {
      try {
        // Adapter can be connected while React missed the 'connect' event
        // (hard refresh / listener timing). Re-emit so WalletProvider syncs.
        const syncReactFromAdapter = () => {
          const pk = wallet.adapter.publicKey;
          if (!wallet.adapter.connected || !pk) return false;
          wallet.adapter.emit("connect", pk);
          return true;
        };

        if (adapterConnected) {
          syncReactFromAdapter();
          return;
        }
        await connect();
        if (!cancelled && wallet.adapter.connected) {
          syncReactFromAdapter();
        }
      } catch {
        /* user reject / onError in provider */
      } finally {
        if (!cancelled) setIntent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intent, wallet, connected, connecting, connect]);

  // Switch account: after disconnect clears walletName, select Phantom then connect.
  useEffect(() => {
    if (!switching) return;
    if (connected || connecting || intent) return;
    if (!wallet) {
      select(PhantomWalletName);
      return;
    }
    setIntent(true);
  }, [switching, wallet, connected, connecting, intent, select]);

  // Finish switching only after we disconnected then reconnected.
  useEffect(() => {
    if (!switching) {
      sawDisconnect.current = false;
      return;
    }
    if (!connected) {
      sawDisconnect.current = true;
      return;
    }
    if (!sawDisconnect.current || !publicKey || connecting) return;
    const to = publicKey.toBase58();
    const result = endAccountSwitch(to);
    if (result === "same") {
      notifyWarning(
        "Same account",
        `${shortAddress(to)} — pick a different account in Phantom, then try again.`
      );
    }
    setSwitching(false);
    setIntent(false);
    sawDisconnect.current = false;
  }, [switching, connected, publicKey, connecting]);

  useEffect(() => {
    if (!menuOpen && !pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, pickerOpen]);

  const onPickWallet = useCallback(
    (name: WalletName, readyState: WalletReadyState, url: string) => {
      if (!isUsable(readyState)) {
        window.open(url, "_blank", "noopener,noreferrer");
        setPickerOpen(false);
        return;
      }
      setPickerOpen(false);
      if (wallet?.adapter.name === name) {
        setIntent(true);
        return;
      }
      select(name);
      setIntent(true);
    },
    [wallet, select]
  );

  const onCopy = useCallback(async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [publicKey]);

  const onDisconnect = useCallback(async () => {
    setMenuOpen(false);
    try {
      await disconnect();
    } catch {
      /* ignore */
    }
  }, [disconnect]);

  /** Phantom keeps a sticky site auth — reconnect to pick up the active account. */
  const onSwitchAccount = useCallback(async () => {
    setMenuOpen(false);
    sawDisconnect.current = false;
    beginAccountSwitch(publicKey?.toBase58() ?? null);
    setSwitching(true);
    try {
      await disconnect();
    } catch {
      /* ignore */
    }
  }, [publicKey, disconnect]);

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

  if ((connected && publicKey) || switching) {
    const label =
      switching && !(connected && publicKey)
        ? "Switching…"
        : publicKey
          ? shortAddress(publicKey.toBase58())
          : "Switching…";

    return (
      <div
        ref={wrapRef}
        className="wallet-btn-wrap is-connected relative"
      >
        <button
          type="button"
          className="wallet-adapter-button wallet-adapter-button-trigger"
          onClick={() => !switching && setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          disabled={switching}
        >
          {wallet?.adapter.icon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={wallet.adapter.icon}
              alt=""
              width={24}
              height={24}
              className="wallet-adapter-button-start-icon"
            />
          )}
          {label}
        </button>
        {menuOpen && connected && publicKey && (
          <div
            role="menu"
            className="animate-menu-in absolute right-0 z-50 mt-2 min-w-[12rem] overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-100"
              onClick={() => void onCopy()}
            >
              {copied ? "Copied" : "Copy address"}
            </button>
            {isPhantom && (
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-100"
                disabled={disconnecting || switching || connecting}
                onClick={() => void onSwitchAccount()}
              >
                Switch account
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-stone-800 hover:bg-stone-100"
              disabled={disconnecting || switching}
              onClick={() => void onDisconnect()}
            >
              Disconnect
            </button>
            {isPhantom && (
              <p className="border-t border-stone-100 px-3 py-2 text-[11px] leading-snug text-stone-500">
                Select the account in Phantom, then use Switch account.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const busy = connecting || intent;
  const connectLabel = busy ? "Connecting…" : "Connect wallet";

  return (
    <div ref={wrapRef} className="wallet-btn-wrap relative">
      <button
        type="button"
        className="wallet-adapter-button wallet-adapter-button-trigger"
        disabled={busy}
        aria-expanded={pickerOpen}
        aria-haspopup="menu"
        onClick={() => setPickerOpen((o) => !o)}
      >
        {connectLabel}
      </button>
      {pickerOpen && !busy && (
        <div
          role="menu"
          className="animate-menu-in absolute right-0 z-50 mt-2 min-w-[14rem] overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
        >
          {sortedWallets.map(({ adapter }) => {
            const usable = isUsable(adapter.readyState);
            return (
              <button
                key={adapter.name}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-stone-800 hover:bg-stone-100"
                onClick={() =>
                  onPickWallet(adapter.name, adapter.readyState, adapter.url)
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={adapter.icon}
                  alt=""
                  width={22}
                  height={22}
                  className="h-[22px] w-[22px] shrink-0 rounded"
                />
                <span className="flex-1 font-medium">{adapter.name}</span>
                <span className="text-[11px] text-stone-500">
                  {usable ? "Detected" : "Install"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
