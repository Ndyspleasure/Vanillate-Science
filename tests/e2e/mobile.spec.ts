import { expect, test } from "@playwright/test";
import { solve } from "./helpers";

test.describe("mobile", () => {
  test("navigation menu and solver work on a phone", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Buka menu" }).click();
    await page.getByRole("navigation", { name: "Navigasi utama (seluler)" }).getByRole("link", { name: "Kalkulator" }).click();
    await expect(page).toHaveURL(/\/calculator$/);
    await page.goto("/");
    await solve(page, "2x + 5 = 15");
    await expect(page.getByRole("article")).toContainText("5");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
