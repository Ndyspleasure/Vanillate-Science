import { describe, expect, it } from "vitest";
import { parse } from "../parse/parser";
import { toExpr } from "../parse/convert";
import { parseUnit, dimEquals } from "../units/units";
import { CONSTANTS } from "./constants";
import { FORMULAS } from "./formulas";
import { dimensionOf, significantFigures, solveFormula } from "./formula-solver";

describe("formula registry integrity", () => {
  for (const f of FORMULAS) {
    it(`${f.id}: parses, uses only declared variables, dimensionally consistent`, () => {
      const r = parse(f.equation).statements[0];
      expect(r.k).toBe("rel");
      if (r.k !== "rel") return;
      const L = toExpr(r.operands[0]);
      const R = toExpr(r.operands[1]);
      const dims = Object.fromEntries(f.variables.map((v) => [v.s, parseUnit(v.constant ? CONSTANTS[v.constant].unit : v.unit).dim]));
      expect(dimEquals(dimensionOf(L, dims), dimensionOf(R, dims))).toBe(true);
      expect(f.variables.map((v) => v.s)).toContain(f.example.solveFor);
    });
    it(`${f.id}: example solves and verifies`, () => {
      const values = Object.fromEntries(Object.entries(f.example.values).map(([k, val]) => [k, { value: val }]));
      const s = solveFormula({ formulaId: f.id, solveFor: f.example.solveFor, values });
      expect(s.answers.length).toBeGreaterThan(0);
      expect(s.verification.status === "verified" || s.verification.status === "verified-numeric").toBe(true);
    });
  }
});

describe("formula solver", () => {
  it("solves kinetic energy for v with unit conversion and positive root", () => {
    const s = solveFormula({ formulaId: "energi-kinetik", solveFor: "v", values: { E_k: { value: "100", unit: "J" }, m: { value: "2000", unit: "g" } } });
    expect(s.answers[0].text).toBe("10 m/s");
    expect(s.steps.some((st) => st.operation === "rearrange")).toBe(true);
  });
  it("rejects negative time for kinematics quadratics", () => {
    const s = solveFormula({ formulaId: "glbb-perpindahan", solveFor: "t", values: { s: { value: "100" }, v_0: { value: "0" }, a: { value: "2" } } });
    expect(s.answers[0].text).toBe("10 s");
    expect(s.steps.some((st) => st.operation === "filter-constraints")).toBe(true);
  });
  it("detects total internal reflection (no solution)", () => {
    expect(() => solveFormula({ formulaId: "hukum-snellius", solveFor: "theta_2", values: { n_1: { value: "1.5" }, theta_1: { value: "60" }, n_2: { value: "1" } } })).toThrowError(/Tidak ada nilai/);
  });
  it("solves Snell's law with exact angles", () => {
    const s = solveFormula({ formulaId: "hukum-snellius", solveFor: "theta_2", values: { n_1: { value: "1" }, theta_1: { value: "30" }, n_2: { value: "1.5" } } });
    expect(Number(s.answers[0].text.split(" ")[0])).toBeCloseTo(19.47122063, 6);
  });
  it("rejects incompatible units", () => {
    expect(() => solveFormula({ formulaId: "hukum-newton-2", solveFor: "F", values: { m: { value: "2", unit: "m" }, a: { value: "3" } } })).toThrowError(/tidak sesuai/);
  });
  it("converts to requested output unit", () => {
    const s = solveFormula({ formulaId: "kecepatan-rata-rata", solveFor: "v", values: { s: { value: "100", unit: "km" }, t: { value: "2", unit: "h" } }, outputUnit: "km/h" });
    expect(s.answers[0].text).toBe("50 km/h");
  });
  it("counts significant figures", () => {
    expect(significantFigures("0.00120")).toBe(3);
    expect(significantFigures("1200")).toBe(2);
    expect(significantFigures("1.200e3")).toBe(4);
    expect(significantFigures("9.80665")).toBe(6);
  });
});
