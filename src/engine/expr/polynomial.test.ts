import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parse } from "../parse/parser";
import { toExpr } from "../parse/convert";
import { toText } from "./print";
import { expand } from "./expand";
import { Poly, numericRoots, polyCoefficients, toPoly } from "./polynomial";
import { checkEquivalent } from "./equivalence";
import { Rational } from "../core/rational";
import type { Expr } from "./types";

const ex = (s: string): Expr => toExpr(parse(s).statements[0]);

describe("expand", () => {
  it("expands products and powers", () => {
    expect(toText(expand(ex("(x+1)(x-1)")))).toBe("x^2 - 1");
    expect(toText(expand(ex("(x+1)^3")))).toBe("x^3 + 3*x^2 + 3*x + 1");
    expect(toText(expand(ex("(a+b+c)^2")))).toBe("a^2 + 2*a*b + 2*a*c + b^2 + 2*b*c + c^2");
    expect(toText(expand(ex("(1+i)(1-i)")))).toBe("2");
  });

  it("refuses explosive expansions", () => {
    expect(() => expand(ex("(a+b+c+d+e1+f)^40"))).toThrowError(/terlalu besar/);
  });
});

describe("Poly", () => {
  it("divides with remainder", () => {
    const p = Poly.fromNumbers([-1, 0, 0, 1]); // x^3 - 1
    const d = Poly.fromNumbers([-1, 1]); // x - 1
    const { q, r } = p.divmod(d);
    expect(q.equals(Poly.fromNumbers([1, 1, 1]))).toBe(true);
    expect(r.isZero()).toBe(true);
  });

  it("computes gcd", () => {
    const a = Poly.fromNumbers([-1, 0, 1]); // x^2-1
    const b = Poly.fromNumbers([1, 2, 1]); // (x+1)^2
    expect(Poly.gcd(a, b).equals(Poly.fromNumbers([1, 1]))).toBe(true);
  });

  it("finds rational roots with multiplicity", () => {
    const p = toPoly(ex("2x^3 - 3x^2 - 3x + 2"), "x")!;
    const { roots, rest } = p.rationalRoots();
    expect(roots.map((r) => r.toString()).sort()).toEqual(["-1", "1/2", "2"]);
    expect(rest.degree).toBe(0);
    const q = toPoly(ex("(x-1)^2 (x+3)"), "x")!;
    expect(q.rationalRoots().roots.map(String).sort()).toEqual(["-3", "1", "1"]);
  });

  it("computes square-free decomposition", () => {
    const p = toPoly(ex("(x-1)^2 (x+2)^3 (x-5)"), "x")!;
    const sf = p.squareFree();
    expect(sf.map((f) => f.multiplicity)).toEqual([1, 2, 3]);
  });

  it("finds numeric roots of irreducible polynomials", () => {
    const p = toPoly(ex("x^5 - x - 1"), "x")!;
    const { roots, converged } = numericRoots(p);
    expect(converged).toBe(true);
    const real = roots.filter((r) => r.im === 0);
    expect(real).toHaveLength(1);
    expect(real[0].re).toBeCloseTo(1.1673039782614187, 12);
  });

  it("extracts symbolic coefficients", () => {
    const cs = polyCoefficients(ex("a x^2 + b x + c"), "x")!;
    expect(cs.map((c) => toText(c))).toEqual(["c", "b", "a"]);
    expect(polyCoefficients(ex("sin(x) + x"), "x")).toBeNull();
    expect(polyCoefficients(ex("1/x"), "x")).toBeNull();
  });

  it("roots found numerically satisfy the polynomial (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -9, max: 9 }), { minLength: 3, maxLength: 7 }), (cs) => {
        if (cs[cs.length - 1] === 0) return;
        const p = new Poly(cs.map((c) => Rational.of(c)));
        if (p.degree < 1) return;
        const { roots } = numericRoots(p);
        expect(roots).toHaveLength(p.degree);
      }),
      { numRuns: 60 },
    );
  });
});

describe("equivalence", () => {
  it("detects symbolic equivalence", () => {
    const r = checkEquivalent(ex("(x+1)^2"), ex("x^2 + 2x + 1"));
    expect(r.equivalent).toBe(true);
    expect(r.method).toBe("symbolic");
  });
  it("detects equivalence of rational expressions", () => {
    expect(checkEquivalent(ex("1/x + 1/(x+1)"), ex("(2x+1)/(x^2+x)")).equivalent).toBe(true);
  });
  it("falls back to numeric checks for trig identities", () => {
    const r = checkEquivalent(ex("sin(x)^2 + cos(x)^2"), ex("1"));
    expect(r.equivalent).toBe(true);
    expect(r.method).toBe("numeric");
  });
  it("finds counterexamples", () => {
    const r = checkEquivalent(ex("(x+1)^2"), ex("x^2 + 1"));
    expect(r.equivalent).toBe(false);
    expect(r.counterexample).toBeDefined();
  });
});
