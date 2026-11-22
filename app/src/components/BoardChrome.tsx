"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletButton from "@/components/WalletButton";
import {
  getBoardChromeServerState,
  getBoardChromeState,
  subscribeBoardChrome,
} from "@/lib/boardChromeState";

const NAV = [
  { href: "/", label: "Post", hint: "Fund a new bounty" },
  { href: "/open", label: "Open board", hint: "Bounties still taking work" },
  { href: "/history", label: "History", hint: "Completed, cancelled, and expired" },
] as const;

export default function BoardChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { balanceSol, historyNotice } = useSyncExternalStore(
    subscribeBoardChrome,
    getBoardChromeState,
    getBoardChromeServerState
  );
  const activeIndex = Math.max(
    0,
    NAV.findIndex((item) => item.href === pathname)
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-teal-700">
              Solana · Devnet
            </p>
            <div className="mt-1 flex items-center gap-2.5">
              <Image
                src="/logo-mark.svg"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 shrink-0"
                priority
              />
              <h1 className="font-display text-4xl leading-none text-stone-900">
                Bounty Board
              </h1>
            </div>
            <p className="mt-2 max-w-lg text-stone-600">
              Post a bounty, lock SOL or an SPL token in escrow, and pay hunters when work lands.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <WalletButton />
            {balanceSol !== null && (
              <p className="animate-fade-in text-sm text-stone-600">
                Devnet: <strong>{balanceSol.toFixed(4)} SOL</strong>
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
        </div>
        <nav aria-label="Board" className="relative mt-6 grid w-full grid-cols-3 border-b border-stone-300">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const notice = item.href === "/history" ? historyNotice : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block w-full px-1 pb-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-800 ${
                  active ? "text-stone-900" : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {item.label}
                  {notice > 0 && (
                    <span
                      className="rounded-full bg-teal-800 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
                      aria-label={`${notice} new`}
                    >
                      {notice}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs font-normal leading-snug text-stone-500">
                  {item.hint}
                </span>
              </Link>
            );
          })}
          <span
            aria-hidden
            className="nav-indicator pointer-events-none absolute -bottom-px left-0 h-0.5 w-1/3 bg-teal-800"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
        </nav>
      </header>
      {children}
    </div>
  );
}
