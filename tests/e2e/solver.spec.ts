import { expect, test } from "@playwright/test";
import { solve, trackErrors } from "./helpers";

test.describe("solver", () => {
  test("solves a quadratic equation with verified steps", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await solve(page, "x^2 - 5x + 6 = 0");
    const result = page.getByRole("article");
    await expect(result.getByText("Terverifikasi").first()).toBeVisible();
    await expect(result.getByRole("tabpanel")).toContainText("2");
    await expect(result.getByRole("tabpanel")).toContainText("3");
    await expect(page).toHaveURL(/\?q=x%5E2/);

    await result.getByRole("tab", { name: /Langkah/ }).click();
    await expect(result.getByRole("tabpanel").locator("ol > li").first()).toBeVisible();
    await result.getByRole("tab", { name: /Verifikasi/ }).click();
    await expect(result.getByRole("tabpanel")).toContainText("Substitusi");
    await result.getByRole("tab", { name: "Grafik" }).click();
    await expect(result.locator("svg[role=img] path").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("tabs support keyboard navigation", async ({ page }) => {
    await page.goto("/");
    await solve(page, "d/dx (x^3 sin(x))");
    const first = page.getByRole("tab", { name: "Jawaban" });
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: /Langkah/ })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(page.getByRole("tab").last()).toHaveAttribute("aria-selected", "true");
  });

  test("shared links solve automatically", async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent("integral from 0 to pi of sin(x)")}`);
    await expect(page.getByRole("article")).toContainText("Integral tentu");
    await expect(page.getByRole("article").getByRole("tabpanel")).toContainText("2");
  });

  test("explains invalid input and points at the problem", async ({ page }) => {
    await page.goto("/");
    const box = page.getByRole("textbox", { name: "Soal matematika atau sains" });
    await box.fill("sederhanakan (x + 1");
    await box.press("Enter");
    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toContainText("Input tidak valid");
    await expect(alert.locator("mark")).toHaveText("(");
  });

  test("live preview shows how the input is read", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Soal matematika atau sains" }).fill("1/2x");
    await expect(page.locator("#soal-preview")).toContainText("Dibaca sebagai");
    await expect(page.locator("#soal-preview")).toContainText("ditafsirkan");
  });

  test("math keyboard inserts at the cursor", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Tombol" }).click();
    await page.getByRole("button", { name: "akar kuadrat" }).click();
    await page.keyboard.type("16");
    await expect(page.getByRole("textbox", { name: "Soal matematika atau sains" })).toHaveValue("sqrt(16)");
  });

  test("explanation level changes the amount of detail", async ({ page }) => {
    await page.goto("/");
    await solve(page, "integral x e^x");
    await page.getByRole("tab", { name: "Penjelasan" }).click();
    await page.getByText("Expert", { exact: true }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Modul mesin");
    await page.getByText("Dasar", { exact: true }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Buka tab Langkah");
    await expect(page.getByRole("tabpanel")).not.toContainText("Modul mesin");
    // the preference is remembered
    await page.reload();
    await expect(page.getByRole("radio", { name: "Dasar" })).toBeChecked();
  });

  test("history keeps solved problems", async ({ page }) => {
    await page.goto("/");
    await solve(page, "gcd(84, 36)");
    await page.goto("/riwayat");
    await expect(page.getByRole("link", { name: /gcd\(84, 36\)/ })).toBeVisible();
  });
});
