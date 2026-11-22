// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBoardChromeState,
  setBoardChromeState,
} from "@/lib/boardChromeState";
import { testBounty } from "@/test/bountyFixture";

const harness = vi.hoisted(() => {
  const state: { onAccountChange: null | (() => void) } = {
    onAccountChange: null,
  };
  const connection = {
    getBalance: vi.fn(),
    rpcEndpoint: "https://api.devnet.solana.com",
    onProgramAccountChange: (_programId: unknown, callback: () => void) => {
      state.onAccountChange = callback;
      return 1;
    },
    removeProgramAccountChangeListener: vi.fn(),
  };
  return {
    state,
    connection,
    fetchBoardAccounts: vi.fn(),
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => (
    <a href={href}>{children as string}</a>
  ),
}));

vi.mock("@solana/wallet-adapter-react", async () => {
  const { PublicKey } = await import("@solana/web3.js");
  const walletKey = new PublicKey(Uint8Array.from({ length: 32 }, () => 7));
  return {
    useConnection: () => ({ connection: harness.connection }),
    useAnchorWallet: () => ({ publicKey: walletKey }),
    useWallet: () => ({
      publicKey: walletKey,
      connected: true,
      sendTransaction: vi.fn(),
    }),
  };
});

vi.mock("@/lib/toast", () => ({
  notifyError: harness.notifyError,
  notifySuccess: harness.notifySuccess,
}));

vi.mock("@/lib/program", async () => {
  const actual = await vi.importActual<typeof import("@/lib/program")>(
    "@/lib/program"
  );
  return {
    ...actual,
    getProvider: vi.fn(() => ({})),
    getProgram: vi.fn(() => ({})),
    fetchBoardAccounts: harness.fetchBoardAccounts,
  };
});

import BountyBoard from "@/components/BountyBoard";

const emptyBoard = { bounties: [], submissions: [], skippedStale: 0 };

function pendingFetch() {
  let rejectFetch: (error: Error) => void = () => {};
  const promise = new Promise<typeof emptyBoard>((_resolve, reject) => {
    rejectFetch = reject;
  });
  return { promise, rejectFetch };
}

beforeEach(() => {
  harness.connection.getBalance.mockResolvedValue(2_000_000_000);
  harness.fetchBoardAccounts.mockReset();
  harness.notifyError.mockReset();
  harness.notifySuccess.mockReset();
  harness.state.onAccountChange = null;
  setBoardChromeState({ balanceSol: null, historyNotice: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BountyBoard refresh", () => {
  it("reloads from the socket without a Refresh label or an error toast", async () => {
    harness.fetchBoardAccounts.mockResolvedValue(emptyBoard);
    render(<BountyBoard />);
    await screen.findByRole("button", { name: "Refresh" });
    const calls = harness.fetchBoardAccounts.mock.calls.length;

    const pending = pendingFetch();
    harness.fetchBoardAccounts.mockImplementation(() => pending.promise);
    harness.notifyError.mockClear();

    harness.state.onAccountChange?.();

    await waitFor(() => {
      expect(harness.fetchBoardAccounts.mock.calls.length).toBeGreaterThan(calls);
    });
    const quietButton = screen.getByRole("button", { name: "Refresh" });
    expect(quietButton.hasAttribute("disabled")).toBe(false);
    expect(harness.notifyError).not.toHaveBeenCalled();

    pending.rejectFetch(new Error("socket down"));
    await waitFor(() => {
      expect(console.error).toHaveBeenCalled();
    });
    expect(harness.notifyError).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Refresh" }).hasAttribute("disabled")).toBe(
      false
    );
  });

  it("shows Refreshing and toasts when a manual refresh fails", async () => {
    harness.fetchBoardAccounts.mockResolvedValue(emptyBoard);
    const user = userEvent.setup();
    render(<BountyBoard />);
    await screen.findByRole("button", { name: "Refresh" });

    const pending = pendingFetch();
    harness.fetchBoardAccounts.mockImplementation(() => pending.promise);
    harness.notifyError.mockClear();

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    const refreshing = await screen.findByRole("button", { name: "Refreshing…" });
    expect(refreshing.hasAttribute("disabled")).toBe(true);

    pending.rejectFetch(new Error("socket down"));
    await waitFor(() => {
      expect(harness.notifyError).toHaveBeenCalledWith(
        "Failed to fetch bounties",
        "socket down"
      );
    });
    expect(screen.getByRole("button", { name: "Refresh" }).hasAttribute("disabled")).toBe(
      false
    );
  });

  it("raises the History count when an open bounty becomes settled", async () => {
    const open = testBounty({ id: 1, title: "Write the spec" });
    harness.fetchBoardAccounts.mockResolvedValueOnce({
      bounties: [open],
      submissions: [],
      skippedStale: 0,
    });
    const user = userEvent.setup();
    render(<BountyBoard />);
    await screen.findByRole("heading", { name: "Write the spec" });
    expect(getBoardChromeState().historyNotice).toBe(0);

    const settled = testBounty({
      id: 1,
      title: "Write the spec",
      status: "completed",
      publicKey: open.publicKey,
      creator: open.account.creator,
    });
    harness.fetchBoardAccounts.mockResolvedValueOnce({
      bounties: [settled],
      submissions: [],
      skippedStale: 0,
    });
    harness.notifySuccess.mockClear();

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => {
      expect(getBoardChromeState().historyNotice).toBe(1);
    });
    expect(harness.notifySuccess).toHaveBeenCalledWith(
      "Moved to History",
      "Write the spec"
    );
    expect(screen.queryByRole("heading", { name: "Write the spec" })).toBeNull();
  });
});
