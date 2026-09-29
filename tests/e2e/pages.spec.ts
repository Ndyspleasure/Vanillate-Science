import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

test.describe("other pages", () => {
  test("graphing calculator draws curves and presets", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/grafik");
    const plot = page.locator("svg[role=img]");
    await expect(plot.locator("path[stroke]").first()).toBeVisible();
    await page.getByRole("button", { name: "Kardioid" }).click();
    await expect(page.getByText("r = 1 + cos(theta)")).toBeVisible();
    await page.getByRole("button", { name: "Perbesar" }).click();
    expect(errors).toEqual([]);
  });

  test("check-my-work finds the first wrong line and carried errors", async ({ page }) => {
    await page.goto("/verifikasi");
    await page.getByRole("button", { name: "Periksa" }).click();
    const report = page.getByRole("region", { name: "Hasil pemeriksaan" });
    await expect(report).toContainText("Kesalahan pertama ada di langkah 1");
    await expect(report).toContainText("membawa kesalahan dari langkah 1");
  });

  test("theme toggle switches to dark mode and persists", async ({ page }) => {
    await page.goto("/tentang");
    const html = page.locator("html");
    const toggle = page.getByRole("button", { name: /Tema:/ });
    for (let i = 0; i < 3; i++) {
      if ((await html.getAttribute("data-theme")) === "dark") break;
      await toggle.click();
    }
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("health endpoint runs the engine self-test", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("SEO: sitemap, robots, metadata and structured data", async ({ page, request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/calculator/math/persamaan-kuadrat");
    expect((await request.get("/robots.txt")).status()).toBe(200);
    await page.goto("/calculator/math/persamaan-kuadrat");
    await expect(page).toHaveTitle(/Kalkulator Persamaan Kuadrat/);
    const canonical = await page.locator("link[rel=canonical]").getAttribute("href");
    expect(canonical).toMatch(/\/calculator\/math\/persamaan-kuadrat$/);
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.join(" ")).toContain('"FAQPage"');
    expect(ld.join(" ")).toContain('"BreadcrumbList"');
  });

  test("unknown pages return 404", async ({ page }) => {
    const res = await page.goto("/calculator/math/tidak-ada");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
  });

  test("security headers are set", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
  });
});
