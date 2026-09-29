import { expect, test } from "@playwright/test";
import { trackErrors } from "./helpers";

test.describe("calculator pages", () => {
  test("formula calculator solves for any variable with units", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/calculator/physics/energi-kinetik");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kalkulator Energi kinetik");
    // server-rendered worked example is present without interaction
    await expect(page.getByRole("heading", { name: "Contoh soal dan pembahasan" })).toBeVisible();
    await page.getByText("massa", { exact: true }).first().click();
    await page.getByRole("textbox", { name: /energi kinetik/ }).fill("200");
    await page.getByRole("textbox", { name: /kelajuan/ }).fill("36");
    await page.getByLabel("Satuan kelajuan").selectOption("km/h");
    await page.getByRole("button", { name: /Hitung massa/ }).click();
    const result = page.getByRole("article");
    await expect(result).toContainText("m = 4");
    await expect(result.getByText("Terverifikasi").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("loan calculator produces an amortisation table", async ({ page }) => {
    await page.goto("/calculator/finance/cicilan-pinjaman");
    await page.getByRole("button", { name: "Hitung" }).click();
    const result = page.getByRole("article");
    await expect(result).toContainText("2.866.956,25");
    await expect(result.locator("table tbody tr").first()).toBeVisible();
  });

  test("tool forms prefill from shared links", async ({ page }) => {
    await page.goto("/calculator/chemistry/massa-molar?formula=H2SO4");
    await expect(page.getByRole("article")).toContainText("98.07");
  });

  test("unit converter handles affine temperatures", async ({ page }) => {
    await page.goto("/calculator/units/konversi-suhu");
    await page.getByLabel("Nilai").fill("100");
    await page.getByLabel("Dari satuan").fill("°C");
    await page.getByLabel("Ke satuan").fill("°F");
    await page.getByRole("button", { name: "Konversi" }).click();
    await expect(page.getByRole("article")).toContainText("212");
  });

  test("dimension mismatches are rejected with an explanation", async ({ page }) => {
    await page.goto("/calculator/units/konversi-satuan");
    await page.getByLabel("Dari satuan").fill("m");
    await page.getByLabel("Ke satuan").fill("kg");
    await page.getByRole("button", { name: "Konversi" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Dimensi");
  });

  test("periodic table shows element details", async ({ page }) => {
    await page.goto("/calculator/chemistry/tabel-periodik");
    await page.getByRole("button", { name: /Emas \(Au\)/ }).click();
    await expect(page.getByRole("heading", { name: /Emas/ })).toBeVisible();
    await expect(page.locator("dd", { hasText: "196.966570" })).toBeVisible();
  });

  test("calculator search finds pages", async ({ page }) => {
    await page.goto("/calculator");
    await page.getByRole("searchbox").fill("hukum ohm");
    await page.getByRole("link", { name: "Kalkulator Hukum Ohm" }).click();
    await expect(page).toHaveURL(/\/calculator\/physics\/hukum-ohm$/);
  });
});
