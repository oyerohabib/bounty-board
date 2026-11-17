"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import WalletButton from "@/components/WalletButton";
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
  formatTxError,
  rpcWithSim,
  type RpcOutcome,
  MAX_URI_LEN,
  SUBMISSION_RENT_SOL,
  SystemProgram,
} from "@/lib/program";

function formatSubmittedAt(ts: BN | number): string {
  const n = typeof ts === "number" ? ts : ts.toNumber();
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString();
}

export default function BountyBoard() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey, connected, sendTransaction } = useWallet();

  const [bounties, setBounties] = useState<BountyAccount[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [txMsg, setTxMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staleNote, setStaleNote] = useState<string | null>(null);
  const [balanceSol, setBalanceSol] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amountSol, setAmountSol] = useState("0.1");
  const [days, setDays] = useState("7");
  const [submitUri, setSubmitUri] = useState("");

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
    () => bounties.filter((b) => isOpenStatus(b.account.status)),
    [bounties]
  );

  const historyBounties = useMemo(
    () => bounties.filter((b) => !isOpenStatus(b.account.status)),
    [bounties]
  );

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
      setBounties([]);
      setSubmissions([]);
      setBalanceSol(null);
      return;
    }
    setRefreshing(true);
    try {
      const lamports = await connection.getBalance(publicKey);
      setBalanceSol(lamports / 1e9);
      const program = getProgram(getProvider(wallet));
      const {
        bounties: bountyRows,
        submissions: submissionRows,
        skippedStale,
      } = await fetchBoardAccounts(program);
      setBounties(bountyRows);
      setSubmissions(submissionRows);
      setStaleNote(
        skippedStale > 0
          ? `${skippedStale} older on-chain account${skippedStale === 1 ? "" : "s"} hidden (pre-upgrade layout). Create a new bounty to use the board.`
          : null
      );
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to fetch bounties");
    } finally {
      setRefreshing(false);
    }
  }, [wallet, publicKey, connection]);

  useEffect(() => {
    void refresh();
  }, [refresh, connected]);

  async function withTx(label: string, fn: () => Promise<RpcOutcome>) {
    setBusy(true);
    setError(null);
    setTxMsg(null);
    try {
      const result = await fn();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTxMsg(`${label}: ${result.signature}`);
      await refresh();
    } catch (e) {
      const msg = formatTxError(e);
      if (/user rejected|rejected the request/i.test(msg)) {
        setError("Request cancelled in Phantom.");
      } else {
        console.error(e);
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet || !publicKey) return;

    const amountLamports = Math.round(parseFloat(amountSol) * 1e9);
    if (!Number.isFinite(amountLamports) || amountLamports <= 0) {
      setError("Enter a valid SOL amount greater than 0.");
      return;
    }
    const rentBuffer = 0.01;
    if (balanceSol !== null && balanceSol < amountLamports / 1e9 + rentBuffer) {
      setError(
        `Not enough SOL. Need ~${(amountLamports / 1e9 + rentBuffer).toFixed(3)} SOL (escrow + rent); you have ${balanceSol.toFixed(4)} SOL.`
      );
      return;
    }

    const bountyId = new BN(Date.now());
    const amount = new BN(amountLamports);
    const deadline = new BN(
      Math.floor(Date.now() / 1000) + parseInt(days, 10) * 86400
    );
    const [bounty] = bountyPda(publicKey, bountyId);
    const [vault] = vaultPda(bounty);

    await withTx("Created", async () => {
      const program = getProgram(getProvider(wallet));
      const builder = program.methods
        .createBounty(bountyId, amount, deadline, title.trim(), description.trim())
        .accountsPartial({
          creator: publicKey,
          bounty,
          vault,
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

  async function onSubmit(row: BountyAccount) {
    if (!wallet || !publicKey) return;
    const uri = submitUri.trim();
    if (!uri) {
      setError("Paste a submission URI first.");
      return;
    }
    if (uri.length > MAX_URI_LEN) {
      setError(`Submission URI is too long (max ${MAX_URI_LEN} characters).`);
      return;
    }
    if (balanceSol !== null && balanceSol < SUBMISSION_RENT_SOL) {
      setError(
        `Hunter wallet needs ~${SUBMISSION_RENT_SOL} SOL free for submission + URI claim rent (you have ${balanceSol.toFixed(4)} SOL).`
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
      if (result.ok) setSubmitUri("");
      return result;
    });
  }

  async function onAccept(row: BountyAccount, sub: SubmissionAccount) {
    if (!wallet || !publicKey) return;
    const [vault] = vaultPda(row.publicKey);
    const hunter = new PublicKey(sub.account.hunter.toString());
    await withTx("Accepted", async () => {
      const program = getProgram(getProvider(wallet));
      const builder = program.methods.accept().accountsPartial({
        creator: publicKey,
        hunter,
        bounty: row.publicKey,
        submission: sub.publicKey,
        vault,
      });
      return rpcWithSim(builder, publicKey, connection, sendTransaction);
    });
  }

  async function onCancel(row: BountyAccount) {
    if (!wallet || !publicKey) return;
    const [vault] = vaultPda(row.publicKey);
    await withTx("Cancelled", async () => {
      const program = getProgram(getProvider(wallet));
      const builder = program.methods.cancel().accountsPartial({
        creator: publicKey,
        bounty: row.publicKey,
        vault,
      });
      return rpcWithSim(builder, publicKey, connection, sendTransaction);
    });
  }

  async function onExpire(row: BountyAccount) {
    if (!wallet || !publicKey) return;
    const [vault] = vaultPda(row.publicKey);
    await withTx("Expired refund", async () => {
      const program = getProgram(getProvider(wallet));
      const builder = program.methods.expireRefund().accountsPartial({
        caller: publicKey,
        creator: row.account.creator,
        bounty: row.publicKey,
        vault,
      });
      return rpcWithSim(builder, publicKey, connection, sendTransaction);
    });
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

    return (
      <li
        key={key}
        className="border-b border-stone-200 pb-6 last:border-0"
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
              {(b.account.amount.toNumber() / 1e9).toFixed(3)} SOL
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

        {!opts.history && (
          <div className="mt-3 flex flex-wrap gap-2">
            {isOpen && !isCreator && (
              <button
                type="button"
                disabled={busy || !submitUri || expired}
                onClick={() => void onSubmit(b)}
                className="rounded border border-teal-800 px-3 py-1.5 text-sm text-teal-900 disabled:opacity-40"
              >
                Submit work
              </button>
            )}
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
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-teal-700">
            Solana · Devnet
          </p>
          <div className="mt-1 flex items-center gap-2.5">
            <img
              src="/logo-mark.svg"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 shrink-0"
            />
            <h1 className="font-display text-4xl leading-none text-stone-900">
              Bounty Board
            </h1>
          </div>
          <p className="mt-2 max-w-md text-stone-600">
            Post a bounty, lock SOL in escrow, and pay hunters when work lands.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <WalletButton />
          {connected && balanceSol !== null && (
            <p className="text-sm text-stone-600">
              Phantom Devnet: <strong>{balanceSol.toFixed(4)} SOL</strong>
              {balanceSol < 0.05 && (
                <>
                  {" · "}
                  <a
                    className="text-teal-800 underline"
                    href="https://faucet.solana.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get Devnet SOL
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      </header>

      {connected && balanceSol !== null && balanceSol < 0.05 && (
        <p className="mb-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Your connected Phantom wallet needs Devnet SOL (this is separate from
          the CLI deploy wallet). Copy your address from Phantom → fund it at{" "}
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

      {txMsg && (
        <p className="mb-4 break-all rounded bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {txMsg}
        </p>
      )}
      {error && (
        <p className="mb-4 break-all rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {staleNote && (
        <p className="mb-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {staleNote}
        </p>
      )}

      {!connected ? (
        <div className="space-y-3 text-stone-600">
          <p>Connect Phantom from the button above to start.</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              Install the{" "}
              <a
                className="text-teal-800 underline"
                href="https://phantom.com/download"
                target="_blank"
                rel="noreferrer"
              >
                Phantom browser extension
              </a>{" "}
              (Chrome / Brave / Edge / Firefox) — not the mobile app.
            </li>
            <li>Open the extension, create or import a wallet.</li>
            <li>
              In Phantom: Settings → Developer Settings → enable{" "}
              <strong>Testnet Mode</strong>, then select <strong>Devnet</strong>.
            </li>
            <li>
              Reload this page, click <strong>Select Wallet → Phantom</strong>. A
              popup from the extension should appear (not phantom.com).
            </li>
          </ol>
          <p className="text-sm text-stone-500">
            If it still opens phantom.com, the extension isn’t installed or isn’t
            enabled for this browser.
          </p>
        </div>
      ) : (
        <>
          <section className="mb-12 border-t border-stone-200 pt-8">
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
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-stone-600">
                  Amount (SOL)
                  <input
                    className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2"
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={amountSol}
                    onChange={(e) => setAmountSol(e.target.value)}
                    required
                  />
                </label>
                <label className="text-sm text-stone-600">
                  Deadline (days)
                  <input
                    className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2"
                    type="number"
                    min="1"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    required
                  />
                </label>
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

          <section className="border-t border-stone-200 pt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl text-stone-900">Open board</h2>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="text-sm text-teal-800 underline disabled:opacity-50"
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <label className="mb-6 block text-sm text-stone-600">
              Submission URI (for hunters)
              <input
                className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2"
                placeholder="https://github.com/you/pr/12"
                value={submitUri}
                onChange={(e) => setSubmitUri(e.target.value)}
                maxLength={MAX_URI_LEN}
              />
              <span className="mt-1 block text-xs text-stone-500">
                Each URI must be unique per bounty (max {MAX_URI_LEN} chars).
                Hunter needs ≥{SUBMISSION_RENT_SOL} SOL for rent. Creator picks
                which submission to pay.
              </span>
            </label>

            {openBounties.length === 0 ? (
              <p className="text-stone-500">No open bounties on-chain.</p>
            ) : (
              <ul className="space-y-6">
                {openBounties.map((b) => renderBountyCard(b, {}))}
              </ul>
            )}
          </section>

          <section className="mt-10 border-t border-stone-200 pt-8">
            <h2 className="font-display text-2xl text-stone-900">History</h2>
            <p className="mt-1 text-sm text-stone-600">
              Completed, cancelled, and expired bounties stay on-chain with their
              submissions.
            </p>
            {historyBounties.length === 0 ? (
              <p className="mt-4 text-stone-500">No settled bounties yet.</p>
            ) : (
              <ul className="mt-4 space-y-6">
                {historyBounties.map((b) =>
                  renderBountyCard(b, { history: true })
                )}
              </ul>
            )}
          </section>

          {reclaimable.length > 0 && (
            <section className="mt-10 border-t border-stone-200 pt-8">
              <h2 className="font-display text-2xl text-stone-900">
                Reclaim submission rent
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                Non-winning submissions on settled bounties. Close them to recover
                rent (and free the URI claim).
              </p>
              <ul className="mt-4 space-y-3">
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
        </>
      )}
    </div>
  );
}
