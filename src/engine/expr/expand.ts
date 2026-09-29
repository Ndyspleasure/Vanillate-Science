/**
 * Algebraic transformations: expansion, numerator/denominator split, combining fractions.
 */
import { MAX_TERMS, tick } from "../core/budget";
import { MathError } from "../core/errors";
import { binomial } from "../core/numtheory";
import { Rational } from "../core/rational";
import { add, mul, pow, fn, ONE, MINUS_ONE } from "./simplify";
import { exprKey, rawNum, type Expr } from "./types";

function termsOf(e: Expr): readonly Expr[] {
  return e.type === "add" ? e.terms : [e];
}

function guardTerms(n: number): void {
  if (n > MAX_TERMS) {
    throw new MathError("limit-exceeded", "Hasil ekspansi terlalu besar.", {
      module: "expand",
      operation: "expand",
      cause: `Ekspansi akan menghasilkan lebih dari ${MAX_TERMS} suku.`,
      hint: "Gunakan bentuk yang belum dijabarkan atau kecilkan pangkat.",
    });
  }
}

/** Multiply two expanded expressions, distributing over sums. */
export function expandProduct(a: Expr, b: Expr): Expr {
  const ta = termsOf(a);
  const tb = termsOf(b);
  guardTerms(ta.length * tb.length);
  const out: Expr[] = [];
  for (const x of ta) {
    for (const y of tb) {
      tick("expand");
      out.push(mul(x, y));
    }
  }
  return add(...out);
}

/** Expand (sum)^n for a positive integer n. */
export function expandPower(base: Expr, n: number): Expr {
  const terms = termsOf(base);
  if (terms.length === 1) return pow(base, rawNum(Rational.of(n)));
  // estimated number of terms: C(n + k - 1, k - 1)
  const est = binomial(BigInt(n + terms.length - 1), BigInt(terms.length - 1));
  guardTerms(Number(est > BigInt(MAX_TERMS + 1) ? BigInt(MAX_TERMS + 1) : est));
  if (terms.length === 2) {
    // binomial theorem
    const [a, b] = terms;
    const out: Expr[] = [];
    for (let k = 0; k <= n; k++) {
      tick("expand-binomial");
      out.push(
        mul(
          rawNum(Rational.of(binomial(BigInt(n), BigInt(k)))),
          expandedPow(a, n - k),
          expandedPow(b, k),
        ),
      );
    }
    return add(...out.map((t) => expand(t)));
  }
  let result: Expr = ONE;
  let p = base;
  let k = n;
  // binary exponentiation keeps intermediate results small
  while (k > 0) {
    if (k & 1) result = expandProduct(result, p);
    k >>= 1;
    if (k > 0) p = expandProduct(p, p);
  }
  return result;
}

function expandedPow(a: Expr, k: number): Expr {
  if (k === 0) return ONE;
  return expand(pow(a, rawNum(Rational.of(k))));
}

/**
 * Full expansion: distributes products over sums and expands positive integer powers of sums.
 * Denominators (negative powers) are kept as factors of each term.
 */
export function expand(e: Expr): Expr {
  tick("expand");
  switch (e.type) {
    case "num":
    case "sym":
      return e;
    case "add":
      return add(...e.terms.map(expand));
    case "mul": {
      let result: Expr = ONE;
      for (const f of e.factors) result = expandProduct(result, expand(f));
      return result;
    }
    case "pow": {
      const base = expand(e.base);
      const x = e.exp;
      if (x.type === "num" && x.value.isInteger() && base.type === "add") {
        const n = Number(x.value.num);
        if (n > 0) {
          if (n > 1000)
            throw new MathError("limit-exceeded", "Pangkat terlalu besar untuk dijabarkan.", {
              module: "expand",
            });
          return expandPower(base, n);
        }
        if (n < 0) {
          return pow(n === -1 ? base : expandPower(base, -n), MINUS_ONE);
        }
      }
      return pow(base, expand(x));
    }
    case "fn":
      return fn(e.name, ...e.args.map(expand));
  }
}

/** Numerator and denominator of a canonical expression (denominator from negative exponents). */
export function numerDenom(e: Expr): { numer: Expr; denom: Expr } {
  if (e.type === "pow" && e.exp.type === "num" && e.exp.value.isNegative()) {
    return { numer: ONE, denom: pow(e.base, rawNum(e.exp.value.neg())) };
  }
  if (e.type === "num")
    return { numer: rawNum(Rational.of(e.value.num)), denom: rawNum(Rational.of(e.value.den)) };
  if (e.type === "mul") {
    const nums: Expr[] = [];
    const dens: Expr[] = [];
    for (const f of e.factors) {
      const nd = numerDenom(f);
      nums.push(nd.numer);
      dens.push(nd.denom);
    }
    return { numer: mul(...nums), denom: mul(...dens) };
  }
  return { numer: e, denom: ONE };
}

/**
 * Combine a sum of fractions over a common denominator: a/b + c/d = (ad + cb)/(bd).
 * Uses the product of distinct denominators (not a polynomial LCM); cancellation is done by
 * `cancelRational` when polynomial structure is available.
 */
export function together(e: Expr): { numer: Expr; denom: Expr } {
  if (e.type !== "add") return numerDenom(e);
  const parts = e.terms.map(numerDenom);
  // collect distinct denominator factors with maximal multiplicity
  const denomFactors = new Map<string, { base: Expr; exp: Rational }>();
  const factorList = (d: Expr): Array<{ base: Expr; exp: Rational }> => {
    const fs = d.type === "mul" ? d.factors : [d];
    return fs.map((f) =>
      f.type === "pow" && f.exp.type === "num"
        ? { base: f.base, exp: f.exp.value }
        : { base: f, exp: Rational.ONE },
    );
  };
  for (const p of parts) {
    for (const f of factorList(p.denom)) {
      if (f.base.type === "num") {
        continue;
      }
      const k = exprKey(f.base);
      const cur = denomFactors.get(k);
      if (!cur || f.exp.gt(cur.exp)) denomFactors.set(k, f);
    }
  }
  // numeric part: lcm of numeric denominators
  let numericLcm = 1n;
  for (const p of parts) {
    const fs = p.denom.type === "mul" ? p.denom.factors : [p.denom];
    for (const f of fs) {
      if (f.type === "num") {
        const d = f.value.num < 0n ? -f.value.num : f.value.num;
        numericLcm = (numericLcm * d) / gcdBig(numericLcm, d);
      }
    }
  }
  const common = mul(
    rawNum(Rational.of(numericLcm)),
    ...[...denomFactors.values()].map((f) => pow(f.base, rawNum(f.exp))),
  );
  const numerTerms = parts.map((p) => expand(mul(p.numer, common, pow(p.denom, MINUS_ONE))));
  return { numer: add(...numerTerms), denom: common };
}

function gcdBig(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}
