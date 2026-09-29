import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parse } from "../parse/parser";
import { toExpr } from "../parse/convert";
import { toText } from "../expr/print";
import { checkEquivalent } from "../expr/equivalence";
import type { Expr } from "../expr/types";
import { differentiate } from "./derivative";
import { integrate } from "./integral";
import { solveDerivative, solveExtrema, solveImplicit, solveIntegral, solveLimit, solveTaylor } from "./solvers";

const ex = (s: string): Expr => toExpr(parse(s).statements[0], { allowInfinity: true });
const d = (s: string, x = "x") => toText(solveDerivative(s, ex(s), "", { variable: x }).answers[0] as never as { text: string } & never);

function deriv(s: string, x = "x") {
  return solveDerivative(s, ex(s), "", { variable: x });
}
function integral(s: string, lower?: string, upper?: string) {
  return solveIntegral(s, ex(s), "", { variable: "x", lower: lower ? ex(lower) : undefined, upper: upper ? ex(upper) : undefined });
}
function limit(s: string, to: string, dir?: "+" | "-") {
  return solveLimit(s, ex(s), "x", ex(to), dir, "");
}
void d;

describe("derivatives", () => {
  it("applies basic rules", () => {
    expect(deriv("x^3 + 2x").answers[0].text).toBe("3*x^2 + 2");
    expect(deriv("sin(x^2)").answers[0].text).toBe("2*x*cos(x^2)");
    expect(deriv("e^(3x)").answers[0].text).toBe("3*e^(3*x)");
    expect(deriv("ln(x)").answers[0].text).toBe("1/x");
  });
  it("uses the product and quotient rules", () => {
    const s = deriv("x^2 sin(x)");
    expect(s.steps[0].rule?.id).toBe("product");
    expect(checkEquivalent(ex(s.answers[0].text), ex("2x sin(x) + x^2 cos(x)")).equivalent).toBe(true);
    const q = deriv("sin(x)/x");
    expect(q.steps[0].rule?.id).toBe("quotient");
    expect(q.verification.status).toBe("verified-numeric");
  });
  it("handles logarithmic differentiation and higher orders", () => {
    const s = deriv("x^x");
    expect(checkEquivalent(ex(s.answers[0].text), ex("x^x (ln(x) + 1)")).equivalent).toBe(true);
    const h = solveDerivative("x^4", ex("x^4"), "", { order: 3 });
    expect(h.answers[0].text).toBe("24*x");
  });
  it("computes partial derivatives", () => {
    const s = deriv("x^2 y + y^3", "y");
    expect(s.answers[0].text).toBe("x^2 + 3*y^2");
    expect(s.title).toBe("Turunan parsial");
  });
  it("derivatives match numeric differentiation (property)", () => {
    const pieces = ["x", "x^2", "sin(x)", "cos(x)", "e^x", "ln(x^2+1)", "sqrt(x^2+1)", "atan(x)", "1/(x^2+2)"];
    fc.assert(
      fc.property(fc.constantFrom(...pieces), fc.constantFrom(...pieces), fc.constantFrom("+", "*", "/", "∘"), (a, b, op) => {
        const src = op === "∘" ? b.replace(/x/g, `(${a})`) : `(${a})${op}(${b})`;
        const s = deriv(src);
        expect(s.verification.status === "verified" || s.verification.status === "verified-numeric").toBe(true);
      }),
      { numRuns: 80 },
    );
  });
});

describe("integrals", () => {
  const anti = (s: string) => {
    const r = integrate(ex(s), "x");
    expect(r).not.toBeNull();
    const dF = differentiate(r!.value, "x").value;
    expect(checkEquivalent(dF, ex(s)).equivalent).toBe(true);
    return toText(r!.value);
  };
  it("integrates basic forms", () => {
    expect(anti("x^2")).toBe("x^3/3");
    expect(anti("1/x")).toBe("ln(abs(x))");
    expect(anti("3x^2 + 2x + 1")).toBe("x^3 + x^2 + x");
    anti("sin(x) + cos(x)");
    anti("e^(2x)");
    anti("2^x");
  });
  it("uses u-substitution", () => {
    anti("2x cos(x^2)");
    anti("x e^(x^2)");
    anti("sin(x)^3 cos(x)");
    anti("ln(x)/x");
    anti("x/(x^2 + 1)");
    anti("(2x+1)^5");
  });
  it("uses integration by parts", () => {
    anti("x e^x");
    anti("x^2 sin(x)");
    anti("ln(x)");
    anti("x ln(x)");
    anti("atan(x)");
    anti("e^x sin(x)");
  });
  it("uses partial fractions", () => {
    anti("1/(x^2 - 1)");
    anti("(x + 3)/(x^2 + 3x + 2)");
    anti("1/(x^2 + 2x + 5)");
    anti("x^3/(x^2 + 1)");
    anti("1/((x-1)^2 (x+2))");
  });
  it("uses trigonometric identities and standard forms", () => {
    anti("sin(x)^2");
    anti("cos(x)^2");
    anti("tan(x)^2");
    anti("sin(x)^3");
    anti("1/(1 + x^2)");
    anti("1/sqrt(1 - x^2)");
    anti("sqrt(4 - x^2)");
    anti("sin(2x) cos(3x)");
  });
  it("reports honestly when no elementary antiderivative is found", () => {
    expect(() => integral("e^(x^2)")).toThrowError(/antiturunan/);
  });
  it("evaluates definite integrals with FTC and numeric verification", () => {
    const s = integral("x^2", "0", "3");
    expect(s.answers[0].text).toBe("9");
    expect(s.verification.status).toBe("verified");
    expect(integral("sin(x)", "0", "pi").answers[0].text).toBe("2");
  });
  it("detects divergent improper integrals instead of misapplying FTC", () => {
    expect(integral("1/x^2", "-1", "1").answers[0].text).toBe("divergen");
    expect(integral("1/x", "1", "inf").answers[0].text).toBe("divergen");
  });
  it("evaluates convergent improper integrals", () => {
    expect(integral("e^(-x)", "0", "inf").answers[0].text).toBe("1");
    expect(integral("1/sqrt(x)", "0", "1").answers[0].text).toBe("2");
    expect(integral("1/(1+x^2)", "-inf", "inf").answers[0].text).toBe("pi");
  });
  it("falls back to numeric integration", () => {
    const s = integral("e^(-x^2)", "0", "1");
    expect(s.answers[0].exact).toBe(false);
    expect(Number(s.answers[0].text)).toBeCloseTo(0.746824132812427, 10);
  });
});

describe("limits", () => {
  it("uses direct substitution", () => {
    expect(limit("x^2 + 1", "2").answers[0].text).toBe("5");
  });
  it("factors and cancels 0/0", () => {
    const s = limit("(x^2 - 4)/(x - 2)", "2");
    expect(s.answers[0].text).toBe("4");
    expect(s.method.name).toBe("Faktorisasi dan pencoretan");
  });
  it("uses L'Hôpital's rule", () => {
    expect(limit("sin(x)/x", "0").answers[0].text).toBe("1");
    expect(limit("(1 - cos(x))/x^2", "0").answers[0].text).toBe("1/2");
    expect(limit("(e^x - 1)/x", "0").answers[0].text).toBe("1");
  });
  it("handles limits at infinity", () => {
    expect(limit("(3x^2 + 1)/(2x^2 - x)", "inf").answers[0].text).toBe("3/2");
    expect(limit("x/e^x", "inf").answers[0].text).toBe("0");
    expect(limit("(1 + 1/x)^x", "inf").answers[0].text).toBe("e");
    expect(limit("x^3 - x", "-inf").answers[0].text).toBe("-∞");
  });
  it("handles one-sided and nonexistent limits", () => {
    expect(limit("1/x", "0", "+").answers[0].text).toBe("∞");
    expect(limit("1/x", "0", "-").answers[0].text).toBe("-∞");
    expect(limit("1/x", "0").answers[0].text).toMatch(/tidak ada/);
    expect(limit("abs(x)/x", "0").answers[0].text).toMatch(/tidak ada/);
    expect(limit("1/x^2", "0").answers[0].text).toBe("∞");
  });
  it("handles 0·∞ forms", () => {
    expect(limit("x ln(x)", "0", "+").answers[0].text).toBe("0");
  });
});

describe("series, extrema, implicit", () => {
  it("builds Maclaurin polynomials", () => {
    const s = solveTaylor("", ex("e^x"), "x", ex("0"), 4);
    expect(s.answers[0].text).toBe("x^4/24 + x^3/6 + x^2/2 + x + 1");
    expect(s.verification.status).toBe("verified-numeric");
    expect(solveTaylor("", ex("sin(x)"), "x", ex("0"), 5).answers[0].text).toBe("x^5/120 - x^3/6 + x");
  });
  it("classifies critical points", () => {
    const s = solveExtrema("", ex("x^3 - 3x"));
    expect(s.answers.map((a) => `${a.label}:${a.text}`)).toEqual(["maksimum lokal:(-1, 2)", "minimum lokal:(1, -2)"]);
  });
  it("differentiates implicitly", () => {
    const s = solveImplicit("", ex("x^2 + y^2"), ex("25"));
    expect(s.answers[0].text).toBe("-x/y");
    expect(s.verification.checks.every((c) => c.passed)).toBe(true);
  });
});
