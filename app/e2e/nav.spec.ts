import { expect, test } from "@playwright/test";

const routes = [
  { href: "/", name: /Post/ },
  { href: "/open", name: /Open board/ },
  { href: "/history", name: /History/ },
] as const;

test("signed-out pages keep the connect prompt and the current nav item", async ({
  page,
}) => {
  for (const route of routes) {
    await page.goto(route.href);
    await expect(page.getByRole("link", { name: route.name })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(
      page.getByText("Connect a Solana wallet from the button above to start.")
    ).toBeVisible();
    await expect(page.getByText("Select asset")).toHaveCount(0);
  }
});

test("the nav underline slides with the same indicator", async ({ page }) => {
  await page.goto("/");
  const indicator = page.locator(".nav-indicator");
  await expect(indicator).toHaveAttribute("style", /translateX\(0%\)/);

  await page.getByRole("link", { name: /Open board/ }).click();
  await expect(page).toHaveURL(/\/open$/);
  await expect(indicator).toHaveAttribute("style", /translateX\(100%\)/);

  await page.getByRole("link", { name: /History/ }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(indicator).toHaveAttribute("style", /translateX\(200%\)/);

  await page.getByRole("link", { name: /Post/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(indicator).toHaveAttribute("style", /translateX\(0%\)/);
});
