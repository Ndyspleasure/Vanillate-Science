import { describe, expect, it } from "vitest";
import { ELEMENTS } from "./elements";
import { parseFormula, molarMass } from "./formula";
import {
  balanceReaction,
  solveAcidPH,
  solveBalance,
  solveEmpiricalFormula,
  solveMolarMass,
  solveStoichiometry,
} from "./solvers";

describe("periodic table", () => {
  it("has 118 elements with positions", () => {
    expect(ELEMENTS).toHaveLength(118);
    expect(ELEMENTS[0]).toMatchObject({ symbol: "H", period: 1, group: 1 });
    expect(ELEMENTS[25]).toMatchObject({ symbol: "Fe", period: 4, group: 8 });
    expect(ELEMENTS[56]).toMatchObject({ symbol: "La", group: null, category: "lantanida" });
    expect(ELEMENTS[71]).toMatchObject({ symbol: "Hf", period: 6, group: 4 });
    expect(ELEMENTS[117]).toMatchObject({ symbol: "Og", period: 7, group: 18 });
  });
});

describe("formula parser", () => {
  const counts = (f: string) => Object.fromEntries(parseFormula(f).counts);
  it("parses nested groups and hydrates", () => {
    expect(counts("H2O")).toEqual({ H: 2, O: 1 });
    expect(counts("Ca(OH)2")).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(counts("[Cu(NH3)4]SO4")).toEqual({ Cu: 1, N: 4, H: 12, S: 1, O: 4 });
    expect(counts("CuSO4·5H2O")).toEqual({ Cu: 1, S: 1, O: 9, H: 10 });
    expect(counts("Al2(SO4)3")).toEqual({ Al: 2, S: 3, O: 12 });
  });
  it("parses charges unambiguously", () => {
    expect(parseFormula("NH4+").charge).toBe(1);
    expect(counts("NH4+")).toEqual({ N: 1, H: 4 });
    expect(parseFormula("Fe^3+").charge).toBe(3);
    expect(parseFormula("Fe+3").charge).toBe(3);
    expect(parseFormula("SO4^2-").charge).toBe(-2);
    expect(parseFormula("SO4 2-").charge).toBe(-2);
    expect(parseFormula("Fe³⁺").charge).toBe(3);
    expect(parseFormula("e-").isElectron).toBe(true);
  });
  it("rejects invalid formulas", () => {
    expect(() => parseFormula("Xy2")).toThrowError(/tidak valid/);
    expect(() => parseFormula("Ca(OH2")).toThrowError(/tidak valid/);
  });
  it("computes molar masses", () => {
    expect(molarMass(parseFormula("H2O")).value.toNumber()).toBeCloseTo(18.015, 3);
    expect(molarMass(parseFormula("C6H12O6")).value.toNumber()).toBeCloseTo(180.156, 3);
    expect(molarMass(parseFormula("NaCl")).value.toNumber()).toBeCloseTo(58.44, 2);
  });
});

describe("chemistry solvers", () => {
  it("balances equations", () => {
    const coef = (r: string) => balanceReaction(r).coefficients.map(Number);
    expect(coef("H2 + O2 -> H2O")).toEqual([2, 1, 2]);
    expect(coef("Fe + O2 -> Fe2O3")).toEqual([4, 3, 2]);
    expect(coef("C3H8 + O2 -> CO2 + H2O")).toEqual([1, 5, 3, 4]);
    expect(coef("KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2")).toEqual([2, 16, 2, 2, 8, 5]);
    expect(coef("Cu + NO3^- + H^+ -> Cu^2+ + NO + H2O")).toEqual([3, 2, 8, 3, 2, 4]);
    expect(coef("MnO4- + Fe^2+ + H+ -> Mn^2+ + Fe^3+ + H2O")).toEqual([1, 5, 8, 1, 5, 4]);
  });
  it("verifies balanced equations", () => {
    const s = solveBalance("C3H8 + O2 -> CO2 + H2O");
    expect(s.answers[0].text).toBe("C3H8 + 5O2 → 3CO2 + 4H2O");
    expect(s.verification.status).toBe("verified");
  });
  it("rejects impossible reactions", () => {
    expect(() => balanceReaction("H2 -> O2")).toThrowError(/tidak dapat disetarakan/);
  });
  it("molar mass solution sums to 100%", () => {
    expect(solveMolarMass("CuSO4·5H2O").verification.status).toBe("verified");
  });
  it("finds empirical formulas", () => {
    const s = solveEmpiricalFormula({ C: "40.0", H: "6.71", O: "53.3" }, "180.16");
    expect(s.answers[0].text).toBe("CH2O");
    expect(s.answers[1].text).toBe("C6H12O6");
  });
  it("does stoichiometry with limiting reagent", () => {
    const s = solveStoichiometry("H2 + O2 -> H2O", { 0: "4", 1: "64" });
    const water = s.answers.find((a) => a.label?.includes("H2O"))!;
    expect(Number(water.text.split(" ")[0])).toBeCloseTo(35.73, 1);
    expect(s.verification.status).toBe("verified");
  });
  it("computes pH exactly", () => {
    expect(
      Number(solveAcidPH({ kind: "strong-acid", concentration: 0.01 }).answers[0].text),
    ).toBeCloseTo(2, 6);
    expect(
      Number(solveAcidPH({ kind: "weak-acid", concentration: 0.1, k: 1.8e-5 }).answers[0].text),
    ).toBeCloseTo(2.8753, 3);
    expect(
      Number(solveAcidPH({ kind: "strong-acid", concentration: 1e-8 }).answers[0].text),
    ).toBeCloseTo(6.978, 3);
    expect(
      Number(solveAcidPH({ kind: "strong-base", concentration: 0.001 }).answers[0].text),
    ).toBeCloseTo(11, 6);
  });
});
