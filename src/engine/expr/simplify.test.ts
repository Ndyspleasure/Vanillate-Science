import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parse } from "../parse/parser";
import { toExpr } from "../parse/convert";
import { toLatex, toText } from "./print";
import { evalReal } from "./evaluate";
import type { Expr } from "./types";

function ex(input: string): Expr {
  const r = parse(input);
  return toExpr(r.statements[0]);
}
const t = (input: string) => toText(ex(input));
const l = (input: string) => toLatex(ex(input));

describe("automatic simplification", () => {
  it("collects like terms and numbers", () => {
    expect(t("2x + 3x")).toBe("5*x");
    expect(t("x + x + 1 + 2")).toBe("2*x + 3");
    expect(t("x - x")).toBe("0");
    expect(t("3*4 + 2")).toBe("14");
  });

  it("keeps exact fractions", () => {
    expect(t("1/3")).toBe("1/3");
    expect(t("1/3 + 1/6")).toBe("1/2");
    expect(t("0.1 + 0.2")).toBe("3/10");
  });

  it("combines powers", () => {
    expect(t("x*x")).toBe("x^2");
    expect(t("x^2 * x^3")).toBe("x^5");
    expect(t("x^3 / x")).toBe("x^2");
    expect(t("(x^2)^3")).toBe("x^6");
  });

  it("simplifies radicals exactly", () => {
    expect(t("sqrt(72)")).toBe("6*sqrt(2)");
    expect(t("sqrt(8) * sqrt(2)")).toBe("4");
    expect(t("sqrt(2) * sqrt(3)")).toBe("sqrt(6)");
    expect(t("1/sqrt(2)")).toBe("sqrt(2)/2");
    expect(t("sqrt(1/3)")).toBe("sqrt(3)/3");
    expect(t("cbrt(-8)")).toBe("-2");
    expect(t("4^(1/4)")).toBe("sqrt(2)");
    expect(t("sqrt(-4)")).toBe("2*i");
    expect(t("8^(2/3)")).toBe("4");
  });

  it("uses |x| for even roots of even powers", () => {
    expect(t("sqrt(x^2)")).toBe("abs(x)");
    expect(t("(x^4)^(1/2)")).toBe("x^2");
  });

  it("evaluates exact trig values", () => {
    expect(t("sin(pi/6)")).toBe("1/2");
    expect(t("cos(pi/4)")).toBe("sqrt(2)/2");
    expect(t("tan(pi/3)")).toBe("sqrt(3)");
    expect(t("tan(pi/6)")).toBe("sqrt(3)/3");
    expect(t("sin(30°)")).toBe("1/2");
    expect(t("cos(pi)")).toBe("-1");
    expect(t("sin(-x)")).toBe("-sin(x)");
    expect(t("cos(-x)")).toBe("cos(x)");
    expect(t("asin(1/2)")).toBe("pi/6");
    expect(t("acos(1/2)")).toBe("pi/3");
  });

  it("rejects undefined values with domain errors", () => {
    expect(() => ex("tan(pi/2)")).toThrowError(/tidak terdefinisi/);
    expect(() => ex("ln(0)")).toThrowError(/tidak terdefinisi/);
    expect(() => ex("asin(2)")).toThrowError(/tidak terdefinisi/);
    expect(() => ex("1/0")).toThrowError(/nol/);
    expect(() => ex("0^0")).toThrowError(/tidak terdefinisi/);
  });

  it("handles logarithms", () => {
    expect(t("ln(e)")).toBe("1");
    expect(t("ln(e^x)")).toBe("x");
    expect(t("log(1000)")).toBe("3");
    expect(t("log_2(8)")).toBe("3");
    expect(t("log_4(8)")).toBe("3/2");
    expect(t("e^(ln(x))")).toBe("x");
  });

  it("distributes numeric coefficients over a single sum", () => {
    expect(t("2(x+1)")).toBe("2*x + 2");
    expect(t("-(x-1)")).toBe("-x + 1");
  });

  it("handles the imaginary unit", () => {
    expect(t("i^2")).toBe("-1");
    expect(t("i^3")).toBe("-i");
    expect(t("i*i*i*i")).toBe("1");
  });

  it("computes factorials and binomials", () => {
    expect(t("5!")).toBe("120");
    expect(t("binomial(10, 3)")).toBe("120");
    expect(t("nPr(5, 2)")).toBe("20");
  });

  it("prints LaTeX", () => {
    expect(l("x^2 + 3x - 5")).toBe("x^{2} + 3 x - 5");
    expect(l("1/2")).toBe("\\frac{1}{2}");
    expect(l("(x+1)/(x-1)")).toBe("\\frac{x + 1}{x - 1}");
    expect(l("sqrt(2)/2")).toBe("\\frac{\\sqrt{2}}{2}");
    expect(l("sin(x)^2")).toBe("\\sin^{2}\\left(x\\right)");
    expect(l("2 pi r")).toBe("2 \\pi r");
    expect(l("theta")).toBe("\\theta");
    expect(l("v_0 t")).toBe("t v_{0}");
  });

  it("text output re-parses to the same value (property)", () => {
    const leaves = ["x", "2", "3", "1/2", "pi", "sqrt(2)"];
    const arbExpr: fc.Arbitrary<string> = fc.letrec((tie) => ({
      e: fc.oneof(
        { depthSize: "small" },
        fc.constantFrom(...leaves),
        fc
          .tuple(tie("e"), fc.constantFrom("+", "-", "*"), tie("e"))
          .map(([a, op, b]) => `(${a})${op}(${b})`),
        fc.tuple(tie("e"), fc.integer({ min: 0, max: 3 })).map(([a, n]) => `(${a})^${n}`),
        fc.tuple(fc.constantFrom("sin", "cos", "exp"), tie("e")).map(([f, a]) => `${f}(${a})`),
      ),
    })).e;
    fc.assert(
      fc.property(arbExpr, fc.double({ min: -2, max: 2, noNaN: true }), (s, x) => {
        let e: Expr;
        try {
          e = ex(s);
        } catch {
          return; // domain errors like 0^0 are acceptable
        }
        const again = ex(toText(e));
        const v1 = evalReal(e, { x });
        const v2 = evalReal(again, { x });
        if (Number.isFinite(v1) && Math.abs(v1) < 1e6) {
          expect(Math.abs(v1 - v2)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(v1)));
        }
      }),
      { numRuns: 300 },
    );
  });

  it("simplification preserves numeric value (property)", () => {
    const arb = fc.tuple(
      fc.integer({ min: -5, max: 5 }),
      fc.integer({ min: 1, max: 5 }),
      fc.integer({ min: -5, max: 5 }),
      fc.double({ min: 0.1, max: 3, noNaN: true }),
    );
    fc.assert(
      fc.property(arb, ([a, b, c, x]) => {
        const src = `(${a}x + ${b})^2 - ${c}x/${b} + sqrt(${b * b}x^2)`;
        const direct = (a * x + b) ** 2 - (c * x) / b + Math.sqrt(b * b * x * x);
        const v = evalReal(ex(src), { x });
        expect(Math.abs(v - direct)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(direct)));
      }),
    );
  });
});
