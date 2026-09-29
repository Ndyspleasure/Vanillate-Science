import { describe, expect, it } from "vitest";
import { parse } from "../parse/parser";
import { solveInequality } from "./inequality";
import { solveSystem } from "./system";

const ineq = (s: string) => solveInequality(s, parse(s).statements[0]);
const sys = (s: string) => solveSystem(s, parse(s).statements);

describe("inequalities", () => {
  it("solves linear inequalities", () => {
    const s = ineq("2x + 3 > 7");
    expect(s.answers[0].text).toBe("(2, ∞)");
    expect(s.verification.status).toBe("verified-numeric");
  });
  it("flips the sign when dividing by a negative number", () => {
    const s = ineq("-3x + 1 <= 7");
    expect(s.answers[0].text).toBe("[-2, ∞)");
    expect(s.steps.some((st) => st.operation === "divide-negative-flip")).toBe(true);
  });
  it("solves quadratic inequalities with a sign chart", () => {
    expect(ineq("x^2 - 5x + 6 < 0").answers[0].text).toBe("(2, 3)");
    expect(ineq("x^2 - 4 >= 0").answers[0].text).toBe("(-∞, -2] ∪ [2, ∞)");
    expect(ineq("x^2 + 1 > 0").answers[0].latex).toBe("\\mathbb{R}");
    expect(ineq("x^2 + 1 < 0").answers[0].text).toBe("∅");
  });
  it("excludes poles of rational inequalities", () => {
    const s = ineq("(x - 1)/(x + 2) >= 0");
    expect(s.answers[0].text).toBe("(-∞, -2) ∪ [1, ∞)");
    expect(s.verification.checks.every((c) => c.passed)).toBe(true);
  });
  it("handles absolute values and compound inequalities", () => {
    expect(ineq("|x - 2| < 3").answers[0].text).toBe("(-1, 5)");
    expect(ineq("1 < 2x + 1 <= 5").answers[0].text).toBe("(0, 2]");
  });
  it("respects domains of square roots", () => {
    expect(ineq("sqrt(x) < 2").answers[0].text).toBe("[0, 4)");
  });
});

describe("systems", () => {
  it("solves a 2x2 linear system with alternatives", () => {
    const s = sys("2x + 3y = 7, x - y = 1");
    expect(s.answers.map((a) => a.text)).toEqual(["2", "1"]);
    expect(s.alternatives.map((a) => a.name)).toEqual(["Eliminasi dan substitusi", "Aturan Cramer"]);
    expect(s.verification.status).toBe("verified");
  });
  it("solves a 3x3 system", () => {
    const s = sys("x + y + z = 6; 2x - y + z = 3; x + 2y - z = 2");
    expect(s.answers.map((a) => a.text)).toEqual(["1", "2", "3"]);
  });
  it("detects inconsistent systems", () => {
    expect(sys("x + y = 1, x + y = 2").answers[0].text).toMatch(/tidak konsisten/);
  });
  it("describes infinitely many solutions", () => {
    const s = sys("x + y = 2, 2x + 2y = 4");
    expect(s.answers[0].text).toBe("-t + 2");
    expect(s.answers[1].text).toBe("t");
  });
  it("solves nonlinear systems by substitution", () => {
    const s = sys("x + y = 5, x*y = 6");
    expect(s.answers.map((a) => a.text).sort()).toEqual(["(2, 3)", "(3, 2)"]);
    expect(s.verification.status).toBe("verified");
  });
});
