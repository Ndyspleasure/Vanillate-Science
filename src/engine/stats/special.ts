/**
 * Special functions for probability distributions, accurate to near double precision.
 *
 * References:
 * - W. H. Press et al., "Numerical Recipes", 3rd ed., §6.1 (gamma), §6.2 (incomplete
 *   gamma: series + continued fraction), §6.4 (incomplete beta: continued fraction).
 * - M. Abramowitz & I. Stegun, "Handbook of Mathematical Functions", 7.1.6 (erf series with
 *   positive terms) and 7.1.14 (erfc continued fraction).
 * - P. J. Acklam, "An algorithm for computing the inverse normal cumulative distribution
 *   function" (2003), refined by one Halley step.
 */
import { tick } from "../core/budget";
import { MathError } from "../core/errors";

const SQRT_PI = Math.sqrt(Math.PI);

/** erf(x) via the positive-term series 2/√π e^{-x²} Σ 2ⁿ x^{2n+1}/(1·3·…·(2n+1)). */
function erfSeries(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 500; n++) {
    term *= (2 * x2) / (2 * n + 1);
    sum += term;
    if (Math.abs(term) < 1e-17 * Math.abs(sum)) break;
  }
  return (2 / SQRT_PI) * Math.exp(-x2) * sum;
}

/** erfc(x) for x > 0 via continued fraction (modified Lentz). */
function erfcContinuedFraction(x: number): number {
  // erfc(x) = e^{-x²}/√π · 1/(x + 1/2/(x + 1/(x + 3/2/(x + 2/(x + ...)))))
  const tiny = 1e-300;
  let f = x;
  let C = x;
  let D = 0;
  for (let n = 1; n < 500; n++) {
    const a = n / 2;
    D = x + a * D;
    D = Math.abs(D) < tiny ? tiny : D;
    C = x + a / C;
    C = Math.abs(C) < tiny ? tiny : C;
    D = 1 / D;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (SQRT_PI * f);
}

export function erf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return -erf(-x);
  if (x < 3) return erfSeries(x);
  return 1 - erfcContinuedFraction(x);
}

export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return 2 - erfc(-x);
  if (x < 3) return 1 - erfSeries(x);
  return erfcContinuedFraction(x);
}

export function normalPdf(x: number, mu = 0, sigma = 1): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

export function normalCdf(x: number, mu = 0, sigma = 1): number {
  return 0.5 * erfc(-(x - mu) / (sigma * Math.SQRT2));
}

const A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
  -3.066479806614716e1, 2.506628277459239,
];
const B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
  -1.328068155288572e1,
];
const C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
  4.374664141464968, 2.938163982698783,
];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

/** Inverse standard normal CDF (quantile). */
export function normalInv(p: number): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    throw new MathError("domain-error", "Peluang harus berada di antara 0 dan 1.", {
      module: "stats",
    });
  }
  const plow = 0.02425;
  let x: number;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  } else if (p <= 1 - plow) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) /
      (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  }
  // Halley refinement
  for (let k = 0; k < 2; k++) {
    const e = 0.5 * erfc(-x / Math.SQRT2) - p;
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    x = x - u / (1 + (x * u) / 2);
  }
  return x;
}

// Lanczos approximation for ln Γ(x), x > 0 (g = 7, n = 9)
const LG = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function lnGamma(x: number): number {
  if (x <= 0) throw new MathError("domain-error", "lnΓ(x) hanya untuk x > 0.", { module: "stats" });
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const xx = x - 1;
  let a = LG[0];
  const t = xx + 7.5;
  for (let i = 1; i < 9; i++) a += LG[i] / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x < 0 || a <= 0)
    throw new MathError("domain-error", "Argumen fungsi gamma tak lengkap tidak valid.", {
      module: "stats",
    });
  if (x === 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 1000; n++) {
      tick("gammaP");
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  return 1 - gammaQcf(a, x);
}

function gammaQcf(a: number, x: number): number {
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    tick("gammaQ");
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

function betacf(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m++) {
    tick("betacf");
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function betaI(a: number, b: number, x: number): number {
  if (x < 0 || x > 1)
    throw new MathError("domain-error", "x harus di [0, 1] untuk fungsi beta tak lengkap.", {
      module: "stats",
    });
  if (x === 0 || x === 1) return x;
  const lbt = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const bt = Math.exp(lbt);
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Student t CDF with ν degrees of freedom. */
export function tCdf(t: number, nu: number): number {
  if (nu <= 0)
    throw new MathError("domain-error", "Derajat bebas harus positif.", { module: "stats" });
  const x = nu / (nu + t * t);
  const tail = 0.5 * betaI(nu / 2, 0.5, x);
  return t >= 0 ? 1 - tail : tail;
}

export function tPdf(t: number, nu: number): number {
  return Math.exp(
    lnGamma((nu + 1) / 2) -
      lnGamma(nu / 2) -
      0.5 * Math.log(nu * Math.PI) -
      ((nu + 1) / 2) * Math.log(1 + (t * t) / nu),
  );
}

export function chiSquareCdf(x: number, k: number): number {
  if (x <= 0) return 0;
  return gammaP(k / 2, x / 2);
}

export function fCdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  return betaI(d1 / 2, d2 / 2, (d1 * x) / (d1 * x + d2));
}

/** Invert a monotone CDF on (lo, hi) by bisection to full precision. */
export function invertCdf(cdf: (x: number) => number, p: number, lo: number, hi: number): number {
  if (!(p > 0 && p < 1))
    throw new MathError("domain-error", "Peluang harus di antara 0 dan 1.", { module: "stats" });
  let a = lo;
  let b = hi;
  while (cdf(b) < p) {
    b *= 2;
    if (b > 1e12) break;
  }
  while (cdf(a) > p && a > -1e12) a = a < 0 ? a * 2 : a - 1;
  for (let i = 0; i < 200; i++) {
    tick("invert-cdf");
    const m = (a + b) / 2;
    if (cdf(m) < p) a = m;
    else b = m;
    if (b - a <= 1e-15 * Math.max(1, Math.abs(m))) break;
  }
  return (a + b) / 2;
}

export function tInv(p: number, nu: number): number {
  return invertCdf((t) => tCdf(t, nu), p, -50, 50);
}

export function chiSquareInv(p: number, k: number): number {
  return invertCdf((x) => chiSquareCdf(x, k), p, 0, Math.max(10, 5 * k));
}

export function fInv(p: number, d1: number, d2: number): number {
  return invertCdf((x) => fCdf(x, d1, d2), p, 0, 20);
}
