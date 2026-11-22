import type { Page, Route } from "@playwright/test";

type RpcItem = { id?: unknown; method?: string };

/**
 * Answers the Devnet HTTP RPC. Program-account reads stay empty unless a test
 * asks the next one to fail, or holds them until `release`.
 */
export async function stubDevnetRpc(page: Page) {
  let failProgramAccounts = false;
  let hold = false;
  let releaseHold: () => void = () => {};
  let held = Promise.resolve();

  const armHold = () => {
    hold = true;
    held = new Promise<void>((resolve) => {
      releaseHold = () => {
        hold = false;
        resolve();
      };
    });
  };

  await page.route(
    (url) => url.hostname === "api.devnet.solana.com",
    async (route: Route) => {
      const payload = route.request().postDataJSON() as RpcItem | RpcItem[];
      const items = Array.isArray(payload) ? payload : [payload];
      if (hold && items.some((item) => item.method === "getProgramAccounts")) {
        await held;
      }
      const replies = items.map((item) => reply(item, failProgramAccounts));
      if (failProgramAccounts && items.some((item) => item.method === "getProgramAccounts")) {
        failProgramAccounts = false;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(Array.isArray(payload) ? replies : replies[0]),
      });
    }
  );

  return {
    holdProgramAccounts: armHold,
    releaseProgramAccounts: () => releaseHold(),
    failNextProgramAccounts: () => {
      failProgramAccounts = true;
    },
  };
}

function reply(item: RpcItem, failProgramAccounts: boolean) {
  const id = item.id ?? null;
  if (item.method === "getProgramAccounts" && failProgramAccounts) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: "socket down" },
    };
  }
  if (item.method === "getBalance") {
    return {
      jsonrpc: "2.0",
      id,
      result: { context: { slot: 1 }, value: 2_000_000_000 },
    };
  }
  if (item.method === "getProgramAccounts") {
    return { jsonrpc: "2.0", id, result: [] };
  }
  return { jsonrpc: "2.0", id, result: null };
}
