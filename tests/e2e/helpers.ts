import { expect, type Page } from "@playwright/test";

/** Collect console errors and uncaught exceptions (CSP violations show up here too). */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

export async function solve(page: Page, input: string) {
  const box = page.getByRole("textbox", { name: "Soal matematika atau sains" });
  await box.fill(input);
  await box.press("Enter");
  await expect(page.getByRole("article")).toBeVisible();
}
