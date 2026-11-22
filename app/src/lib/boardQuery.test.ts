import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { byNewest, matchesBounty } from "@/lib/boardQuery";
import { DEVNET_USDC_MINT } from "@/lib/tokens";
import { testBounty } from "@/test/bountyFixture";

const creator = new PublicKey(new Uint8Array(32).fill(3));
const winner = new PublicKey(new Uint8Array(32).fill(4));
const otherMint = new PublicKey(new Uint8Array(32).fill(5));

describe("byNewest", () => {
  it("orders bounties from the newest id to the oldest", () => {
    const older = testBounty({ id: 10, title: "Older" });
    const newer = testBounty({ id: 30, title: "Newer" });
    const middle = testBounty({ id: 20, title: "Middle" });

    const titles = [older, newer, middle]
      .sort(byNewest)
      .map((bounty) => bounty.account.title);

    expect(titles).toEqual(["Newer", "Middle", "Older"]);
  });
});

describe("matchesBounty", () => {
  const bounty = testBounty({
    id: 1,
    title: "Landing page",
    description: "Ship the hero section",
    creator,
    winner,
    status: "completed",
  });

  it("matches a blank search", () => {
    expect(matchesBounty(bounty, "   ", "all")).toBe(true);
  });

  it("matches title, description, creator, and winner without case", () => {
    expect(matchesBounty(bounty, "landing", "all")).toBe(true);
    expect(matchesBounty(bounty, "HERO", "all")).toBe(true);
    expect(matchesBounty(bounty, creator.toBase58().slice(0, 8), "all")).toBe(true);
    expect(matchesBounty(bounty, winner.toBase58().slice(-8), "all")).toBe(true);
  });

  it("rejects text that is not on the bounty", () => {
    expect(matchesBounty(bounty, "missing phrase", "all")).toBe(false);
  });

  it("keeps an unset winner out of the search text", () => {
    const open = testBounty({ id: 2, title: "Open work", creator });
    expect(matchesBounty(open, PublicKey.default.toBase58(), "all")).toBe(false);
  });

  it("filters SOL, Devnet USDC, and any other mint", () => {
    const sol = testBounty({ id: 1, title: "Sol" });
    const usdc = testBounty({ id: 2, title: "Usdc", mint: DEVNET_USDC_MINT });
    const other = testBounty({ id: 3, title: "Other", mint: otherMint });

    expect(matchesBounty(sol, "", "sol")).toBe(true);
    expect(matchesBounty(usdc, "", "sol")).toBe(false);
    expect(matchesBounty(usdc, "", "usdc")).toBe(true);
    expect(matchesBounty(sol, "", "usdc")).toBe(false);
    expect(matchesBounty(other, "", "other")).toBe(true);
    expect(matchesBounty(usdc, "", "other")).toBe(false);
    expect(matchesBounty(sol, "", "other")).toBe(false);
  });

  it("filters settled bounties by status and leaves open bounties out", () => {
    const cancelled = testBounty({ id: 4, title: "Cancelled", status: "cancelled" });
    const expired = testBounty({ id: 5, title: "Expired", status: "expired" });
    const open = testBounty({ id: 6, title: "Open", status: "open" });

    expect(matchesBounty(bounty, "", "all", "completed")).toBe(true);
    expect(matchesBounty(bounty, "", "all", "cancelled")).toBe(false);
    expect(matchesBounty(cancelled, "", "all", "cancelled")).toBe(true);
    expect(matchesBounty(expired, "", "all", "expired")).toBe(true);
    expect(matchesBounty(open, "", "all", "completed")).toBe(false);
    expect(matchesBounty(open, "", "all", "all")).toBe(true);
  });
});
