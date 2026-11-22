import { describe, expect, it } from "vitest";
import { collectHistoryMoves } from "@/lib/historyNotice";
import { testBounty } from "@/test/bountyFixture";

function keysOf(rows: { publicKey: { toBase58(): string } }[]): Set<string> {
  return new Set(rows.map((row) => row.publicKey.toBase58()));
}

describe("collectHistoryMoves", () => {
  const open = testBounty({ id: 1, title: "Write the spec" });
  const other = testBounty({ id: 2, title: "Review the spec" });
  const openKeys = keysOf([open, other]);

  it("records the open board on the first fetch without a notice", () => {
    const move = collectHistoryMoves([open], null, new Set());

    expect(move.noticed).toBe(0);
    expect(move.announced).toEqual([]);
    expect(move.nextOpenKeys).toEqual(keysOf([open]));
  });

  it("counts a bounty that left the open board and is now settled", () => {
    const settled = testBounty({
      id: 1,
      title: "  Write the spec  ",
      status: "completed",
      publicKey: open.publicKey,
    });

    const move = collectHistoryMoves([settled, other], openKeys, new Set());

    expect(move.noticed).toBe(1);
    expect(move.announced).toEqual([settled]);
    expect(move.nextOpenKeys).toEqual(keysOf([other]));
  });

  it("counts several settled bounties together", () => {
    const first = testBounty({
      id: 1,
      title: "Write the spec",
      status: "cancelled",
      publicKey: open.publicKey,
    });
    const second = testBounty({
      id: 2,
      title: "Review the spec",
      status: "expired",
      publicKey: other.publicKey,
    });

    const move = collectHistoryMoves([second, first], openKeys, new Set());

    expect(move.noticed).toBe(2);
    expect(move.announced).toEqual([first, second]);
  });

  it("counts a bounty this wallet settled, without announcing it again", () => {
    const settled = testBounty({
      id: 1,
      title: "Write the spec",
      status: "completed",
      publicKey: open.publicKey,
    });
    const own = new Set([open.publicKey.toBase58()]);

    const move = collectHistoryMoves([settled, other], openKeys, own);

    expect(move.noticed).toBe(1);
    expect(move.announced).toEqual([]);
    expect(move.ownSettled.has(open.publicKey.toBase58())).toBe(false);
  });

  it("ignores an open key that disappeared without a settled account", () => {
    const move = collectHistoryMoves([other], openKeys, new Set());

    expect(move.noticed).toBe(0);
    expect(move.announced).toEqual([]);
  });

  it("drops an own-settled mark when that bounty is still open", () => {
    const own = new Set([open.publicKey.toBase58()]);

    const move = collectHistoryMoves([open, other], openKeys, own);

    expect(move.noticed).toBe(0);
    expect(move.ownSettled.has(open.publicKey.toBase58())).toBe(false);
  });
});
