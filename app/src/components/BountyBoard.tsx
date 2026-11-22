"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import AssetPicker, { type AssetChoice } from "@/components/AssetPicker";
import BountyFilters from "@/components/BountyFilters";
import BountyListSkeleton from "@/components/BountyListSkeleton";
import {
  BN,
  BountyAccount,
  SubmissionAccount,
  getProgram,
  getProvider,
  fetchBoardAccounts,
  bountyPda,
  vaultPda,
  submissionPda,
  uriClaimPda,
  uriHashBytes,
  statusLabel,
  isOpenStatus,
  isSolBounty,
  formatBaseUnits,
  parseBaseUnits,
  formatTxError,
  rpcWithSim,
  type RpcOutcome,
  MAX_URI_LEN,
  SUBMISSION_RENT_SOL,
  SystemProgram,
} from "@/lib/program";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  DEVNET_USDC_MINT,
  TOKEN_PROGRAM_ID,
  USDC_DECIMALS,
  assetLabel,
  associatedTokenAddress,
  fetchMintDecimals,
  fetchTokenBalance,
  formatAssetAmount,
} from "@/lib/tokens";
import { notifySuccess, notifyError } from "@/lib/toast";
import {
  accountSwitchFrom,
  isAccountSwitching,
} from "@/lib/accountSwitch";
import {
  byNewest,
  matchesBounty,
  type AssetFilter,
  type StatusFilter,
} from "@/lib/boardQuery";
import { setBoardChromeState } from "@/lib/boardChromeState";

const HOME_PREVIEW = 5;
const DEADLINE_PRESETS = [1, 3, 7, 14] as const;

function padTime(value: number): string {
  return String(value).padStart(2, "0");
}

/** `datetime-local` value in the viewer's local time. */
function toDatetimeLocal(date: Date): string {
  return `${date.getFullYear()}-${padTime(date.getMonth() + 1)}-${padTime(date.getDate())}T${padTime(date.getHours())}:${padTime(date.getMinutes())}`;
}

function deadlineFromDays(days: number): string {
  return toDatetimeLocal(new Date(Date.now() + days * 86400 * 1000));
}

function deadlineAtLabel(value: string): string {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) {
    return "Choose the exact date and time work must be in by.";
  }
  if (parsed.getTime() <= Date.now()) {
    return "That time has already passed.";
  }
  return `Closes ${parsed.toLocaleString()}.`;
}

function formatSubmittedAt(ts: BN | number): string {
  const n = typeof ts === "number" ? ts : ts.toNumber();
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString();
}

function shortAddress(base58: string): string {
  return `${base58.slice(0, 4)}…${base58.slice(-4)}`;
}

/** Survives remounts during disconnect/reconnect so switch toasts still fire. */
let lastAccountKeyForToast: string | null = null;

export default function BountyBoard() {
  const pathname = usePathname();
  const view =
    pathname === "/history"
      ? "history"
      : pathname === "/open"
        ? "open"
        : "home";
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey, connected, sendTransaction } = useWallet();
  const accountKey = publicKey?.toBase58() ?? null;
  const prevAccountKey = useRef<string | null>(null);

  const [bounties, setBounties] = useState<BountyAccount[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [boardReady, setBoardReady] = useState(false);
  const [historyNotice, setHistoryNotice] = useState(0);
  /** Open bounty keys after the last successful fetch. Null until that baseline exists. */
  const openKeysRef = useRef<Set<string> | null>(null);
  const loadedAccountRef = useRef<string | null>(null);
  /** Settled by this wallet, so the success toast already said they are in History. */
  const ownSettledRef = useRef<Set<string>>(new Set());
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [balanceSol, setBalanceSol] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<BN | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("0.1");
  const [deadlineInput, setDeadlineInput] = useState("");
  const [deadlineMin, setDeadlineMin] = useState("");
  const [assetChoice, setAssetChoice] = useState<AssetChoice>("sol");
  const [query, setQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState<AssetFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [customMint, setCustomMint] = useState("");
  const [customDecimals, setCustomDecimals] = useState<number | null>(null);
  const [customMintState, setCustomMintState] = useState<
    "idle" | "loading" | "ready" | "missing"
  >("idle");
  /** Per-bounty submission URI drafts (keyed by bounty pubkey). */
  const [submitUris, setSubmitUris] = useState<Record<string, string>>({});

  const submissionsByBounty = useMemo(() => {
    const map = new Map<string, SubmissionAccount[]>();
    for (const s of submissions) {
      const key = s.account.bounty.toBase58();
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort(
        (a, b) =>
          a.account.submittedAt.toNumber() - b.account.submittedAt.toNumber()
      );
    }
    return map;
  }, [submissions]);

  const bountyByKey = useMemo(() => {
    const map = new Map<string, BountyAccount>();
    for (const b of bounties) map.set(b.publicKey.toBase58(), b);
    return map;
  }, [bounties]);

  const openBounties = useMemo(
    () => bounties.filter((b) => isOpenStatus(b.account.status)).sort(byNewest),
    [bounties]
  );

  const historyBounties = useMemo(
    () => bounties.filter((b) => !isOpenStatus(b.account.status)).sort(byNewest),
    [bounties]
  );

  const filteredOpen = useMemo(
    () => openBounties.filter((b) => matchesBounty(b, query, assetFilter)),
    [openBounties, query, assetFilter]
  );

  const filteredHistory = useMemo(
    () =>
      historyBounties.filter((b) =>
        matchesBounty(b, query, assetFilter, statusFilter)
      ),
    [historyBounties, query, assetFilter, statusFilter]
  );

  const splMint = useMemo(() => {
    if (assetChoice === "sol") return null;
    if (assetChoice === "usdc") return DEVNET_USDC_MINT;
    try {
      return new PublicKey(customMint.trim());
    } catch {
      return null;
    }
  }, [assetChoice, customMint]);

  const activeDecimals =
    assetChoice === "sol" ? 9 : assetChoice === "usdc" ? USDC_DECIMALS : customDecimals;

  const reclaimable = useMemo(() => {
    if (!publicKey) return [] as SubmissionAccount[];
    return submissions.filter((s) => {
      if (!s.account.hunter.equals(publicKey)) return false;
      const bounty = bountyByKey.get(s.account.bounty.toBase58());
      if (!bounty || isOpenStatus(bounty.account.status)) return false;
      // Winner's submission stays for history
      if (
        !bounty.account.winner.equals(PublicKey.default) &&
        bounty.account.winner.equals(publicKey)
      ) {
        return false;
      }
      return true;
    });
  }, [submissions, publicKey, bountyByKey]);

  const refresh = useCallback(async () => {
    if (!wallet || !publicKey) {
      // Keep board visible during Switch account reconnect (same or new key).
      if (isAccountSwitching()) return;
      setBounties([]);
      setSubmissions([]);
      setBalanceSol(null);
      setTokenBalance(null);
      setBoardReady(false);
      setHistoryNotice(0);
      openKeysRef.current = null;
      loadedAccountRef.current = null;
      ownSettledRef.current.clear();
      return;
    }
    setRefreshing(true);
    try {
      const lamports = await connection.getBalance(publicKey);
      setBalanceSol(lamports / 1e9);
      if (splMint) {
        setTokenBalance(await fetchTokenBalance(connection, splMint, publicKey));
      } else {
        setTokenBalance(null);
      }
      const account = publicKey.toBase58();
      if (loadedAccountRef.current !== account) {
        openKeysRef.current = null;
        setBoardReady(false);
      }
      const program = getProgram(getProvider(wallet));
      const { bounties: bountyRows, submissions: submissionRows } =
        await fetchBoardAccounts(program);
      noteHistoryMoves(bountyRows);
      loadedAccountRef.current = account;
      setBounties(bountyRows);
      setSubmissions(submissionRows);
    } catch (e) {
      console.error(e);
      notifyError(
        "Failed to fetch bounties",
        e instanceof Error ? e.message : undefined
      );
    } finally {
      setRefreshing(false);
      if (wallet && publicKey) setBoardReady(true);
    }
  }, [wallet, publicKey, connection, splMint]);

  function noteHistoryMoves(rows: BountyAccount[]) {
    const openNow = new Set(
      rows
        .filter((bounty) => isOpenStatus(bounty.account.status))
        .map((bounty) => bounty.publicKey.toBase58())
    );
    const previous = openKeysRef.current;
    openKeysRef.current = openNow;
    if (!previous) return;

    const settled = new Map(
      rows
        .filter((bounty) => !isOpenStatus(bounty.account.status))
        .map((bounty) => [bounty.publicKey.toBase58(), bounty] as const)
    );
    const announced: BountyAccount[] = [];
    let noticed = 0;
    for (const key of previous) {
      if (openNow.has(key)) {
        ownSettledRef.current.delete(key);
        continue;
      }
      const row = settled.get(key);
      if (!row) continue;
      noticed += 1;
      if (ownSettledRef.current.has(key)) {
        ownSettledRef.current.delete(key);
        continue;
      }
      announced.push(row);
    }
    if (announced.length === 1) {
      const title = announced[0].account.title.trim();
      notifySuccess(
        "Moved to History",
        title || "A bounty is now completed, cancelled, or expired."
      );
    } else if (announced.length > 1) {
      notifySuccess(
        "Moved to History",
        `${announced.length} bounties are now in History.`
      );
    }
    if (noticed > 0 && pathnameRef.current !== "/history") {
      setHistoryNotice((count) => count + noticed);
    }
  }

  useEffect(() => {
    if (assetChoice !== "custom" || !splMint) {
      setCustomDecimals(null);
      setCustomMintState("idle");
      return;
    }
    let cancelled = false;
    setCustomDecimals(null);
    setCustomMintState("loading");
    fetchMintDecimals(connection, splMint)
      .then((decimals) => {
        if (cancelled) return;
        setCustomDecimals(decimals);
        setCustomMintState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setCustomDecimals(null);
        setCustomMintState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [assetChoice, connection, splMint]);

  useEffect(() => {
    // No-op switch: reconnect landed on the same key — skip board refresh.
    if (
      accountKey &&
      isAccountSwitching() &&
      accountSwitchFrom() === accountKey
    ) {
      return;
    }
    void refresh();
  }, [refresh, connected, accountKey]);

  useEffect(() => {
    if (view === "history") setHistoryNotice(0);
  }, [view]);

  useEffect(() => {
    setBoardChromeState({ historyNotice });
  }, [historyNotice]);

  useEffect(() => {
    if (!connected) {
      setBoardChromeState({ balanceSol: null });
      return;
    }
    if (balanceSol !== null) setBoardChromeState({ balanceSol });
  }, [balanceSol, connected]);

  useEffect(() => {
    setDeadlineInput((current) => current || deadlineFromDays(7));
    setDeadlineMin(toDatetimeLocal(new Date()));
  }, []);

  useEffect(() => {
    if (!accountKey) {
      if (isAccountSwitching()) return;
      setSubmitUris({});
      return;
    }
    if (isAccountSwitching() && accountSwitchFrom() === accountKey) return;
    setSubmitUris({});
  }, [accountKey]);

  useEffect(() => {
    const prev = lastAccountKeyForToast ?? prevAccountKey.current;
    if (!accountKey) return;
    if (prev && prev !== accountKey) {
      notifySuccess("Account switched", shortAddress(accountKey));
    }
    prevAccountKey.current = accountKey;
    lastAccountKeyForToast = accountKey;
  }, [accountKey]);

  async function withTx(
    label: string,
    fn: () => Promise<RpcOutcome>,
    historyKey?: string
  ) {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.ok) {
        notifyError(result.message);
        return;
      }
      if (historyKey) ownSettledRef.current.add(historyKey);
      notifySuccess(
        label,
        historyKey ? `Now in History. ${result.signature}` : result.signature
      );
      await refresh();
    } catch (e) {
      const msg = formatTxError(e);
      if (/user rejected|rejected the request/i.test(msg)) {
        notifyError("Request cancelled in wallet.");
      } else {
        console.error(e);
        notifyError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet || !publicKey) return;

    if (assetChoice === "custom" && !splMint) {
      notifyError("Enter a valid SPL mint address.");
      return;
    }
    if (activeDecimals == null) {
      notifyError(
        "Could not read that mint",
        "It must be a classic SPL token (the same program USDC uses)."
      );
      return;
    }

    const amount = parseBaseUnits(amountInput, activeDecimals);
    if (!amount) {
      notifyError(
        "Enter a valid amount greater than 0",
        `At most ${activeDecimals} decimal places.`
      );
      return;
    }

    const rentBuffer = 0.01;
    if (assetChoice === "sol") {
      const needed = amount.toNumber() / 1e9 + rentBuffer;
      if (balanceSol !== null && balanceSol < needed) {
        notifyError(
          "Not enough SOL",
          `Need ~${needed.toFixed(3)} SOL (escrow + rent); you have ${balanceSol.toFixed(4)} SOL.`
        );
        return;
      }
    } else if (splMint) {
      if (balanceSol !== null && balanceSol < rentBuffer) {
        notifyError(
          "Not enough SOL for rent",
          `Token escrow still needs ~${rentBuffer} SOL for the vault and fees; you have ${balanceSol?.toFixed(4) ?? "0"} SOL.`
        );
        return;
      }
      if (tokenBalance !== null && tokenBalance.lt(amount)) {
        notifyError(
          "Not enough tokens",
          `Need ${formatBaseUnits(amount, activeDecimals)} ${assetLabel(splMint)}; you have ${formatBaseUnits(tokenBalance, activeDecimals)}.`
        );
        return;
      }
    }

    const deadlineAt = new Date(deadlineInput);
    if (!deadlineInput || Number.isNaN(deadlineAt.getTime())) {
      notifyError("Pick a deadline.");
      return;
    }
    if (deadlineAt.getTime() <= Date.now()) {
      notifyError("Deadline has to be in the future.");
      return;
    }

    const bountyId = new BN(Date.now());
    const deadline = new BN(Math.floor(deadlineAt.getTime() / 1000));
    const [bounty] = bountyPda(publicKey, bountyId);
    const [vault] = vaultPda(bounty);

    await withTx("Created", async () => {
      const program = getProgram(getProvider(wallet));
      const builder =
        assetChoice === "sol" || !splMint
          ? program.methods
              .createBounty(bountyId, amount, deadline, title.trim(), description.trim())
              .accountsPartial({
                creator: publicKey,
                bounty,
                vault,
                systemProgram: SystemProgram.programId,
              })
          : program.methods
              .createTokenBounty(
                bountyId,
                amount,
                deadline,
                title.trim(),
                description.trim()
              )
              .accountsPartial({
                creator: publicKey,
                mint: splMint,
                bounty,
                vault,
                creatorTokenAccount: associatedTokenAddress(splMint, publicKey),
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
              });
      const result = await rpcWithSim(
        builder,
        publicKey,
        connection,
        sendTransaction
      );
      if (result.ok) {
        setTitle("");
        setDescription("");
      }
      return result;
    });
  }

  function setSubmitUriFor(bountyKey: string, value: string) {
    setSubmitUris((prev) => ({ ...prev, [bountyKey]: value }));
  }

  async function onSubmit(row: BountyAccount) {
    if (!wallet || !publicKey) return;
    const bountyKey = row.publicKey.toBase58();
    const existingMine = submissions.find(
      (s) =>
        s.account.bounty.equals(row.publicKey) &&
        s.account.hunter.equals(publicKey)
    );
    const uri = (
      bountyKey in submitUris
        ? submitUris[bountyKey]
        : (existingMine?.account.uri ?? "")
    ).trim();
    if (!uri) {
      notifyError("Paste a submission URI for this bounty first.");
      return;
    }
    if (existingMine && uri === existingMine.account.uri.trim()) {
      notifyError("Nothing to update — change the URI first.");
      return;
    }
    if (uri.length > MAX_URI_LEN) {
      notifyError(
        "Submission URI is too long",
        `Max ${MAX_URI_LEN} characters.`
      );
      return;
    }
    if (balanceSol !== null && balanceSol < SUBMISSION_RENT_SOL) {
      notifyError(
        "Not enough SOL for rent",
        `Hunter wallet needs ~${SUBMISSION_RENT_SOL} SOL free (you have ${balanceSol.toFixed(4)} SOL).`
      );
      return;
    }

    const [submission] = submissionPda(row.publicKey, publicKey);
    const [uriClaim] = uriClaimPda(row.publicKey, uri);
    const hash = uriHashBytes(uri);

    await withTx("Submitted", async () => {
      const program = getProgram(getProvider(wallet));
      let oldUriClaim: PublicKey | null = null;
      try {
        const existing = await program.account.submission.fetchNullable(submission);
        if (existing && existing.uri !== uri) {
          oldUriClaim = uriClaimPda(row.publicKey, existing.uri)[0];
        }
      } catch {
        /* first submit */
      }

      const builder = program.methods
        .submitWork(uri, hash)
        .accountsPartial({
          hunter: publicKey,
          bounty: row.publicKey,
          submission,
          uriClaim,
          oldUriClaim,
          systemProgram: SystemProgram.programId,
        });
      const result = await rpcWithSim(
        builder,
        publicKey,
        connection,
        sendTransaction
      );
      if (result.ok) {
        setSubmitUris((prev) => {
          const next = { ...prev };
          delete next[bountyKey];
          return next;
        });
      }
      return result;
    });
  }

  async function onAccept(row: BountyAccount, sub: SubmissionAccount) {
    if (!wallet || !publicKey) return;
    const [vault] = vaultPda(row.publicKey);
    const hunter = new PublicKey(sub.account.hunter.toString());
    const spl = !isSolBounty(row.account);
    await withTx("Accepted", async () => {
      const program = getProgram(getProvider(wallet));
      const builder = spl
        ? program.methods.acceptToken().accountsPartial({
            creator: publicKey,
            hunter,
            mint: row.account.mint,
            bounty: row.publicKey,
            submission: sub.publicKey,
            vault,
            hunterTokenAccount: associatedTokenAddress(row.account.mint, hunter),
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
        : program.methods.accept().accountsPartial({
            creator: publicKey,
            hunter,
            bounty: row.publicKey,
            submission: sub.publicKey,
            vault,
          });
      return rpcWithSim(builder, publicKey, connection, sendTransaction);
    }, row.publicKey.toBase58());
  }

  async function onCancel(row: BountyAccount) {
    if (!wallet || !publicKey) return;
    const [vault] = vaultPda(row.publicKey);
    const spl = !isSolBounty(row.account);
    await withTx("Cancelled", async () => {
      const program = getProgram(getProvider(wallet));
      const builder = spl
        ? program.methods.cancelToken().accountsPartial({
            creator: publicKey,
            mint: row.account.mint,
            bounty: row.publicKey,
            vault,
            creatorTokenAccount: associatedTokenAddress(
              row.account.mint,
              publicKey
            ),
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
        : program.methods.cancel().accountsPartial({
            creator: publicKey,
            bounty: row.publicKey,
            vault,
          });
      return rpcWithSim(builder, publicKey, connection, sendTransaction);
    }, row.publicKey.toBase58());
  }

  async function onExpire(row: BountyAccount) {
    if (!wallet || !publicKey) return;
    const [vault] = vaultPda(row.publicKey);
    const spl = !isSolBounty(row.account);
    await withTx("Expired refund", async () => {
      const program = getProgram(getProvider(wallet));
      const builder = spl
        ? program.methods.expireRefundToken().accountsPartial({
            caller: publicKey,
            creator: row.account.creator,
            mint: row.account.mint,
            bounty: row.publicKey,
            vault,
            creatorTokenAccount: associatedTokenAddress(
              row.account.mint,
              row.account.creator
            ),
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
        : program.methods.expireRefund().accountsPartial({
            caller: publicKey,
            creator: row.account.creator,
            bounty: row.publicKey,
            vault,
          });
      return rpcWithSim(builder, publicKey, connection, sendTransaction);
    }, row.publicKey.toBase58());
  }

  async function onReclaim(sub: SubmissionAccount) {
    if (!wallet || !publicKey) return;
    const [uriClaim] = uriClaimPda(sub.account.bounty, sub.account.uri);
    const hash = uriHashBytes(sub.account.uri);
    await withTx("Reclaimed", async () => {
      const program = getProgram(getProvider(wallet));
      const builder = program.methods
        .reclaimSubmission(hash)
        .accountsPartial({
          hunter: publicKey,
          bounty: sub.account.bounty,
          submission: sub.publicKey,
          uriClaim,
        });
      return rpcWithSim(builder, publicKey, connection, sendTransaction);
    });
  }

  const now = Math.floor(Date.now() / 1000);

  function renderBountyCard(b: BountyAccount, opts: { history?: boolean }) {
    const key = b.publicKey.toBase58();
    const status = statusLabel(b.account.status);
    const isCreator = publicKey && b.account.creator.equals(publicKey);
    const deadline = b.account.deadline.toNumber();
    const expired = now >= deadline;
    const isOpen = isOpenStatus(b.account.status);
    const subs = submissionsByBounty.get(key) ?? [];
    const hasWinner =
      !b.account.winner.equals(PublicKey.default) &&
      status === "Completed";
    const mySub = publicKey
      ? subs.find((s) => s.account.hunter.equals(publicKey))
      : undefined;
    // Prefer explicit draft; otherwise prefill with this hunter's existing URI.
    const cardUri =
      key in submitUris ? submitUris[key] : (mySub?.account.uri ?? "");
    const trimmedUri = cardUri.trim();
    const uriUnchanged =
      !!mySub && trimmedUri === mySub.account.uri.trim();
    const canSubmit =
      !!trimmedUri && !expired && !busy && !uriUnchanged;

    return (
      <li
        key={key}
        className="bounty-card border-b border-stone-200 pb-6 last:border-0"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-medium text-stone-900">
              {b.account.title || `Bounty #${b.account.bountyId.toString()}`}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              {b.account.description || "No description"}
            </p>
          </div>
          <span className="rounded bg-stone-100 px-2 py-1 text-xs uppercase tracking-wide text-stone-700">
            {status}
            {isOpen && subs.length > 0
              ? ` · ${subs.length} submission${subs.length === 1 ? "" : "s"}`
              : ""}
          </span>
        </div>
        <dl className="mt-3 grid gap-1 text-sm text-stone-600 sm:grid-cols-2">
          <div>
            Reward:{" "}
            <strong className="text-stone-900">
              {formatAssetAmount(
                b.account.amount,
                b.account.decimals,
                b.account.mint
              )}
            </strong>
          </div>
          <div className="sm:text-right">
            Deadline: {new Date(deadline * 1000).toLocaleString()}
          </div>
          {hasWinner && (
            <div className="sm:col-span-2 break-all">
              Winner: {b.account.winner.toBase58()}
            </div>
          )}
          <div className="sm:col-span-2 break-all">
            Creator: {b.account.creator.toBase58()}
          </div>
        </dl>

        {subs.length > 0 && (
          <ul className="mt-3 space-y-2 rounded border border-stone-200 bg-white/60 p-3">
            {subs.map((s) => {
              const mine = publicKey && s.account.hunter.equals(publicKey);
              const isWinner =
                hasWinner && b.account.winner.equals(s.account.hunter);
              return (
                <li
                  key={s.publicKey.toBase58()}
                  className="flex flex-wrap items-start justify-between gap-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-stone-800">
                      <a
                        href={s.account.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-800 underline"
                      >
                        {s.account.uri}
                      </a>
                      {mine ? " · you" : ""}
                      {isWinner ? " · winner" : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      Submitted {formatSubmittedAt(s.account.submittedAt)}
                    </p>
                    <p className="mt-0.5 break-all text-xs text-stone-500">
                      {s.account.hunter.toBase58()}
                    </p>
                  </div>
                  {isCreator && isOpen && !opts.history && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onAccept(b, s)}
                      className="shrink-0 rounded bg-teal-800 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                    >
                      Accept & pay
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!opts.history && isOpen && !isCreator && (
          <div className="mt-4 space-y-2">
            <label className="block text-sm text-stone-600">
              Your submission URI
              <input
                className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2"
                placeholder="https://github.com/you/pr/12"
                value={cardUri}
                onChange={(e) => setSubmitUriFor(key, e.target.value)}
                maxLength={MAX_URI_LEN}
                disabled={expired}
              />
              <span className="mt-1 block text-xs text-stone-500">
                Unique per bounty (max {MAX_URI_LEN} chars). Needs ≥
                {SUBMISSION_RENT_SOL} SOL for rent.
              </span>
            </label>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void onSubmit(b)}
              className="rounded border border-teal-800 px-3 py-1.5 text-sm text-teal-900 disabled:opacity-40"
            >
              {mySub ? "Update submission" : "Submit work"}
            </button>
            {uriUnchanged && (
              <p className="text-xs text-stone-500">
                Change the URI to enable an update.
              </p>
            )}
          </div>
        )}

        {!opts.history && (
          <div className="mt-3 flex flex-wrap gap-2">
            {isCreator && isOpen && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onCancel(b)}
                className="rounded border border-stone-400 px-3 py-1.5 text-sm text-stone-700 disabled:opacity-40"
              >
                Cancel & refund
              </button>
            )}
            {isOpen && expired && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onExpire(b)}
                className="rounded border border-amber-700 px-3 py-1.5 text-sm text-amber-900 disabled:opacity-40"
              >
                Expire refund
              </button>
            )}
          </div>
        )}
        <p className="mt-2 text-xs text-stone-400 break-all">
          {key} · {connection.rpcEndpoint}
        </p>
      </li>
    );
  }

  return (
    <>
      {connected && balanceSol !== null && balanceSol < 0.05 && (
        <p className="board-banner mb-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Your connected wallet needs Devnet SOL (this is separate from the CLI
          deploy wallet). Copy your address from the wallet menu → fund it at{" "}
          <a
            className="underline"
            href="https://faucet.solana.com/"
            target="_blank"
            rel="noreferrer"
          >
            faucet.solana.com
          </a>{" "}
          → reload and try again.
        </p>
      )}

      {!connected ? (
        <div className="animate-fade-up space-y-3 text-stone-600">
          <p>Connect a Solana wallet from the button above to start.</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              Install a browser wallet (Phantom, Solflare, or Backpack) if you
              don’t have one yet — use <strong>Install</strong> in the picker.
            </li>
            <li>Open the extension, create or import a wallet.</li>
            <li>
              Switch the wallet network to <strong>Devnet</strong> (often under
              Developer / Testnet settings).
            </li>
            <li>
              Click <strong>Connect wallet</strong>, pick your extension, and
              approve the popup.
            </li>
          </ol>
        </div>
      ) : (
        <div className="animate-fade-up">
          {view === "home" && (
          <>
          <section className="board-section mb-12 border-t border-stone-200 pt-8">
            <h2 className="font-display text-2xl text-stone-900">Post a bounty</h2>
            <form onSubmit={onCreate} className="mt-4 grid gap-3">
              <input
                className="rounded border border-stone-300 bg-white px-3 py-2"
                placeholder="Title (on-chain, max 64 chars)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={64}
                required
              />
              <textarea
                className="rounded border border-stone-300 bg-white px-3 py-2"
                placeholder="Description (on-chain, max 280 chars)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={280}
                rows={3}
                required
              />
              <AssetPicker value={assetChoice} onChange={setAssetChoice} />
              {assetChoice === "custom" && (
                <label className="text-sm text-stone-600">
                  Mint address
                  <input
                    className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 font-mono text-sm"
                    placeholder="Token mint public key"
                    value={customMint}
                    onChange={(e) => setCustomMint(e.target.value)}
                    spellCheck={false}
                    required
                  />
                </label>
              )}
              {assetChoice !== "sol" && splMint && (
                <p className="text-sm text-stone-600">
                  Balance:{" "}
                  <strong className="text-stone-900">
                    {tokenBalance && activeDecimals != null
                      ? `${formatBaseUnits(tokenBalance, activeDecimals)} ${assetLabel(splMint)}`
                      : "…"}
                  </strong>
                  {customMintState === "missing"
                    ? " · mint not found on this cluster"
                    : ""}
                </p>
              )}
              <div className="grid grid-cols-1 items-start gap-x-3 gap-y-1 sm:grid-cols-4">
                <label
                  htmlFor="bounty-amount"
                  className="text-sm text-stone-600 sm:col-start-1 sm:row-start-1"
                >
                  Amount ({assetChoice === "sol" ? "SOL" : assetChoice === "usdc" ? "USDC" : "tokens"})
                </label>
                <input
                  id="bounty-amount"
                  className="box-border h-10 max-h-10 w-full min-w-0 self-start rounded border border-stone-300 bg-white px-3 sm:col-start-1 sm:row-start-2"
                  type="text"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  required
                />
                <label
                  htmlFor="bounty-deadline"
                  className="mt-2 text-sm text-stone-600 sm:col-span-3 sm:col-start-2 sm:row-start-1 sm:mt-0"
                >
                  Deadline
                </label>
                <input
                  id="bounty-deadline"
                  className="box-border h-10 max-h-10 w-full min-w-0 self-start rounded border border-stone-300 bg-white px-3 sm:col-span-3 sm:col-start-2 sm:row-start-2"
                  type="datetime-local"
                  value={deadlineInput}
                  min={deadlineMin || undefined}
                  onChange={(e) => setDeadlineInput(e.target.value)}
                  required
                />
                <div className="sm:col-span-3 sm:col-start-2 sm:row-start-3">
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {DEADLINE_PRESETS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setDeadlineInput(deadlineFromDays(days))}
                      className="text-xs text-teal-800 underline"
                    >
                      In {days} day{days === 1 ? "" : "s"}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  {deadlineAtLabel(deadlineInput)}
                </p>
                </div>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-teal-800 px-4 py-2 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {busy ? "Confirm in wallet…" : "Create & escrow"}
              </button>
            </form>
          </section>

          <section
            className="board-section border-t border-stone-200 pt-8"
            style={{ animationDelay: "60ms" }}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl text-stone-900">Open board</h2>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/open"
                  className="rounded border border-teal-800 px-3 py-1.5 text-sm text-teal-900 hover:bg-teal-50"
                >
                  View all open bounties
                </Link>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={refreshing}
                  className="text-sm text-teal-800 underline disabled:opacity-50"
                >
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>

            {!boardReady ? (
              <BountyListSkeleton count={2} />
            ) : openBounties.length === 0 ? (
              <p className="animate-fade-in text-stone-500">No open bounties on-chain.</p>
            ) : (
              <>
                <ul className="stagger-children space-y-6">
                  {openBounties.slice(0, HOME_PREVIEW).map((b) => renderBountyCard(b, {}))}
                </ul>
                {openBounties.length > HOME_PREVIEW && (
                  <p className="mt-4 text-sm text-stone-500">
                    Showing the {HOME_PREVIEW} newest.
                  </p>
                )}
              </>
            )}
          </section>
          </>
          )}

        {view === "open" && (
          <section className="board-section border-t border-stone-200 pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl text-stone-900">Open board</h2>
                <p className="mt-1 text-sm text-stone-600">
                  Newest bounties first. Still accepting work.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="text-sm text-teal-800 underline disabled:opacity-50"
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <BountyFilters
              query={query}
              onQuery={setQuery}
              asset={assetFilter}
              onAsset={setAssetFilter}
            />
            {!boardReady ? (
              <div className="mt-6">
                <BountyListSkeleton count={3} />
              </div>
            ) : openBounties.length === 0 ? (
              <p className="animate-fade-in mt-4 text-stone-500">No open bounties on-chain.</p>
            ) : filteredOpen.length === 0 ? (
              <p className="animate-fade-in mt-4 text-stone-500">No bounties match that search.</p>
            ) : (
              <ul className="stagger-children mt-6 space-y-6">
                {filteredOpen.map((b) => renderBountyCard(b, {}))}
              </ul>
            )}
          </section>
        )}

        {view === "history" && (
          <section className="board-section border-t border-stone-200 pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl text-stone-900">History</h2>
                <p className="mt-1 text-sm text-stone-600">
                  Completed, cancelled, and expired bounties stay on-chain with their
                  submissions. Newest first.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="text-sm text-teal-800 underline disabled:opacity-50"
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <BountyFilters
              query={query}
              onQuery={setQuery}
              asset={assetFilter}
              onAsset={setAssetFilter}
              status={statusFilter}
              onStatus={setStatusFilter}
            />
            {!boardReady ? (
              <div className="mt-6">
                <BountyListSkeleton count={3} />
              </div>
            ) : historyBounties.length === 0 ? (
              <p className="animate-fade-in mt-4 text-stone-500">No settled bounties yet.</p>
            ) : filteredHistory.length === 0 ? (
              <p className="animate-fade-in mt-4 text-stone-500">No bounties match that search.</p>
            ) : (
              <ul className="stagger-children mt-6 space-y-6">
                {filteredHistory.map((b) => renderBountyCard(b, { history: true }))}
              </ul>
            )}
          </section>
        )}

        {view === "history" && reclaimable.length > 0 && (
            <section
              className="board-section mt-10 border-t border-stone-200 pt-8"
              style={{ animationDelay: "180ms" }}
            >
              <h2 className="font-display text-2xl text-stone-900">
                Reclaim submission rent
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                Non-winning submissions on settled bounties. Close them to recover
                rent (and free the URI claim).
              </p>
              <ul className="stagger-children mt-4 space-y-3">
                {reclaimable.map((s) => (
                  <li
                    key={s.publicKey.toBase58()}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span className="break-all text-stone-700">
                      {s.account.uri}{" "}
                      <span className="text-stone-400">
                        · {formatSubmittedAt(s.account.submittedAt)} · bounty{" "}
                        {s.account.bounty.toBase58().slice(0, 8)}…
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onReclaim(s)}
                      className="rounded border border-stone-400 px-3 py-1.5 text-stone-700 disabled:opacity-40"
                    >
                      Reclaim rent
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
