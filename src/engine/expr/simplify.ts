/**
 * Smart constructors implementing automatic simplification.
 *
 * Based on the automatic simplification algorithm (simplify_sum / simplify_product /
 * simplify_power) described in J. S. Cohen, "Computer Algebra and Symbolic Computation:
 * Elementary Algorithms", A K Peters, 2002, extended with:
 *  - exact numeric radicals (sqrt(72) = 6 sqrt(2), rationalized denominators);
 *  - exact values of trigonometric functions at multiples of pi/12;
 *  - logarithm/exponential inverse pairs;
 *  - distribution of a numeric coefficient over a single sum (as in SymPy).
 *
 * Every function here returns a canonical expression provided its inputs are canonical.
 * Assumption: symbols denote real numbers (see docs/ENGINE.md).
 */
import { tick } from "../core/budget";
import { domainError, MathError } from "../core/errors";
import { factorInteger, extractPower, perfectPower, factorial as bigFactorial, binomial as bigBinomial } from "../core/numtheory";
import { bigGcd, bigLcm, bitLength, Rational } from "../core/rational";
import { evalReal } from "./evaluate";
import {
  compareExpr,
  exprEquals,
  exprKey,
  isConstantExpr,
  rawAdd,
  rawFn,
  rawMul,
  rawNum,
  rawPow,
  rawSym,
  type Expr,
  type Fn,
} from "./types";

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

export function num(v: Rational | number | bigint | string): Expr {
  if (v instanceof Rational) return rawNum(v);
  if (typeof v === "bigint") return rawNum(Rational.of(v));
  if (typeof v === "number") return rawNum(Number.isInteger(v) ? Rational.of(v) : Rational.fromNumber(v));
  const parsed = v.includes("/") ? parseFraction(v) : Rational.parseDecimal(v);
  if (!parsed) throw new Error(`Invalid numeric literal ${v}`);
  return rawNum(parsed);
}

function parseFraction(s: string): Rational | null {
  const [a, b] = s.split("/");
  const n = Rational.parseDecimal(a);
  const d = Rational.parseDecimal(b);
  return n && d ? n.div(d) : null;
}

export const frac = (n: number | bigint, d: number | bigint) => rawNum(Rational.of(n, d));
export const sym = (name: string) => rawSym(name);

export const ZERO = rawNum(Rational.ZERO);
export const ONE = rawNum(Rational.ONE);
export const MINUS_ONE = rawNum(Rational.MINUS_ONE);
export const TWO = rawNum(Rational.TWO);
export const HALF = rawNum(Rational.HALF);
export const PI = rawSym("pi");
export const E = rawSym("e");
export const I = rawSym("i");

// ---------------------------------------------------------------------------
// Sum
// ---------------------------------------------------------------------------

/** Split a canonical term into numeric coefficient and remaining (non-numeric) part. */
export function splitCoefficient(t: Expr): { coef: Rational; rest: Expr | null } {
  if (t.type === "num") return { coef: t.value, rest: null };
  if (t.type === "mul" && t.factors[0].type === "num") {
    const rest = t.factors.length === 2 ? t.factors[1] : rawMul(t.factors.slice(1));
    return { coef: t.factors[0].value, rest };
  }
  return { coef: Rational.ONE, rest: t };
}

function withCoefficient(coef: Rational, rest: Expr): Expr {
  if (coef.isOne()) return rest;
  if (rest.type === "mul") return rawMul([rawNum(coef), ...rest.factors]);
  return rawMul([rawNum(coef), rest]);
}

export function add(...terms: Expr[]): Expr {
  let constant = Rational.ZERO;
  const groups = new Map<string, { rest: Expr; coef: Rational }>();
  const queue: Expr[] = [...terms];
  while (queue.length) {
    tick("simplify-sum");
    const t = queue.pop()!;
    if (t.type === "add") {
      queue.push(...t.terms);
      continue;
    }
    const { coef, rest } = splitCoefficient(t);
    if (rest === null) {
      constant = constant.add(coef);
      continue;
    }
    const k = exprKey(rest);
    const g = groups.get(k);
    if (g) g.coef = g.coef.add(coef);
    else groups.set(k, { rest, coef });
  }
  const result: Expr[] = [];
  for (const g of groups.values()) {
    if (!g.coef.isZero()) result.push(withCoefficient(g.coef, g.rest));
  }
  if (!constant.isZero()) result.push(rawNum(constant));
  if (result.length === 0) return ZERO;
  if (result.length === 1) return result[0];
  result.sort(compareExpr);
  return rawAdd(result);
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

function isNumericRadical(e: Expr): e is Expr & { type: "pow" } {
  return (
    e.type === "pow" &&
    e.base.type === "num" &&
    e.base.value.isInteger() &&
    e.base.value.isPositive() &&
    e.exp.type === "num" &&
    e.exp.value.num === 1n
  );
}

export function mul(...factors: Expr[]): Expr {
  return buildProduct(factors, 0);
}

function buildProduct(input: readonly Expr[], depth: number): Expr {
  if (depth > 20) throw new MathError("internal", "Penyederhanaan perkalian tidak konvergen.", { module: "simplify", operation: "product" });
  let coef = Rational.ONE;
  const groups = new Map<string, { base: Expr; exps: Expr[]; original: Expr }>();
  const queue: Expr[] = [...input];
  while (queue.length) {
    tick("simplify-product");
    const f = queue.pop()!;
    if (f.type === "mul") {
      queue.push(...f.factors);
      continue;
    }
    if (f.type === "num") {
      if (f.value.isZero()) return ZERO;
      coef = coef.mul(f.value);
      continue;
    }
    const base = f.type === "pow" ? f.base : f;
    const exp = f.type === "pow" ? f.exp : ONE;
    const k = exprKey(base);
    const g = groups.get(k);
    if (g) g.exps.push(exp);
    else groups.set(k, { base, exps: [exp], original: f });
  }

  const result: Expr[] = [];
  const reprocess: Expr[] = [];
  for (const g of groups.values()) {
    if (g.exps.length === 1) {
      result.push(g.original);
      continue;
    }
    const p = pow(g.base, add(...g.exps));
    if (p.type === "num") {
      if (p.value.isZero()) return ZERO;
      coef = coef.mul(p.value);
    } else if (p.type === "mul") reprocess.push(p);
    else result.push(p);
  }
  if (reprocess.length) return buildProduct([rawNum(coef), ...result, ...reprocess], depth + 1);

  // Merge numeric radicals with equal index: sqrt(2) * sqrt(3) = sqrt(6).
  const byIndex = new Map<string, Expr[]>();
  for (const f of result) {
    if (isNumericRadical(f)) {
      const key = (f.exp as { value: Rational }).value.toString();
      byIndex.set(key, [...(byIndex.get(key) ?? []), f]);
    }
  }
  for (const [, rads] of byIndex) {
    if (rads.length < 2) continue;
    let prod = 1n;
    for (const r of rads) prod *= ((r as { base: { value: Rational } }).base.value).num;
    const merged = pow(rawNum(Rational.of(prod)), (rads[0] as { exp: Expr }).exp);
    const rest = result.filter((f) => !rads.includes(f));
    return buildProduct([rawNum(coef), ...rest, merged], depth + 1);
  }

  if (coef.isZero()) return ZERO;
  if (!coef.isOne() && result.length === 1 && result[0].type === "add") {
    return add(...result[0].terms.map((t) => mul(rawNum(coef), t)));
  }
  if (result.length === 0) return rawNum(coef);
  result.sort(compareExpr);
  if (coef.isOne() && result.length === 1) return result[0];
  return rawMul(coef.isOne() ? result : [rawNum(coef), ...result]);
}

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

const MAX_RADICAL_BITS = 4000;

/** b^k for rational b and non-integer rational k, with radical extraction. */
function numericRadical(b: Rational, k: Rational): Expr {
  const whole = k.floor();
  const fracPart = k.sub(Rational.of(whole)); // in (0, 1)
  const r = Number(fracPart.num);
  const q = Number(fracPart.den);
  let coef = b.pow(whole);
  const extra: Expr[] = [];

  let absB = b.abs();
  if (b.isNegative()) {
    if (q % 2 === 1) {
      if (r % 2 === 1) coef = coef.neg();
    } else if (q === 2) {
      extra.push(I); // (-a)^(1/2) = i a^(1/2), principal branch
    } else {
      extra.push(rawPow(MINUS_ONE, rawNum(fracPart)));
    }
  }
  // |b|^(r/q) = (n^r d^(q-r))^(1/q) / d  (rationalized)
  const n = absB.num;
  const d = absB.den;
  if ((bitLength(n) * r + bitLength(d) * (q - r)) > MAX_RADICAL_BITS) {
    const radical = rawPow(rawNum(absB), rawNum(fracPart));
    return finishRadical(coef, radical, extra);
  }
  const M = n ** BigInt(r) * d ** BigInt(q - r);
  coef = coef.div(Rational.of(d));
  const { outside, inside } = extractPower(M, q);
  coef = coef.mul(Rational.of(outside));
  if (inside === 1n) return finishRadical(coef, null, extra);
  // Reduce the index when inside is itself a perfect power: 4^(1/4) = 2^(1/2).
  let base = inside;
  let index = q;
  const pp = perfectPower(inside);
  if (pp) {
    const g = Number(bigGcd(BigInt(pp.exp), BigInt(q)));
    if (g > 1 && pp.exp / g === 1) {
      base = pp.base;
      index = q / g;
    } else if (g > 1) {
      const newExp = pp.exp / g;
      base = pp.base ** BigInt(newExp);
      index = q / g;
    }
  }
  absB = Rational.of(base);
  return finishRadical(coef, rawPow(rawNum(absB), rawNum(Rational.of(1, index))), extra);
}

function finishRadical(coef: Rational, radical: Expr | null, extra: Expr[]): Expr {
  const parts: Expr[] = [];
  if (radical) parts.push(radical);
  parts.push(...extra);
  if (parts.length === 0) return rawNum(coef);
  parts.sort(compareExpr);
  if (coef.isOne() && parts.length === 1) return parts[0];
  return rawMul(coef.isOne() ? parts : [rawNum(coef), ...parts]);
}

export function pow(base: Expr, exp: Expr): Expr {
  tick("simplify-power");
  if (exp.type === "num") {
    const k = exp.value;
    if (k.isZero()) {
      if (base.type === "num" && base.value.isZero()) {
        throw domainError("Bentuk 0^0 tidak terdefinisi.", {
          module: "simplify",
          operation: "power",
          cause: "0 dipangkatkan 0 adalah bentuk tak tentu.",
        });
      }
      return ONE;
    }
    if (k.isOne()) return base;
  }
  if (base.type === "num") {
    const b = base.value;
    if (b.isZero()) {
      if (exp.type === "num") {
        if (exp.value.isNegative()) {
          throw new MathError("division-by-zero", "Pembagian dengan nol tidak terdefinisi.", {
            module: "simplify",
            operation: "power",
            cause: "0 dipangkatkan bilangan negatif sama dengan 1/0.",
          });
        }
        return ZERO;
      }
      return rawPow(base, exp);
    }
    if (b.isOne()) return ONE;
    if (exp.type === "num") {
      const k = exp.value;
      if (k.isInteger()) return rawNum(b.pow(k.num));
      return numericRadical(b, k);
    }
    return rawPow(base, exp);
  }
  if (base.type === "sym" && base.name === "i" && exp.type === "num" && exp.value.isInteger()) {
    const m = Number(((exp.value.num % 4n) + 4n) % 4n);
    return [ONE, I, MINUS_ONE, rawMul([MINUS_ONE, I])][m];
  }
  if (base.type === "pow") {
    if (exp.type === "num" && exp.value.isInteger()) return pow(base.base, mul(base.exp, exp));
    if (base.exp.type === "num" && base.exp.value.isInteger() && exp.type === "num") {
      const m = base.exp.value;
      const product = m.mul(exp.value);
      if (m.num % 2n !== 0n) return pow(base.base, rawNum(product));
      // (x^(2j))^k = |x|^(2jk)
      if (product.isInteger() && product.num % 2n === 0n) return pow(base.base, rawNum(product));
      return pow(fn("abs", base.base), rawNum(product));
    }
    return rawPow(base, exp);
  }
  if (base.type === "mul") {
    if (exp.type === "num" && exp.value.isInteger()) {
      return mul(...base.factors.map((f) => pow(f, exp)));
    }
    const first = base.factors[0];
    if (first.type === "num" && first.value.isPositive()) {
      const rest = base.factors.length === 2 ? base.factors[1] : rawMul(base.factors.slice(1));
      return mul(pow(first, exp), pow(rest, exp));
    }
    return rawPow(base, exp);
  }
  if (base.type === "sym" && base.name === "e") {
    if (exp.type === "fn" && exp.name === "ln") return exp.args[0];
    if (exp.type === "mul" && exp.factors.length === 2 && exp.factors[0].type === "num" && exp.factors[1].type === "fn" && exp.factors[1].name === "ln") {
      return pow(exp.factors[1].args[0], exp.factors[0]);
    }
  }
  if (base.type === "fn" && base.name === "abs" && exp.type === "num" && exp.value.isInteger() && exp.value.num % 2n === 0n) {
    return pow(base.args[0], exp);
  }
  return rawPow(base, exp);
}

// ---------------------------------------------------------------------------
// Derived constructors
// ---------------------------------------------------------------------------

export const neg = (a: Expr): Expr => mul(MINUS_ONE, a);
export const sub = (a: Expr, b: Expr): Expr => add(a, neg(b));
export const div = (a: Expr, b: Expr): Expr => {
  if (b.type === "num" && b.value.isZero()) {
    throw new MathError("division-by-zero", "Pembagian dengan nol tidak terdefinisi.", { module: "simplify", operation: "divide" });
  }
  return mul(a, pow(b, MINUS_ONE));
};
export const sqrt = (a: Expr): Expr => pow(a, HALF);
export const exp = (a: Expr): Expr => pow(E, a);
export const ln = (a: Expr): Expr => fn("ln", a);

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/** If e = c*pi for rational c (or 0), return c. */
export function piMultiple(e: Expr): Rational | null {
  if (e.type === "num" && e.value.isZero()) return Rational.ZERO;
  if (e.type === "sym" && e.name === "pi") return Rational.ONE;
  if (e.type === "mul" && e.factors.length === 2 && e.factors[0].type === "num" && e.factors[1].type === "sym" && e.factors[1].name === "pi") {
    return e.factors[0].value;
  }
  return null;
}

const r2 = () => rawPow(rawNum(Rational.of(2)), HALF);
const r3 = () => rawPow(rawNum(Rational.of(3)), HALF);
const r6 = () => rawPow(rawNum(Rational.of(6)), HALF);

let sinTableCache: Expr[] | null = null;
function sinTable(): Expr[] {
  if (!sinTableCache) {
    const q = frac(1, 4);
    sinTableCache = [
      ZERO,
      add(mul(q, r6()), mul(frac(-1, 4), r2())),
      HALF,
      mul(HALF, r2()),
      mul(HALF, r3()),
      add(mul(q, r6()), mul(q, r2())),
      ONE,
    ];
  }
  return sinTableCache;
}

/** Exact sin(k*pi/12) for integer k. */
export function sinTwelfth(k: number): Expr {
  const m = ((k % 24) + 24) % 24;
  if (m <= 6) return sinTable()[m];
  if (m <= 12) return sinTable()[12 - m];
  return neg(sinTwelfth(m - 12));
}

function twelfthIndex(arg: Expr): number | null {
  const c = piMultiple(arg);
  if (!c) return null;
  const t = c.mul(Rational.of(12));
  return t.isInteger() ? Number(t.num % 24n) : null;
}

function isNegativeLooking(e: Expr): boolean {
  if (e.type === "num") return e.value.isNegative();
  if (e.type === "mul" && e.factors[0].type === "num") return e.factors[0].value.isNegative();
  return false;
}

let invTrigTables: { asin: Map<string, Expr>; atan: Map<string, Expr> } | null = null;
function inverseTables() {
  if (!invTrigTables) {
    const asin = new Map<string, Expr>();
    const atan = new Map<string, Expr>();
    const put = (m: Map<string, Expr>, v: Expr, res: Expr) => {
      m.set(exprKey(v), res);
      m.set(exprKey(neg(v)), neg(res));
    };
    put(asin, ZERO, ZERO);
    put(asin, HALF, mul(frac(1, 6), PI));
    put(asin, mul(HALF, r2()), mul(frac(1, 4), PI));
    put(asin, mul(HALF, r3()), mul(frac(1, 3), PI));
    put(asin, ONE, mul(HALF, PI));
    put(atan, ZERO, ZERO);
    put(atan, mul(frac(1, 3), r3()), mul(frac(1, 6), PI));
    put(atan, ONE, mul(frac(1, 4), PI));
    put(atan, r3(), mul(frac(1, 3), PI));
    invTrigTables = { asin, atan };
  }
  return invTrigTables;
}

const ODD_FUNCTIONS = new Set(["sin", "tan", "cot", "csc", "asin", "atan", "acot", "acsc", "sinh", "tanh", "coth", "csch", "asinh", "atanh"]);
const EVEN_FUNCTIONS = new Set(["cos", "sec", "cosh", "sech"]);

export const KNOWN_FUNCTIONS: Record<string, { min: number; max: number }> = {
  sin: { min: 1, max: 1 }, cos: { min: 1, max: 1 }, tan: { min: 1, max: 1 },
  cot: { min: 1, max: 1 }, sec: { min: 1, max: 1 }, csc: { min: 1, max: 1 },
  asin: { min: 1, max: 1 }, acos: { min: 1, max: 1 }, atan: { min: 1, max: 1 },
  acot: { min: 1, max: 1 }, asec: { min: 1, max: 1 }, acsc: { min: 1, max: 1 },
  sinh: { min: 1, max: 1 }, cosh: { min: 1, max: 1 }, tanh: { min: 1, max: 1 },
  coth: { min: 1, max: 1 }, sech: { min: 1, max: 1 }, csch: { min: 1, max: 1 },
  asinh: { min: 1, max: 1 }, acosh: { min: 1, max: 1 }, atanh: { min: 1, max: 1 },
  ln: { min: 1, max: 1 }, log: { min: 1, max: 2 }, abs: { min: 1, max: 1 },
  sign: { min: 1, max: 1 }, floor: { min: 1, max: 1 }, ceil: { min: 1, max: 1 },
  round: { min: 1, max: 1 }, factorial: { min: 1, max: 1 }, gamma: { min: 1, max: 1 },
  atan2: { min: 2, max: 2 }, mod: { min: 2, max: 2 }, min: { min: 1, max: 50 },
  max: { min: 1, max: 50 }, gcd: { min: 2, max: 50 }, lcm: { min: 2, max: 50 },
  binomial: { min: 2, max: 2 }, re: { min: 1, max: 1 }, im: { min: 1, max: 1 },
  conj: { min: 1, max: 1 }, arg: { min: 1, max: 1 },
};

/** Safe numeric sign of a constant expression, or null when too close to zero to decide. */
export function constantSign(e: Expr): -1 | 0 | 1 | null {
  if (e.type === "num") return e.value.sign();
  if (!isConstantExpr(e)) return null;
  const v = evalReal(e);
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v) < 1e-10) return null;
  return v > 0 ? 1 : -1;
}

function exactLog(x: Rational, b: Rational): Rational | null {
  // x = b^r  <=> exponent vectors proportional
  if (!x.isPositive() || !b.isPositive() || b.isOne()) return null;
  if (x.isOne()) return Rational.ZERO;
  if (bitLength(x.num) + bitLength(x.den) + bitLength(b.num) + bitLength(b.den) > 400) return null;
  const vec = (r: Rational) => {
    const m = new Map<bigint, number>();
    if (r.num > 1n) for (const [p, e] of factorInteger(r.num)) m.set(p, e);
    if (r.den > 1n) for (const [p, e] of factorInteger(r.den)) m.set(p, (m.get(p) ?? 0) - e);
    return m;
  };
  const vx = vec(x);
  const vb = vec(b);
  let ratio: Rational | null = null;
  const primes = new Set([...vx.keys(), ...vb.keys()]);
  for (const p of primes) {
    const ex = vx.get(p) ?? 0;
    const eb = vb.get(p) ?? 0;
    if (eb === 0) return null;
    const r = Rational.of(ex, eb);
    if (ratio === null) ratio = r;
    else if (!ratio.equals(r)) return null;
  }
  return ratio;
}

export function fn(name: string, ...args: Expr[]): Expr {
  tick("simplify-function");
  const spec = KNOWN_FUNCTIONS[name];
  if (spec && (args.length < spec.min || args.length > spec.max)) {
    throw new MathError("invalid-input", `Fungsi ${name} menerima ${spec.min === spec.max ? spec.min : `${spec.min}–${spec.max}`} argumen, tetapi diberikan ${args.length}.`, {
      module: "simplify",
      operation: "function",
    });
  }
  const a = args[0];

  // Symmetry: odd/even functions of a negative-looking argument.
  if (args.length === 1 && isNegativeLooking(a)) {
    if (ODD_FUNCTIONS.has(name)) return neg(fn(name, neg(a)));
    if (EVEN_FUNCTIONS.has(name)) return fn(name, neg(a));
  }

  switch (name) {
    case "sin":
    case "cos":
    case "tan":
    case "cot":
    case "sec":
    case "csc": {
      const k = twelfthIndex(a);
      if (k !== null) {
        const s = sinTwelfth(k);
        const c = sinTwelfth(k + 6);
        const undefinedAt = (what: string) =>
          domainError(`${name}(${what}) tidak terdefinisi.`, {
            module: "simplify",
            operation: name,
            cause: `Penyebut bernilai nol karena ${name === "tan" || name === "sec" ? "cos" : "sin"} = 0 pada sudut tersebut.`,
          });
        switch (name) {
          case "sin":
            return s;
          case "cos":
            return c;
          case "tan":
            if (c.type === "num" && c.value.isZero()) throw undefinedAt("kπ + π/2");
            return div(s, c);
          case "cot":
            if (s.type === "num" && s.value.isZero()) throw undefinedAt("kπ");
            return div(c, s);
          case "sec":
            if (c.type === "num" && c.value.isZero()) throw undefinedAt("kπ + π/2");
            return div(ONE, c);
          case "csc":
            if (s.type === "num" && s.value.isZero()) throw undefinedAt("kπ");
            return div(ONE, s);
        }
      }
      // inverse compositions: sin(asin(x)) = x (valid on the domain of asin)
      if (a.type === "fn" && a.args.length === 1) {
        if ((name === "sin" && a.name === "asin") || (name === "cos" && a.name === "acos") || (name === "tan" && a.name === "atan")) {
          return a.args[0];
        }
      }
      break;
    }
    case "asin":
    case "acos": {
      if (a.type === "num" && a.value.abs().gt(Rational.ONE)) {
        throw domainError(`${name}(${a.value.toString()}) tidak terdefinisi pada bilangan real.`, {
          module: "simplify",
          operation: name,
          cause: `Domain ${name} adalah [-1, 1].`,
        });
      }
      const v = inverseTables().asin.get(exprKey(a));
      if (v) return name === "asin" ? v : sub(mul(HALF, PI), v);
      break;
    }
    case "atan": {
      const v = inverseTables().atan.get(exprKey(a));
      if (v) return v;
      break;
    }
    case "sinh":
    case "tanh":
    case "asinh":
    case "atanh":
      if (a.type === "num" && a.value.isZero()) return ZERO;
      break;
    case "cosh":
      if (a.type === "num" && a.value.isZero()) return ONE;
      break;
    case "ln": {
      if (a.type === "num") {
        if (a.value.isOne()) return ZERO;
        if (!a.value.isPositive()) {
          throw domainError(`ln(${a.value.toString()}) tidak terdefinisi pada bilangan real.`, {
            module: "simplify",
            operation: "ln",
            cause: "Logaritma natural hanya terdefinisi untuk bilangan positif.",
          });
        }
      }
      if (a.type === "sym" && a.name === "e") return ONE;
      if (a.type === "pow" && a.base.type === "sym" && a.base.name === "e") return a.exp;
      break;
    }
    case "log": {
      const base = args[1] ?? rawNum(Rational.of(10));
      if (base.type === "num" && (!base.value.isPositive() || base.value.isOne())) {
        throw domainError("Basis logaritma harus positif dan tidak sama dengan 1.", { module: "simplify", operation: "log" });
      }
      if (a.type === "num" && !a.value.isPositive()) {
        throw domainError(`log(${a.value.toString()}) tidak terdefinisi pada bilangan real.`, {
          module: "simplify",
          operation: "log",
          cause: "Logaritma hanya terdefinisi untuk bilangan positif.",
        });
      }
      if (exprEquals(a, base)) return ONE;
      if (a.type === "num" && a.value.isOne()) return ZERO;
      if (a.type === "pow" && exprEquals(a.base, base)) return a.exp;
      if (a.type === "num" && base.type === "num") {
        const r = exactLog(a.value, base.value);
        if (r) return rawNum(r);
      }
      if (base.type === "sym" && base.name === "e") return fn("ln", a);
      return rawFn("log", [a, base]);
    }
    case "abs": {
      if (a.type === "num") return rawNum(a.value.abs());
      if (a.type === "fn" && a.name === "abs") return a;
      if (a.type === "pow" && a.exp.type === "num" && a.exp.value.isInteger() && a.exp.value.num % 2n === 0n) return a;
      if (a.type === "mul" && a.factors[0].type === "num") {
        const rest = a.factors.length === 2 ? a.factors[1] : rawMul(a.factors.slice(1));
        return mul(rawNum(a.factors[0].value.abs()), fn("abs", rest));
      }
      const s = constantSign(a);
      if (s === 1) return a;
      if (s === -1) return neg(a);
      break;
    }
    case "sign": {
      const s = constantSign(a);
      if (s !== null) return rawNum(Rational.of(s));
      break;
    }
    case "floor":
    case "ceil":
    case "round": {
      if (a.type === "num") {
        const v = name === "floor" ? a.value.floor() : name === "ceil" ? a.value.ceil() : a.value.round();
        return rawNum(Rational.of(v));
      }
      if (isConstantExpr(a)) {
        const v = evalReal(a);
        if (Number.isFinite(v)) {
          const target = name === "floor" ? Math.floor(v) : name === "ceil" ? Math.ceil(v) : Math.sign(v) * Math.round(Math.abs(v));
          const distance = Math.min(Math.abs(v - Math.floor(v)), Math.abs(Math.ceil(v) - v), Math.abs(Math.abs(v) - Math.floor(Math.abs(v)) - 0.5));
          if (distance > 1e-9 * Math.max(1, Math.abs(v)) && Math.abs(v) < 1e15) return rawNum(Rational.of(target));
        }
      }
      break;
    }
    case "factorial": {
      if (a.type === "num") {
        if (!a.value.isInteger() || a.value.isNegative()) {
          throw domainError("Faktorial hanya didefinisikan untuk bilangan bulat tak negatif.", {
            module: "simplify",
            operation: "factorial",
            hint: "Untuk bilangan non-bulat gunakan fungsi gamma: gamma(x+1).",
          });
        }
        return rawNum(Rational.of(bigFactorial(Number(a.value.num))));
      }
      break;
    }
    case "binomial": {
      const b = args[1];
      if (a.type === "num" && b.type === "num" && a.value.isInteger() && b.value.isInteger()) {
        return rawNum(Rational.of(bigBinomial(a.value.num, b.value.num)));
      }
      break;
    }
    case "gcd":
    case "lcm": {
      if (args.every((x) => x.type === "num" && x.value.isInteger())) {
        const vals = args.map((x) => (x as { value: Rational }).value.num);
        const r = vals.reduce((acc, v) => (name === "gcd" ? bigGcd(acc, v) : bigLcm(acc, v)));
        return rawNum(Rational.of(r));
      }
      break;
    }
    case "mod": {
      const b = args[1];
      if (a.type === "num" && b.type === "num") {
        if (b.value.isZero()) throw new MathError("division-by-zero", "mod dengan pembagi 0 tidak terdefinisi.", { module: "simplify", operation: "mod" });
        const q = a.value.div(b.value).floor();
        return rawNum(a.value.sub(b.value.mul(Rational.of(q))));
      }
      break;
    }
    case "min":
    case "max": {
      if (args.every((x) => x.type === "num")) {
        const vals = args.map((x) => (x as { value: Rational }).value);
        return rawNum(vals.reduce((m, v) => ((name === "min" ? v.lt(m) : v.gt(m)) ? v : m)));
      }
      break;
    }
    case "re":
    case "im":
    case "conj": {
      if (a.type === "num") return name === "im" ? ZERO : a;
      break;
    }
  }
  return rawFn(name, args);
}

// ---------------------------------------------------------------------------
// Full re-simplification of arbitrary (possibly raw) trees
// ---------------------------------------------------------------------------

export function simplify(e: Expr): Expr {
  switch (e.type) {
    case "num":
    case "sym":
      return e;
    case "add":
      return add(...e.terms.map(simplify));
    case "mul":
      return mul(...e.factors.map(simplify));
    case "pow":
      return pow(simplify(e.base), simplify(e.exp));
    case "fn":
      return fn(e.name, ...e.args.map(simplify));
  }
}

/** Replace every occurrence of `target` (structural) by `replacement`, re-simplifying. */
export function substitute(e: Expr, target: Expr, replacement: Expr): Expr {
  if (exprEquals(e, target)) return replacement;
  switch (e.type) {
    case "num":
    case "sym":
      return e;
    case "add":
      return add(...e.terms.map((t) => substitute(t, target, replacement)));
    case "mul":
      return mul(...e.factors.map((f) => substitute(f, target, replacement)));
    case "pow":
      return pow(substitute(e.base, target, replacement), substitute(e.exp, target, replacement));
    case "fn":
      return fn(e.name, ...e.args.map((a) => substitute(a, target, replacement)));
  }
}

/** Substitute several symbols at once: { x: 2, y: expr }. */
export function substituteSymbols(e: Expr, values: Record<string, Expr>): Expr {
  switch (e.type) {
    case "num":
      return e;
    case "sym":
      return values[e.name] ?? e;
    case "add":
      return add(...e.terms.map((t) => substituteSymbols(t, values)));
    case "mul":
      return mul(...e.factors.map((f) => substituteSymbols(f, values)));
    case "pow":
      return pow(substituteSymbols(e.base, values), substituteSymbols(e.exp, values));
    case "fn":
      return fn(e.name, ...e.args.map((a) => substituteSymbols(a, values)));
  }
}

export type { Fn };
