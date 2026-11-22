import type { Page } from "@playwright/test";

/** Installed before page scripts so the Phantom adapter polls it as Detected. */
export async function installFakePhantom(page: Page) {
  await page.addInitScript(() => {
    const bytes = new Uint8Array(32).fill(7);
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const wallet = {
      isPhantom: true,
      isConnected: false,
      publicKey: null as { toBytes(): Uint8Array } | null,
      connect: async () => {
        wallet.isConnected = true;
        wallet.publicKey = { toBytes: () => bytes };
      },
      disconnect: async () => {
        wallet.isConnected = false;
        wallet.publicKey = null;
      },
      signTransaction: async (transaction: unknown) => transaction,
      signAllTransactions: async (transactions: unknown[]) => transactions,
      on(event: string, listener: (...args: unknown[]) => void) {
        const set = listeners.get(event) ?? new Set();
        set.add(listener);
        listeners.set(event, set);
      },
      off(event: string, listener: (...args: unknown[]) => void) {
        listeners.get(event)?.delete(listener);
      },
    };
    const phantomWindow = window as Window & {
      isPhantomInstalled?: boolean;
      phantom?: { solana?: typeof wallet };
      solana?: typeof wallet;
    };
    phantomWindow.isPhantomInstalled = true;
    phantomWindow.phantom = { solana: wallet };
    phantomWindow.solana = wallet;
  });
}

export async function connectPhantom(page: Page) {
  await page.getByRole("button", { name: "Connect wallet" }).click();
  const phantom = page.getByRole("menuitem", { name: /Phantom/ });
  await phantom.getByText("Detected").waitFor();
  await phantom.click();
}
