/**
 * Equivalence checking between expressions: symbolic (difference simplifies to zero) with a
 * deterministic numeric fallback (seeded random sampling). Used by the verification engine
 * and by "Verifikasi Pekerjaan Saya".
 */
import { expand, together } from "./expand";
import { evalComplex, complexApproxEqual, type Env } from "./evaluate";
import { sub } from "./simplify";
import { freeSymbols, isZeroExpr, containsSymbol, type Expr } from "./types";

/** Deterministic PRNG (mulberry32) so verification is reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EquivalenceResult {
  equivalent: boolean;
  method: "symbolic" | "numeric" | "inconclusive";
  detail: string;
  samples: number;
  counterexample?: Record<string, number>;
}

export interface EquivalenceOptions {
  /** Relative tolerance for numeric comparison. */
  tolerance?: number;
  /** Variables to sample (defaults to all free symbols). */
  variables?: string[];
  /** Restrict sampling to positive values (for ln, sqrt, ...). */
  positiveOnly?: boolean;
  seed?: number;
}

/** True when `e` can be shown to be identically zero symbolically. */
export function isSymbolicallyZero(e: Expr): boolean {
  if (isZeroExpr(e)) return true;
  try {
    const ex = expand(e);
    if (isZeroExpr(ex)) return true;
    const { numer } = together(ex);
    return isZeroExpr(expand(numer));
  } catch {
    return false;
  }
}

export function checkEquivalent(
  a: Expr,
  b: Expr,
  options: EquivalenceOptions = {},
): EquivalenceResult {
  let diff: Expr | null = null;
  try {
    diff = sub(a, b);
    if (isSymbolicallyZero(diff)) {
      return {
        equivalent: true,
        method: "symbolic",
        detail: "Selisih kedua ekspresi disederhanakan menjadi 0.",
        samples: 0,
      };
    }
  } catch {
    diff = null;
  }
  return numericEquivalence(a, b, options);
}

export function numericEquivalence(
  a: Expr,
  b: Expr,
  options: EquivalenceOptions = {},
): EquivalenceResult {
  const tol = options.tolerance ?? 1e-8;
  const vars = options.variables ?? [...new Set([...freeSymbols(a), ...freeSymbols(b)])].sort();
  const rand = seededRandom(options.seed ?? 20240607);
  const ranges: Array<[number, number]> = options.positiveOnly
    ? [[0.1, 3]]
    : [
        [-3, 3],
        [0.1, 3],
      ];
  let valid = 0;
  let attempts = 0;
  for (const [lo, hi] of ranges) {
    for (let k = 0; k < 40 && valid < 12; k++) {
      attempts++;
      const env: Env = {};
      for (const v of vars) env[v] = lo + (hi - lo) * rand();
      const va = evalComplex(a, env);
      const vb = evalComplex(b, env);
      const finiteA = Number.isFinite(va.re) && Number.isFinite(va.im);
      const finiteB = Number.isFinite(vb.re) && Number.isFinite(vb.im);
      if (!finiteA || !finiteB) continue;
      if (Math.hypot(va.re, va.im) > 1e12) continue;
      valid++;
      if (!complexApproxEqual(va, vb, tol, tol)) {
        return {
          equivalent: false,
          method: "numeric",
          detail: `Nilai berbeda pada ${vars.map((v) => `${v} = ${env[v].toPrecision(6)}`).join(", ") || "evaluasi konstanta"}.`,
          samples: valid,
          counterexample: env,
        };
      }
    }
    if (valid >= 12) break;
  }
  if (vars.length === 0 && valid > 0) {
    return {
      equivalent: true,
      method: "numeric",
      detail: "Nilai numerik kedua konstanta sama (toleransi relatif 1e-8).",
      samples: valid,
    };
  }
  if (valid >= 6) {
    return {
      equivalent: true,
      method: "numeric",
      detail: `Sama pada ${valid} titik uji acak deterministik (toleransi relatif ${tol}).`,
      samples: valid,
    };
  }
  return {
    equivalent: false,
    method: "inconclusive",
    detail: `Tidak cukup titik uji yang valid (${valid} dari ${attempts}); domain mungkin sangat terbatas.`,
    samples: valid,
  };
}

/** Numeric check that `e` vanishes at the given point. */
export function vanishesAt(e: Expr, env: Env, tol = 1e-9): boolean {
  const v = evalComplex(e, env);
  return Number.isFinite(v.re) && Math.hypot(v.re, v.im) <= tol;
}

export { containsSymbol };
