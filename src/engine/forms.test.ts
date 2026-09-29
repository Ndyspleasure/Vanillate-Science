import { describe, expect, it } from "vitest";
import { handleRequest, sample } from "./api";
import { normalizeNumber, numberList, TOOLS } from "./forms";

describe("tool forms", () => {
  for (const [id, def] of Object.entries(TOOLS)) {
    it(`${id}: default example solves and verifies`, () => {
      const r = handleRequest({ type: "tool", tool: id, values: def.defaults });
      if (!r.ok) throw new Error(`${id}: ${JSON.stringify((r as { error: unknown }).error)}`);
      if (!("solution" in r)) throw new Error("expected solution");
      expect(r.solution.answers.length).toBeGreaterThan(0);
      expect(["verified", "verified-numeric"]).toContain(r.solution.verification.status);
      expect(() => structuredClone(r)).not.toThrow();
    });
  }

  it("every select default is one of its options", () => {
    for (const def of Object.values(TOOLS)) {
      for (const f of def.fields) {
        if (f.type === "select") expect(f.options!.map((o) => o.value)).toContain(def.defaults[f.name]);
        if (!f.optional && !f.showIf) expect(def.defaults[f.name] ?? "", `${def.id}.${f.name}`).not.toBe("");
      }
    }
  });

  it("reports missing and malformed inputs as invalid-input", () => {
    const r1 = handleRequest({ type: "tool", tool: "simple-interest", values: { principal: "", rate: "5", years: "2" } });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.kind).toBe("invalid-input");
    const r2 = handleRequest({ type: "tool", tool: "twos-complement", values: { value: "abc", bits: "8" } });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.kind).toBe("invalid-input");
    const r3 = handleRequest({ type: "tool", tool: "normal", values: { mu: "0", sigma: "-1", tail: "le", a: "1" } });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error.kind).toBe("domain-error");
    const r4 = handleRequest({ type: "tool", tool: "nope", values: {} });
    expect(r4.ok).toBe(false);
  });

  it("normalizes Indonesian and English number formats", () => {
    expect(normalizeNumber("1.250.000,50")).toBe("1250000.50");
    expect(normalizeNumber("1,250,000.50")).toBe("1250000.50");
    expect(normalizeNumber("3,5")).toBe("3.5");
    expect(normalizeNumber("2.5")).toBe("2.5");
    expect(normalizeNumber("1_000")).toBe("1000");
    expect(normalizeNumber("−4")).toBe("-4");
    expect(normalizeNumber("0.975")).toBe("0.975");
    expect(normalizeNumber("1.250")).toBe("1.250");
    expect(normalizeNumber("1.250,5")).toBe("1250.5");
    expect(normalizeNumber("1,5e-3")).toBe("1.5e-3");
    expect(numberList("1, 2.5\n3;4", "x")).toEqual(["1", "2.5", "3", "4"]);
    expect(() => numberList("1, a", "x")).toThrow();
  });

  it("uses Indonesian thousands separators in money fields", () => {
    const r = handleRequest({ type: "tool", tool: "simple-interest", values: { principal: "10.000.000", rate: "6", years: "3" } });
    expect(r.ok).toBe(true);
    if (r.ok && "solution" in r) expect(r.solution.answers.map((a) => a.text).join(" ")).toMatch(/1\.800\.000|1800000/);
  });
});

describe("api", () => {
  it("solve, formula, units and check-work round-trip", () => {
    const s = handleRequest({ type: "solve", input: "x^2 - 5x + 6 = 0" });
    expect(s.ok).toBe(true);
    const f = handleRequest({ type: "formula", input: { formulaId: "hukum-ohm", solveFor: "I", values: { V: { value: "12" }, R: { value: "4" } } } });
    expect(f.ok).toBe(true);
    const u = handleRequest({ type: "units", value: "100", from: "°C", to: "°F" });
    expect(u.ok).toBe(true);
    if (u.ok && "solution" in u) expect(u.solution.answers[0].text).toContain("212");
    const w = handleRequest({ type: "check-work", problem: "2x + 3 = 11", lines: ["2x = 8", "x = 4"] });
    expect(w.ok).toBe(true);
    if (w.ok && "result" in w) expect(w.result.finalCorrect).toBe(true);
  });

  it("samples functions, polar and parametric curves with gaps outside the domain", () => {
    const r = sample({ kind: "function", exprs: ["sqrt(x)", "y = 1/x", "bad(("], variable: "x", range: [-1, 1], samples: 4 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [sq, inv, bad] = r.curves;
    expect(sq.points.length).toBe(10);
    expect(Number.isNaN(sq.points[1])).toBe(true); // sqrt(-1)
    expect(sq.points[9]).toBeCloseTo(1);
    expect(Number.isNaN(inv.points[5])).toBe(true); // 1/0
    expect(bad.error).toBeTruthy();
    const polar = sample({ kind: "polar", exprs: ["1"], variable: "t", range: [0, Math.PI], samples: 2 });
    if (polar.ok) {
      expect(polar.curves[0].points[0]).toBeCloseTo(1);
      expect(polar.curves[0].points[3]).toBeCloseTo(1);
    }
    const para = sample({ kind: "parametric", exprs: ["cos(t)"], yExprs: ["sin(t)"], variable: "t", range: [0, 1], samples: 2 });
    if (para.ok) expect(para.curves[0].points[5]).toBeCloseTo(Math.sin(1));
    expect(sample({ kind: "function", exprs: ["x"], variable: "x", range: [1, 0], samples: 5 }).ok).toBe(false);
  });
});

describe("api number normalisation", () => {
  it("formula and unit inputs accept decimal commas", () => {
    const f = handleRequest({ type: "formula", input: { formulaId: "hukum-ohm", solveFor: "V", values: { I: { value: "0,5" }, R: { value: "10" } } } });
    expect(f.ok).toBe(true);
    if (f.ok && "solution" in f) expect(f.solution.answers[0].text).toContain("5");
    const u = handleRequest({ type: "units", value: "2,5", from: "km", to: "m" });
    expect(u.ok).toBe(true);
    if (u.ok && "solution" in u) expect(u.solution.answers[0].text).toContain("2500");
  });
});
