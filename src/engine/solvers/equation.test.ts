import { describe, expect, it } from "vitest";
import { parse } from "../parse/parser";
import { solveEquation } from "./equation";
import { solveArithmetic } from "./arithmetic";
import { solveExpand, solveFactor, solveSimplify } from "./algebra";

function solve(input: string, variable?: string) {
  const r = parse(input);
  return solveEquation(input, r.statements[0], { variable, warnings: r.warnings });
}
const texts = (input: string) => solve(input).answers.map((a) => a.text);

describe("linear equations", () => {
  it("solves 2x + 5 = 15 with balance steps", () => {
    const s = solve("2x + 5 = 15");
    expect(texts("2x + 5 = 15")).toEqual(["5"]);
    expect(s.steps.map((st) => st.operation)).toEqual(["move-constants", "divide-coefficient"]);
    expect(s.verification.status).toBe("verified");
  });
  it("handles variables on both sides and parentheses", () => {
    expect(texts("3(x - 2) = x + 4")).toEqual(["5"]);
    expect(texts("x/3 + 1/2 = 2")).toEqual(["9/2"]);
  });
  it("detects identities and contradictions", () => {
    expect(solve("2(x+1) = 2x + 2").answers[0].text).toBe("semua bilangan real");
    expect(solve("x + 1 = x + 2").answers[0].text).toMatch(/∅/);
  });
  it("solves literal equations with conditions", () => {
    const s = solve("a x + b = c", "x");
    expect(s.answers[0].text).toBe("(-b + c)/a");
    expect(s.assumptions.join(" ")).toMatch(/a \\ne 0/);
  });
});

describe("quadratic equations", () => {
  it("uses factoring when the discriminant is a perfect square", () => {
    const s = solve("x^2 - 5x + 6 = 0");
    expect(s.answers.map((a) => a.text)).toEqual(["2", "3"]);
    expect(s.method.name).toBe("Faktorisasi");
    expect(s.alternatives.map((a) => a.name)).toContain("Rumus kuadratik (rumus ABC)");
    expect(s.alternatives.map((a) => a.name)).toContain("Melengkapkan kuadrat sempurna");
  });
  it("uses the quadratic formula for irrational roots", () => {
    const s = solve("x^2 - 2x - 1 = 0");
    expect(s.answers.map((a) => a.text)).toEqual(["1 - sqrt(2)", "sqrt(2) + 1"]);
    expect(s.verification.status).toBe("verified");
  });
  it("reports complex roots when D < 0", () => {
    const s = solve("x^2 + 2x + 5 = 0");
    expect(s.answers[0].text).toMatch(/tidak ada penyelesaian real/);
    expect(s.answers.slice(1).map((a) => a.text)).toEqual(expect.arrayContaining(["-1 - 2*i", "-1 + 2*i"]));
    expect(s.verification.checks.every((c) => c.passed)).toBe(true);
  });
  it("handles double roots", () => {
    const s = solve("x^2 - 6x + 9 = 0");
    expect(s.answers).toHaveLength(1);
    expect(s.answers[0].label).toMatch(/multiplisitas 2/);
  });
  it("handles c = 0 and b = 0 special forms", () => {
    expect(texts("3x^2 = 12x")).toEqual(["0", "4"]);
    expect(texts("2x^2 - 18 = 0")).toEqual(["-3", "3"]);
  });
});

describe("higher-degree polynomials", () => {
  it("uses rational roots and synthetic division", () => {
    expect(texts("x^3 - 6x^2 + 11x - 6 = 0")).toEqual(["1", "2", "3"]);
  });
  it("solves biquadratic equations", () => {
    expect(texts("x^4 - 5x^2 + 4 = 0")).toEqual(["-2", "-1", "1", "2"]);
  });
  it("solves pure powers", () => {
    const s = solve("x^3 = 8");
    expect(s.answers[0].text).toBe("2");
    expect(s.answers.filter((a) => a.label?.includes("kompleks"))).toHaveLength(2);
  });
  it("falls back to numeric roots for irreducible quintics", () => {
    const s = solve("x^5 - x - 1 = 0");
    const real = s.answers.filter((a) => !a.label?.includes("kompleks"));
    expect(real).toHaveLength(1);
    expect(real[0].exact).toBe(false);
    expect(Number(real[0].text.replace("≈ ", ""))).toBeCloseTo(1.1673039782614, 10);
    expect(s.verification.checks.every((c) => c.passed)).toBe(true);
  });
});

describe("rational and radical equations", () => {
  it("rejects values that make a denominator zero", () => {
    const s = solve("(x^2 - 1)/(x - 1) = 2");
    expect(s.answers[0].text).toMatch(/∅/);
    expect(s.notes.join(" ")).toMatch(/ditolak/);
  });
  it("solves standard rational equations", () => {
    expect(texts("1/x + 1/(x+1) = 5/6")).toEqual(["-3/5", "2"]);
  });
  it("rejects extraneous roots from squaring", () => {
    const s = solve("sqrt(x + 7) = x + 1");
    expect(s.answers.map((a) => a.text)).toEqual(["2"]);
    expect(s.notes.join(" ")).toMatch(/palsu/);
  });
  it("detects no solution for sqrt(x) = -2", () => {
    expect(solve("sqrt(x) = -2").answers[0].text).toMatch(/∅/);
  });
});

describe("transcendental equations", () => {
  it("solves exponential equations exactly", () => {
    expect(texts("2^(x+1) = 16")).toEqual(["3"]);
    const s = solve("e^x = 5");
    expect(s.answers[0].text).toBe("ln(5)");
  });
  it("solves logarithmic equations", () => {
    expect(texts("log(x) = 2")).toEqual(["100"]);
    expect(texts("ln(2x) = 0")).toEqual(["1/2"]);
  });
  it("solves trig equations with general solutions", () => {
    const s = solve("sin(x) = 1/2");
    const general = s.answers.filter((a) => a.text.includes("k ∈ ℤ"));
    expect(general).toHaveLength(2);
    const particular = s.answers.find((a) => a.label === "Solusi pada [0, 2π)");
    expect(particular?.text).toBe("pi/6, 5*pi/6");
    expect(s.verification.checks.every((c) => c.passed)).toBe(true);
  });
  it("reports no solution when |sin x| > 1 is required", () => {
    expect(solve("sin(x) = 2").answers[0].text).toMatch(/∅/);
  });
  it("uses substitution for quadratic-in-exponential equations", () => {
    const s = solve("4^x - 3*2^x + 2 = 0");
    expect(s.method.name).toBe("Metode substitusi");
    expect(s.answers.map((a) => a.text)).toEqual(["0", "1"]);
  });
  it("uses the Pythagorean identity for mixed trig equations", () => {
    const s = solve("2cos(x)^2 + 3sin(x) - 3 = 0");
    const particular = s.answers.find((a) => a.label === "Solusi pada [0, 2π)");
    expect(particular?.text).toBe("pi/6, pi/2, 5*pi/6");
  });
  it("solves absolute value equations", () => {
    expect(texts("|2x - 1| = 5")).toEqual(["-2", "3"]);
  });
  it("falls back to numeric methods", () => {
    const s = solve("cos(x) = x");
    expect(s.answers).toHaveLength(1);
    expect(Number(s.answers[0].text.replace("≈ ", ""))).toBeCloseTo(0.7390851332151607, 10);
    expect(s.notes.join(" ")).toMatch(/aproksimasi/);
  });
});

describe("arithmetic", () => {
  it("follows the order of operations", () => {
    const s = solveArithmetic("2 + 3 * 4 - 6 / 2", parse("2 + 3 * 4 - 6 / 2").statements[0]);
    expect(s.answers[0].text).toBe("11");
    expect(s.steps.map((st) => st.title)).toEqual(["Kalikan", "Bagi", "Jumlahkan", "Kurangkan"]);
    expect(s.verification.status).toBe("verified");
  });
  it("keeps fractions exact and explains them", () => {
    const s = solveArithmetic("1/3 + 1/6", parse("1/3 + 1/6").statements[0]);
    expect(s.answers[0].text).toBe("1/2");
    expect(s.steps.some((st) => st.substeps?.length)).toBe(true);
  });
  it("reports division by zero", () => {
    expect(() => solveArithmetic("5/(3-3)", parse("5/(3-3)").statements[0])).toThrowError(/nol/);
  });
});

describe("algebra", () => {
  it("simplifies with like terms", () => {
    const s = solveSimplify("3x + 2y - x + 5y", parse("3x + 2y - x + 5y").statements[0]);
    expect(s.answers[0].text).toBe("2*x + 7*y");
    expect(s.steps[0].operation).toBe("group-like-terms");
  });
  it("cancels rational expressions with domain restrictions", () => {
    const s = solveSimplify("(x^2 - 1)/(x - 1)", parse("(x^2 - 1)/(x - 1)").statements[0]);
    expect(s.answers[0].text).toBe("x + 1");
    expect(s.assumptions.join(" ")).toMatch(/x \\ne 1/);
  });
  it("expands and factors", () => {
    expect(solveExpand("(x+2)(x+3)", parse("(x+2)(x+3)").statements[0]).answers[0].text).toBe("x^2 + 5*x + 6");
    const f = solveFactor("x^2 + 5x + 6", parse("x^2 + 5x + 6").statements[0]);
    expect(f.answers[0].text).toBe("(x + 2)*(x + 3)");
    expect(f.verification.status).toBe("verified");
    expect(solveFactor("6x^2 + x - 2", parse("6x^2 + x - 2").statements[0]).answers[0].text).toBe("(2*x - 1)*(3*x + 2)");
    expect(solveFactor("x^3 - 8", parse("x^3 - 8").statements[0]).answers[0].text).toBe("(x - 2)*(x^2 + 2*x + 4)");
    expect(solveFactor("2x^3 - 8x", parse("2x^3 - 8x").statements[0]).answers[0].text).toBe("2*x*(x - 2)*(x + 2)");
    expect(solveFactor("x^2 - y^2", parse("x^2 - y^2").statements[0]).answers[0].text).toBe("(x - y)*(x + y)");
  });
});
