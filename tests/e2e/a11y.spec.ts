import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { solve } from "./helpers";

const PAGES = ["/", "/calculator", "/calculator/physics", "/calculator/physics/hukum-ohm", "/calculator/finance/cicilan-pinjaman", "/grafik", "/verifikasi", "/panduan", "/tentang", "/riwayat"];

// @axe-core/playwright bundles its own playwright-core typings; the runtime API is compatible.
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]["page"];

async function audit(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page: page as unknown as AxePage }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  return serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test.describe("accessibility (axe, WCAG 2.1 AA)", () => {
  for (const path of PAGES) {
    test(`no serious violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      expect(await audit(page)).toEqual([]);
    });
  }

  test("no serious violations in a result view (light and dark)", async ({ page }) => {
    await page.goto("/");
    await solve(page, "x^2 - 5x + 6 = 0");
    expect(await audit(page)).toEqual([]);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    expect(await audit(page)).toEqual([]);
  });
});
