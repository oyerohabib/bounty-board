"use client";

import { useCallback, useEffect, useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import WalletButton from "@/components/WalletButton";
import {
  BN,
  BountyAccount,
  getProgram,
  getProvider,
  bountyPda,
  vaultPda,
  statusLabel,
  SystemProgram,
} from "@/lib/program";

type Meta = { title: string; description: string };

function loadMeta(): Record<string, Meta> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem("bounty_meta") ?? "{}");
  } catch {
    return {};
  }
}

function saveMeta(key: string, meta: Meta) {
  const all = loadMeta();
  all[key] = meta;
  localStorage.setItem("bounty_meta", JSON.stringify(all));
}

export default function BountyBoard() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();

  const [bounties, setBounties] = useState<BountyAccount[]>([]);
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [busy, setBusy] = useState(false);
  const [txMsg, setTxMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balanceSol, setBalanceSol] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amountSol, setAmountSol] = useState("0.1");
  const [days, setDays] = useState("7");
  const [submitUri, setSubmitUri] = useState("");

  const refresh = useCallback(async () => {
    if (!wallet || !publicKey) {
      setBounties([]);
      setBalanceSol(null);
      return;
    }
    try {
      const lamports = await connection.getBalance(publicKey);
      setBalanceSol(lamports / 1e9);
      const program = getProgram(getProvider(wallet));
      const rows = await program.account.bounty.all();
      setBounties(rows as unknown as BountyAccount[]);
      setMeta(loadMeta());
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to fetch bounties");
    }
  }, [wallet, publicKey, connection]);

  useEffect(() => {
    void refresh();
  }, [refresh, connected]);

  async function withTx(label: string, fn: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setTxMsg(null);
    try {
      const sig = await fn();
      setTxMsg(`${label}: ${sig}`);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
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

    const bountyId = new BN(Date.now());
    const amount = new BN(Math.round(parseFloat(amountSol) * 1e9));
    const deadline = new BN(
      Math.floor(Date.now() / 1000) + parseInt(days, 10) * 86400
    );
    const [bounty] = bountyPda(publicKey, bountyId);
    const [vault] = vaultPda(bounty);

    await withTx("Created", async () => {
      const program = getProgram(getProvider(wallet));
      const sig = await program.methods
        .createBounty(bountyId, amount, deadline)
        .accountsPartial({
          creator: publicKey,
          bounty,
          vault,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      saveMeta(bounty.toBase58(), { title, description });
      setTitle("");
      setDescription("");
      return sig;
    });
  }

  async function onSubmit(row: BountyAccount) {
    if (!wallet || !publicKey || !submitUri) return;
    await withTx("Submitted", async () => {
      const program = getProgram(getProvider(wallet));
      return program.methods
        .submitWork(submitUri)
        .accountsPartial({
          hunter: publicKey,
          bounty: row.publicKey,
        })
        .rpc();
    });
  }

  async function onAccept(row: BountyAccount) {
    if (!wallet || !publicKey) return;
    const [vault] = vaultPda(row.publicKey);
    await withTx("Accepted", async () => {
      const program = getProgram(getProvider(wallet));
      return program.methods
        .accept()
        .accountsPartial({
          creator: publicKey,
          hunter: row.account.hunter,
          bounty: row.publicKey,
          vault,
        })
        .rpc();
    });
  }

  async function onCancel(row: BountyAccount) {
    if (!wallet || !publicKey) return;
    const [vault] = vaultPda(row.publicKey);
    await withTx("Cancelled", async () => {
      const program = getProgram(getProvider(wallet));
      return program.methods
        .cancel()
        .accountsPartial({
          creator: publicKey,
          bounty: row.publicKey,
          vault,
        })
        .rpc();
    });
  }

  async function onExpire(row: BountyAccount) {
    if (!wallet || !publicKey) return;
    const [vault] = vaultPda(row.publicKey);
    await withTx("Expired refund", async () => {
      const program = getProgram(getProvider(wallet));
      return program.methods
        .expireRefund()
        .accountsPartial({
          caller: publicKey,
          creator: row.account.creator,
          bounty: row.publicKey,
          vault,
        })
        .rpc();
    });
  }

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-teal-700">
            Solana · Devnet
          </p>
          <h1 className="mt-1 font-display text-4xl text-stone-900">
            Bounty Board
          </h1>
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
                placeholder="Title (stored locally)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <textarea
                className="rounded border border-stone-300 bg-white px-3 py-2"
                placeholder="Description (stored locally)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
                className="text-sm text-teal-800 underline"
              >
                Refresh
              </button>
            </div>

            <label className="mb-6 block text-sm text-stone-600">
              Submission URI (for hunters)
              <input
                className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2"
                placeholder="https://github.com/you/pr/12"
                value={submitUri}
                onChange={(e) => setSubmitUri(e.target.value)}
              />
            </label>

            {bounties.length === 0 ? (
              <p className="text-stone-500">No bounties on-chain yet.</p>
            ) : (
              <ul className="space-y-6">
                {bounties.map((b) => {
                  const key = b.publicKey.toBase58();
                  const m = meta[key];
                  const status = statusLabel(b.account.status);
                  const isCreator =
                    publicKey && b.account.creator.equals(publicKey);
                  const deadline = b.account.deadline.toNumber();
                  const expired = now >= deadline;
                  const openish =
                    status === "Open" || status === "Submitted";

                  return (
                    <li
                      key={key}
                      className="border-b border-stone-200 pb-6 last:border-0"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="text-lg font-medium text-stone-900">
                            {m?.title ?? `Bounty #${b.account.bountyId.toString()}`}
                          </h3>
                          <p className="mt-1 text-sm text-stone-600">
                            {m?.description ?? "No local description"}
                          </p>
                        </div>
                        <span className="rounded bg-stone-100 px-2 py-1 text-xs uppercase tracking-wide text-stone-700">
                          {status}
                        </span>
                      </div>
                      <dl className="mt-3 grid gap-1 text-sm text-stone-600 sm:grid-cols-2">
                        <div>
                          Reward:{" "}
                          <strong className="text-stone-900">
                            {(b.account.amount.toNumber() / 1e9).toFixed(3)} SOL
                          </strong>
                        </div>
                        <div>
                          Deadline:{" "}
                          {new Date(deadline * 1000).toLocaleString()}
                        </div>
                        <div className="sm:col-span-2 break-all">
                          Creator: {b.account.creator.toBase58()}
                        </div>
                        {status === "Submitted" && (
                          <>
                            <div className="sm:col-span-2 break-all">
                              Hunter: {b.account.hunter.toBase58()}
                            </div>
                            <div className="sm:col-span-2 break-all">
                              Proof: {b.account.submissionUri}
                            </div>
                          </>
                        )}
                      </dl>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {openish && !isCreator && (
                          <button
                            type="button"
                            disabled={busy || !submitUri || expired}
                            onClick={() => void onSubmit(b)}
                            className="rounded border border-teal-800 px-3 py-1.5 text-sm text-teal-900 disabled:opacity-40"
                          >
                            Submit work
                          </button>
                        )}
                        {isCreator && status === "Submitted" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onAccept(b)}
                            className="rounded bg-teal-800 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                          >
                            Accept & pay
                          </button>
                        )}
                        {isCreator && openish && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onCancel(b)}
                            className="rounded border border-stone-400 px-3 py-1.5 text-sm text-stone-700 disabled:opacity-40"
                          >
                            Cancel & refund
                          </button>
                        )}
                        {openish && expired && (
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
                      <p className="mt-2 text-xs text-stone-400 break-all">
                        {key} · slot hint via {connection.rpcEndpoint}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
