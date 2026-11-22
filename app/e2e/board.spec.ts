import { expect, test } from "@playwright/test";
import { connectPhantom, installFakePhantom } from "./fakePhantom";
import { stubDevnetRpc } from "./rpc";

test.beforeEach(async ({ page }) => {
  await installFakePhantom(page);
});

test("a connected wallet can move the asset choice with the arrow keys", async ({
  page,
}) => {
  await stubDevnetRpc(page);
  await page.goto("/");
  await connectPhantom(page);

  await expect(page.getByText("Select asset")).toBeVisible();
  const sol = page.getByRole("radio", { name: /^SOL/ });
  const usdc = page.getByRole("radio", { name: /^USDC/ });
  await expect(sol).toBeChecked();
  await sol.focus();
  await page.keyboard.press("ArrowRight");
  await expect(usdc).toBeChecked();
  await expect(sol).not.toBeChecked();
});

test("the open board shows filters and an empty list", async ({ page }) => {
  await stubDevnetRpc(page);
  await page.goto("/open");
  await connectPhantom(page);

  await expect(page.getByRole("searchbox", { name: "Search bounties" })).toBeVisible();
  await expect(page.getByRole("button", { name: "All assets", pressed: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "SOL" })).toBeVisible();
  await expect(page.getByRole("button", { name: "USDC" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Other SPL" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
  await expect(page.getByText("No open bounties on-chain.")).toBeVisible();
});

test("history shows status filters and an empty list", async ({ page }) => {
  await stubDevnetRpc(page);
  await page.goto("/history");
  await connectPhantom(page);

  await expect(page.getByRole("button", { name: "All statuses", pressed: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Completed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Expired" })).toBeVisible();
  await expect(page.getByText("No settled bounties yet.")).toBeVisible();
});

test("the open board shows a skeleton until the account read returns", async ({ page }) => {
  const rpc = await stubDevnetRpc(page);
  rpc.holdProgramAccounts();
  await page.goto("/open");
  await connectPhantom(page);

  await expect(page.getByRole("list", { name: "Loading bounties" })).toBeVisible();
  rpc.releaseProgramAccounts();
  await expect(page.getByText("No open bounties on-chain.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Loading bounties" })).toHaveCount(0);
});

test("a failed refresh toasts and then returns the Refresh label", async ({ page }) => {
  const rpc = await stubDevnetRpc(page);
  await page.goto("/open");
  await connectPhantom(page);
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();

  rpc.failNextProgramAccounts();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Failed to fetch bounties")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
});
