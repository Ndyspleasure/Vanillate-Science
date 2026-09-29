import { describe, expect, it } from "vitest";
import { handleRequest } from "@/engine/api";
import { TOOLS } from "@/engine/forms";
import { FORMULA_BY_ID } from "@/engine/science/formulas";
import { COMMON_UNITS } from "@/engine/units/units";
import { CALCULATORS, CATEGORIES, calculatorPath } from "./calculators";
import { workedExample } from "./examples";
import { GUIDE } from "./guide";

describe("calculator registry", () => {
  it("has unique paths and titles, and valid categories", () => {
    const paths = CALCULATORS.map(calculatorPath);
    expect(new Set(paths).size).toBe(paths.length);
    const titles = CALCULATORS.map((c) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const c of CALCULATORS) {
      expect(cats.has(c.category), c.slug).toBe(true);
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
      expect(c.description.length, c.slug).toBeGreaterThan(40);
    }
    for (const cat of CATEGORIES)
      expect(
        CALCULATORS.some((c) => c.category === cat.id),
        cat.id,
      ).toBe(true);
  });

  it("references existing formulas, tools and unit categories", () => {
    for (const c of CALCULATORS) {
      if (c.kind.type === "formula") expect(FORMULA_BY_ID[c.kind.formulaId], c.slug).toBeTruthy();
      if (c.kind.type === "tool") expect(TOOLS[c.kind.tool], c.slug).toBeTruthy();
      if (c.kind.type === "units" && c.kind.unitCategory)
        expect(COMMON_UNITS[c.kind.unitCategory], c.slug).toBeTruthy();
    }
  });

  const solverPages = CALCULATORS.filter((c) => c.kind.type === "solver");
  for (const c of solverPages) {
    it(`${c.slug}: every example solves and verifies`, () => {
      if (c.kind.type !== "solver") return;
      for (const ex of c.kind.examples) {
        const r = handleRequest({ type: "solve", input: ex, options: { mode: c.kind.mode } });
        if (!r.ok)
          throw new Error(
            `${c.slug} › ${ex}: ${JSON.stringify((r as { error: { message: string } }).error.message)}`,
          );
        if (!("solution" in r)) throw new Error("no solution");
        expect(["verified", "verified-numeric"], `${c.slug} › ${ex}`).toContain(
          r.solution.verification.status,
        );
        expect(r.solution.answers.length, `${c.slug} › ${ex}`).toBeGreaterThan(0);
      }
    });
  }

  it("every page's build-time worked example solves and is fully verified", () => {
    for (const c of CALCULATORS) {
      const ex = workedExample(c);
      if (c.kind.type === "periodic-table") continue;
      if (!ex || !ex.ok)
        throw new Error(`${c.slug}: ${ex && !ex.ok ? ex.error.message : "no example"}`);
      expect(["verified", "verified-numeric"], c.slug).toContain(ex.solution.verification.status);
    }
  });

  it("unit category pages convert their first units", () => {
    for (const c of CALCULATORS) {
      if (c.kind.type !== "units" || !c.kind.unitCategory) continue;
      const units = COMMON_UNITS[c.kind.unitCategory];
      const r = handleRequest({
        type: "units",
        value: "1",
        from: units[1] ?? units[0],
        to: units[0],
      });
      expect(r.ok, c.slug).toBe(true);
    }
  });
});

describe("presentation contract", () => {
  it("plain-text fields never leak raw LaTeX outside $…$", () => {
    const leaks: string[] = [];
    const check = (where: string, text: string | undefined) => {
      if (!text) return;
      const outside = text.replace(/\$[^$]+\$/g, "");
      if (/\\[a-zA-Z]+/.test(outside)) leaks.push(`${where}: ${text}`);
    };
    const visit = (where: string, steps: import("@/engine/steps/types").Step[]) => {
      for (const s of steps) {
        check(`${where} › ${s.title}`, s.reason);
        check(`${where} › ${s.title}`, s.detail);
        check(`${where} › title`, s.title);
        if (s.substeps) visit(where, s.substeps);
      }
    };
    const extra = [
      ...GUIDE.flatMap((g) => g.rows.map((r) => r.example)),
      "integral 2x cos(x^2)",
      "integral (3x + 1)^5",
      "integral x/(x^2 + 1)",
      "x^4 - 5x^2 + 4 = 0",
      "sqrt(x + 2) = x",
      "e^(2x) - 3e^x + 2 = 0",
      "(x - 1)/(x + 2) >= 0",
      "lim x->0 (1 - cos(x))/x^2",
      "sum(k, k, 1, n)",
      "|2x - 1| = 5",
      "1/x + 1/(x+1) = 1",
    ];
    for (const input of extra) {
      const o = handleRequest({ type: "solve", input });
      if (o.ok && "solution" in o) {
        visit(input, o.solution.steps);
        for (const a of o.solution.alternatives) visit(`${input} (alt)`, a.steps);
        for (const k of o.solution.verification.checks) check(`${input} check`, k.description);
      }
    }
    for (const c of CALCULATORS) {
      const inputs = c.kind.type === "solver" ? c.kind.examples : [];
      const outcomes = [
        workedExample(c),
        ...inputs.map((ex) =>
          handleRequest({
            type: "solve",
            input: ex,
            options: { mode: c.kind.type === "solver" ? c.kind.mode : undefined },
          }),
        ),
      ];
      for (const o of outcomes) {
        if (!o || !o.ok || !("solution" in o)) continue;
        const sol = o.solution;
        visit(c.slug, sol.steps);
        for (const a of sol.alternatives) visit(`${c.slug} (alt)`, a.steps);
        for (const n of sol.notes) check(`${c.slug} note`, n);
        for (const k of sol.verification.checks) {
          check(`${c.slug} check`, k.detail);
          check(`${c.slug} check`, k.description);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
