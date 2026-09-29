/**
 * Floating-point evaluation of expressions (real and complex).
 *
 * Numeric evaluation is used for approximations, plotting and numeric verification.
 * It never feeds back into exact results without being labelled as approximate.
 *
 * Real-domain convention (documented, see docs/ENGINE.md): for a negative base and a
 * rational exponent p/q with odd q, the real root is used, e.g. (-8)^(1/3) = -2.
 */
import type { Expr } from "./types";
import { Rational } from "../core/rational";

export type Env = Record<string, number>;

// Lanczos approximation (g = 7, n = 9), accurate to ~15 significant digits.
const LANCZOS_G = 7;
const LANCZOS_COEF = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function gammaFn(x: number): number {
  if (Number.isInteger(x) && x <= 0) return NaN;
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
  if (Number.isInteger(x) && x <= 171) {
    let r = 1;
    for (let k = 2; k < x; k++) r *= k;
    return r;
  }
  x -= 1;
  let a = LANCZOS_COEF[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) a += LANCZOS_COEF[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

function realRationalPow(base: number, exp: Rational): number {
  if (base >= 0) return Math.pow(base, exp.toNumber());
  // negative base: real root only for odd denominators
  if (exp.den % 2n === 1n) {
    const mag = Math.pow(-base, exp.toNumber());
    return exp.num % 2n === 0n ? mag : -mag;
  }
  return NaN;
}

function numericArgs(args: readonly Expr[], env: Env): number[] {
  return args.map((a) => evalReal(a, env));
}

const REAL_FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  cot: (x) => 1 / Math.tan(x),
  sec: (x) => 1 / Math.cos(x),
  csc: (x) => 1 / Math.sin(x),
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  acot: (x) => (x === 0 ? Math.PI / 2 : Math.atan(1 / x)),
  asec: (x) => Math.acos(1 / x),
  acsc: (x) => Math.asin(1 / x),
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  coth: (x) => 1 / Math.tanh(x),
  sech: (x) => 1 / Math.cosh(x),
  csch: (x) => 1 / Math.sinh(x),
  asinh: Math.asinh,
  acosh: Math.acosh,
  atanh: Math.atanh,
  ln: (x) => (x > 0 ? Math.log(x) : x === 0 ? -Infinity : NaN),
  log: (x, b = 10) => (x > 0 && b > 0 && b !== 1 ? Math.log(x) / Math.log(b) : x === 0 ? -Infinity : NaN),
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor,
  ceil: Math.ceil,
  round: (x) => Math.sign(x) * Math.round(Math.abs(x)),
  factorial: (x) => (x < 0 && Number.isInteger(x) ? NaN : gammaFn(x + 1)),
  gamma: gammaFn,
  atan2: Math.atan2,
  mod: (a, b) => (b === 0 ? NaN : a - b * Math.floor(a / b)),
  min: Math.min,
  max: Math.max,
  binomial: (n, k) => gammaFn(n + 1) / (gammaFn(k + 1) * gammaFn(n - k + 1)),
  re: (x) => x,
  im: () => 0,
  conj: (x) => x,
  arg: (x) => (x >= 0 ? 0 : Math.PI),
};

/** Real-valued evaluation. Returns NaN outside the real domain or for unknown symbols. */
export function evalReal(e: Expr, env: Env = {}): number {
  switch (e.type) {
    case "num":
      return e.value.toNumber();
    case "sym":
      if (e.name in env) return env[e.name];
      if (e.name === "pi") return Math.PI;
      if (e.name === "e") return Math.E;
      return NaN;
    case "add": {
      let s = 0;
      for (const t of e.terms) s += evalReal(t, env);
      return s;
    }
    case "mul": {
      let p = 1;
      for (const f of e.factors) p *= evalReal(f, env);
      return p;
    }
    case "pow": {
      const b = evalReal(e.base, env);
      if (e.exp.type === "num") {
        if (e.exp.value.isInteger()) return Math.pow(b, e.exp.value.toNumber());
        return realRationalPow(b, e.exp.value);
      }
      const x = evalReal(e.exp, env);
      if (e.base.type === "sym" && e.base.name === "e" && !("e" in env)) return Math.exp(x);
      return Math.pow(b, x);
    }
    case "fn": {
      const f = REAL_FUNCTIONS[e.name];
      if (!f) return NaN;
      return f(...numericArgs(e.args, env));
    }
  }
}

// ---------------------------------------------------------------------------
// Complex evaluation
// ---------------------------------------------------------------------------

export interface Complex {
  re: number;
  im: number;
}

export const c = (re: number, im = 0): Complex => ({ re, im });
const cAdd = (a: Complex, b: Complex): Complex => c(a.re + b.re, a.im + b.im);
const cMul = (a: Complex, b: Complex): Complex => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const cDiv = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
export const cAbs = (a: Complex): number => Math.hypot(a.re, a.im);
const cExp = (a: Complex): Complex => {
  const m = Math.exp(a.re);
  return c(m * Math.cos(a.im), m * Math.sin(a.im));
};
const cLog = (a: Complex): Complex => c(Math.log(cAbs(a)), Math.atan2(a.im, a.re));
function cPowInt(a: Complex, n: number): Complex {
  if (n < 0) return cDiv(c(1), cPowInt(a, -n));
  let r = c(1);
  let b = a;
  while (n > 0) {
    if (n & 1) r = cMul(r, b);
    n >>= 1;
    if (n) b = cMul(b, b);
  }
  return r;
}

function cPow(a: Complex, b: Complex, exact?: Rational): Complex {
  if (exact && exact.isInteger() && Math.abs(exact.toNumber()) <= 1e6) return cPowInt(a, exact.toNumber());
  if (exact && a.im === 0 && a.re < 0 && exact.den % 2n === 1n) return c(realRationalPow(a.re, exact));
  if (a.re === 0 && a.im === 0) return b.re > 0 ? c(0) : c(NaN, NaN);
  return cExp(cMul(b, cLog(a)));
}

const COMPLEX_FUNCTIONS: Record<string, (...a: Complex[]) => Complex> = {
  sin: (z) => c(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im)),
  cos: (z) => c(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im)),
  tan: (z) => cDiv(COMPLEX_FUNCTIONS.sin(z), COMPLEX_FUNCTIONS.cos(z)),
  sinh: (z) => c(Math.sinh(z.re) * Math.cos(z.im), Math.cosh(z.re) * Math.sin(z.im)),
  cosh: (z) => c(Math.cosh(z.re) * Math.cos(z.im), Math.sinh(z.re) * Math.sin(z.im)),
  ln: cLog,
  log: (z, b = c(10)) => cDiv(cLog(z), cLog(b)),
  abs: (z) => c(cAbs(z)),
  re: (z) => c(z.re),
  im: (z) => c(z.im),
  conj: (z) => c(z.re, -z.im),
  arg: (z) => c(Math.atan2(z.im, z.re)),
};

/** Complex evaluation with principal branches (except the real odd-root convention). */
export function evalComplex(e: Expr, env: Env = {}): Complex {
  switch (e.type) {
    case "num":
      return c(e.value.toNumber());
    case "sym":
      if (e.name in env) return c(env[e.name]);
      if (e.name === "pi") return c(Math.PI);
      if (e.name === "e") return c(Math.E);
      if (e.name === "i") return c(0, 1);
      return c(NaN, NaN);
    case "add":
      return e.terms.reduce((s, t) => cAdd(s, evalComplex(t, env)), c(0));
    case "mul":
      return e.factors.reduce((p, f) => cMul(p, evalComplex(f, env)), c(1));
    case "pow": {
      const b = evalComplex(e.base, env);
      const x = evalComplex(e.exp, env);
      return cPow(b, x, e.exp.type === "num" ? e.exp.value : undefined);
    }
    case "fn": {
      const args = e.args.map((a) => evalComplex(a, env));
      const f = COMPLEX_FUNCTIONS[e.name];
      if (f) return f(...args);
      if (args.every((a) => a.im === 0)) {
        const rf = REAL_FUNCTIONS[e.name];
        return rf ? c(rf(...args.map((a) => a.re))) : c(NaN, NaN);
      }
      return c(NaN, NaN);
    }
  }
}

/** Relative/absolute closeness test used by numeric verification. */
export function approxEqual(a: number, b: number, relTol = 1e-9, absTol = 1e-12): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= Math.max(absTol, relTol * Math.max(Math.abs(a), Math.abs(b)));
}

export function complexApproxEqual(a: Complex, b: Complex, relTol = 1e-9, absTol = 1e-12): boolean {
  const scale = Math.max(cAbs(a), cAbs(b));
  const diff = Math.hypot(a.re - b.re, a.im - b.im);
  return Number.isFinite(diff) && diff <= Math.max(absTol, relTol * scale);
}
