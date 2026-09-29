/**
 * Numerical methods with explicit tolerance, iteration counts and convergence status
 * (docs/PRODUCT_BRIEF.md §5.4).
 *
 * References: R. L. Burden & J. D. Faires, "Numerical Analysis" (bisection, Newton,
 * Simpson, Runge–Kutta); R. P. Brent, "Algorithms for Minimization without Derivatives"
 * (1973) for Brent's root-finding method; W. H. Press et al., "Numerical Recipes", 3rd ed.
 */
import { tick } from "../core/budget";

export interface RootResult {
  root: number;
  iterations: number;
  converged: boolean;
  /** |f(root)| at termination. */
  residual: number;
  /** Width of the final bracket or last step size. */
  errorEstimate: number;
  method: string;
  history?: Array<{ iteration: number; x: number; fx: number }>;
}

export const DEFAULT_TOL = 1e-12;

/** Bisection on [a, b] with f(a) f(b) < 0. */
export function bisection(
  f: (x: number) => number,
  a: number,
  b: number,
  tol = DEFAULT_TOL,
  maxIter = 200,
  recordHistory = false,
): RootResult {
  let fa = f(a);
  const history: RootResult["history"] = [];
  let lo = a;
  let hi = b;
  let mid = (lo + hi) / 2;
  let i = 0;
  for (; i < maxIter; i++) {
    tick("bisection");
    mid = (lo + hi) / 2;
    const fm = f(mid);
    if (recordHistory && history.length < 60) history.push({ iteration: i + 1, x: mid, fx: fm });
    if (fm === 0 || (hi - lo) / 2 < tol * Math.max(1, Math.abs(mid))) {
      return {
        root: mid,
        iterations: i + 1,
        converged: true,
        residual: Math.abs(fm),
        errorEstimate: (hi - lo) / 2,
        method: "Bagi dua (bisection)",
        history: recordHistory ? history : undefined,
      };
    }
    if (Math.sign(fm) === Math.sign(fa)) {
      lo = mid;
      fa = fm;
    } else hi = mid;
  }
  return {
    root: mid,
    iterations: i,
    converged: false,
    residual: Math.abs(f(mid)),
    errorEstimate: (hi - lo) / 2,
    method: "Bagi dua (bisection)",
    history: recordHistory ? history : undefined,
  };
}

/** Newton–Raphson with derivative df. */
export function newton(
  f: (x: number) => number,
  df: (x: number) => number,
  x0: number,
  tol = DEFAULT_TOL,
  maxIter = 100,
  recordHistory = false,
): RootResult {
  let x = x0;
  const history: RootResult["history"] = [];
  let step = Infinity;
  for (let i = 0; i < maxIter; i++) {
    tick("newton");
    const fx = f(x);
    const d = df(x);
    if (recordHistory && history.length < 60) history.push({ iteration: i, x, fx });
    if (!Number.isFinite(fx) || !Number.isFinite(d) || d === 0) {
      return {
        root: x,
        iterations: i,
        converged: false,
        residual: Math.abs(fx),
        errorEstimate: step,
        method: "Newton-Raphson",
        history: recordHistory ? history : undefined,
      };
    }
    step = fx / d;
    x -= step;
    if (Math.abs(step) <= tol * Math.max(1, Math.abs(x))) {
      return {
        root: x,
        iterations: i + 1,
        converged: true,
        residual: Math.abs(f(x)),
        errorEstimate: Math.abs(step),
        method: "Newton-Raphson",
        history: recordHistory ? history : undefined,
      };
    }
  }
  return {
    root: x,
    iterations: maxIter,
    converged: false,
    residual: Math.abs(f(x)),
    errorEstimate: Math.abs(step),
    method: "Newton-Raphson",
    history: recordHistory ? history : undefined,
  };
}

/** Secant method. */
export function secant(
  f: (x: number) => number,
  x0: number,
  x1: number,
  tol = DEFAULT_TOL,
  maxIter = 100,
): RootResult {
  let a = x0;
  let b = x1;
  let fa = f(a);
  let fb = f(b);
  for (let i = 0; i < maxIter; i++) {
    tick("secant");
    if (fb === fa) break;
    const c = b - (fb * (b - a)) / (fb - fa);
    a = b;
    fa = fb;
    b = c;
    fb = f(b);
    if (Math.abs(b - a) <= tol * Math.max(1, Math.abs(b))) {
      return {
        root: b,
        iterations: i + 1,
        converged: true,
        residual: Math.abs(fb),
        errorEstimate: Math.abs(b - a),
        method: "Secant",
      };
    }
  }
  return {
    root: b,
    iterations: maxIter,
    converged: false,
    residual: Math.abs(fb),
    errorEstimate: Math.abs(b - a),
    method: "Secant",
  };
}

/** Brent's method on a bracket [a, b] with f(a) f(b) <= 0. */
export function brent(
  f: (x: number) => number,
  a: number,
  b: number,
  tol = DEFAULT_TOL,
  maxIter = 200,
): RootResult {
  let fa = f(a);
  let fb = f(b);
  if (fa === 0)
    return {
      root: a,
      iterations: 0,
      converged: true,
      residual: 0,
      errorEstimate: 0,
      method: "Brent",
    };
  if (fb === 0)
    return {
      root: b,
      iterations: 0,
      converged: true,
      residual: 0,
      errorEstimate: 0,
      method: "Brent",
    };
  if (Math.sign(fa) === Math.sign(fb)) {
    return {
      root: NaN,
      iterations: 0,
      converged: false,
      residual: NaN,
      errorEstimate: NaN,
      method: "Brent",
    };
  }
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let i = 0; i < maxIter; i++) {
    tick("brent");
    if (Math.sign(fb) === Math.sign(fc)) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) {
      return {
        root: b,
        iterations: i,
        converged: true,
        residual: Math.abs(fb),
        errorEstimate: Math.abs(xm),
        method: "Brent",
      };
    }
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : xm > 0 ? tol1 : -tol1;
    fb = f(b);
  }
  return {
    root: b,
    iterations: maxIter,
    converged: false,
    residual: Math.abs(fb),
    errorEstimate: Math.abs(c - b),
    method: "Brent",
  };
}

export interface RealRootSearch {
  roots: RootResult[];
  interval: [number, number];
  samples: number;
  truncated: boolean;
}

/**
 * Find real roots of f on [lo, hi] by sampling for sign changes (and near-zero minima for
 * even-multiplicity roots), then refining with Brent's method / golden-section.
 */
export function findRealRoots(
  f: (x: number) => number,
  lo = -100,
  hi = 100,
  samples = 4000,
  maxRoots = 40,
  tol = DEFAULT_TOL,
): RealRootSearch {
  const roots: RootResult[] = [];
  const h = (hi - lo) / samples;
  let px = lo;
  let pf = f(px);
  const values: number[] = [pf];
  const xs: number[] = [px];
  let truncated = false;
  const addRoot = (r: RootResult) => {
    if (!r.converged || !Number.isFinite(r.root)) return;
    if (roots.some((q) => Math.abs(q.root - r.root) <= 1e-7 * Math.max(1, Math.abs(r.root))))
      return;
    if (roots.length >= maxRoots) {
      truncated = true;
      return;
    }
    roots.push(r);
  };
  for (let k = 1; k <= samples; k++) {
    tick("root-scan");
    const x = lo + k * h;
    const fx = f(x);
    xs.push(x);
    values.push(fx);
    if (Number.isFinite(pf) && Number.isFinite(fx)) {
      if (pf === 0)
        addRoot({
          root: px,
          iterations: 0,
          converged: true,
          residual: 0,
          errorEstimate: 0,
          method: "Evaluasi langsung",
        });
      else if (Math.sign(pf) !== Math.sign(fx) && fx !== 0) {
        const r = brent(f, px, x, tol);
        // reject poles: sign change across a vertical asymptote
        const scale = Math.max(1, Math.abs(pf), Math.abs(fx));
        if (r.converged && r.residual <= 1e-6 * scale) addRoot(r);
      }
    }
    px = x;
    pf = fx;
  }
  if (values[values.length - 1] === 0)
    addRoot({
      root: hi,
      iterations: 0,
      converged: true,
      residual: 0,
      errorEstimate: 0,
      method: "Evaluasi langsung",
    });
  // tangent roots: local minima of |f| close to zero without sign change
  for (let k = 1; k < values.length - 1; k++) {
    const a = Math.abs(values[k - 1]);
    const b = Math.abs(values[k]);
    const c = Math.abs(values[k + 1]);
    if (
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      Number.isFinite(c) &&
      b <= a &&
      b <= c &&
      Math.sign(values[k - 1]) === Math.sign(values[k + 1])
    ) {
      const r = goldenMinAbs(f, xs[k - 1], xs[k + 1], tol);
      const scale = Math.max(1, Math.abs(values[k - 1]), Math.abs(values[k + 1]));
      if (r.residual <= 1e-10 * scale) addRoot(r);
    }
  }
  roots.sort((a, b) => a.root - b.root);
  return { roots, interval: [lo, hi], samples, truncated };
}

function goldenMinAbs(f: (x: number) => number, a: number, b: number, tol: number): RootResult {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let i = 0;
  for (; i < 200 && Math.abs(b - a) > tol * Math.max(1, Math.abs(a)); i++) {
    tick("golden");
    if (Math.abs(f(c)) < Math.abs(f(d))) b = d;
    else a = c;
    c = b - g * (b - a);
    d = a + g * (b - a);
  }
  const x = (a + b) / 2;
  return {
    root: x,
    iterations: i,
    converged: true,
    residual: Math.abs(f(x)),
    errorEstimate: Math.abs(b - a),
    method: "Minimasi |f| (akar ganda)",
  };
}

export interface IntegrationResult {
  value: number;
  errorEstimate: number;
  evaluations: number;
  converged: boolean;
  method: string;
}

/** Adaptive Simpson quadrature with Richardson error estimate. */
export function adaptiveSimpson(
  f: (x: number) => number,
  a: number,
  b: number,
  tol = 1e-10,
  maxDepth = 50,
): IntegrationResult {
  let evaluations = 0;
  let converged = true;
  const F = (x: number) => {
    evaluations++;
    tick("simpson");
    return f(x);
  };
  const simpson = (fa: number, fm: number, fb: number, a0: number, b0: number) =>
    ((b0 - a0) / 6) * (fa + 4 * fm + fb);
  let totalError = 0;
  const rec = (
    a0: number,
    b0: number,
    fa: number,
    fm: number,
    fb: number,
    whole: number,
    eps: number,
    depth: number,
  ): number => {
    const m = (a0 + b0) / 2;
    const lm = (a0 + m) / 2;
    const rm = (m + b0) / 2;
    const flm = F(lm);
    const frm = F(rm);
    const left = simpson(fa, flm, fm, a0, m);
    const right = simpson(fm, frm, fb, m, b0);
    const delta = left + right - whole;
    if (depth <= 0 || !Number.isFinite(delta)) {
      converged = false;
      totalError += Math.abs(delta) / 15;
      return left + right + delta / 15;
    }
    if (Math.abs(delta) <= 15 * eps) {
      totalError += Math.abs(delta) / 15;
      return left + right + delta / 15;
    }
    return (
      rec(a0, m, fa, flm, fm, left, eps / 2, depth - 1) +
      rec(m, b0, fm, frm, fb, right, eps / 2, depth - 1)
    );
  };
  const fa = F(a);
  const fb = F(b);
  const fm = F((a + b) / 2);
  const value = rec(a, b, fa, fm, fb, simpson(fa, fm, fb, a, b), tol, maxDepth);
  return {
    value,
    errorEstimate: totalError,
    evaluations,
    converged: converged && Number.isFinite(value),
    method: "Simpson adaptif",
  };
}

// Gauss–Kronrod 7-15 nodes and weights (Piessens et al., QUADPACK, 1983).
const XGK = [
  0.991455371120812639206854697526329, 0.949107912342758524526189684047851,
  0.864864423359769072789712788640926, 0.741531185599394439863864773280788,
  0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0.0,
];
const WGK = [
  0.02293532201052922496373200805897, 0.063092092629978553290700663189204,
  0.104790010322250183839876322541518, 0.140653259715525918745189590510238,
  0.16900472663926790282658342659855, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714,
];
const WG = [
  0.129484966168869693270611432679082, 0.27970539148927666790146777142378,
  0.381830050505118944950369775488975, 0.417959183673469387755102040816327,
];

function gk15(f: (x: number) => number, a: number, b: number): { value: number; error: number } {
  const c = (a + b) / 2;
  const h = (b - a) / 2;
  const fc = f(c);
  let resK = fc * WGK[7];
  let resG = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j];
    const f1 = f(c - dx);
    const f2 = f(c + dx);
    resK += WGK[j] * (f1 + f2);
    if (j % 2 === 1) resG += WG[(j - 1) / 2] * (f1 + f2);
  }
  return { value: resK * h, error: Math.abs((resK - resG) * h) };
}

/** Adaptive Gauss–Kronrod (G7-K15) quadrature. Handles infinite limits via substitution. */
export function gaussKronrod(
  f: (x: number) => number,
  a: number,
  b: number,
  tol = 1e-11,
  maxIntervals = 2000,
): IntegrationResult {
  let g = f;
  let lo = a;
  let hi = b;
  let transformed = false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    transformed = true;
    if (!Number.isFinite(a) && !Number.isFinite(b)) {
      // x = t / (1 - t^2), t in (-1, 1)
      g = (t) => {
        const d = 1 - t * t;
        return f(t / d) * ((1 + t * t) / (d * d));
      };
      lo = -1;
      hi = 1;
    } else if (!Number.isFinite(b)) {
      // x = a + t / (1 - t), t in [0, 1)
      g = (t) => f(a + t / (1 - t)) / ((1 - t) * (1 - t));
      lo = 0;
      hi = 1;
    } else {
      // x = b - (1 - t)/t, t in (0, 1]
      g = (t) => f(b - (1 - t) / t) / (t * t);
      lo = 0;
      hi = 1;
    }
  }
  let evaluations = 0;
  const G = (x: number) => {
    evaluations++;
    tick("gauss-kronrod");
    const v = g(x);
    return Number.isFinite(v) ? v : transformed ? 0 : v;
  };
  type Seg = { a: number; b: number; value: number; error: number };
  const first = gk15(G, lo, hi);
  const segs: Seg[] = [{ a: lo, b: hi, ...first }];
  let total = first.value;
  let err = first.error;
  while (err > Math.max(tol, tol * Math.abs(total)) && segs.length < maxIntervals) {
    segs.sort((p, q) => q.error - p.error);
    const s = segs.shift()!;
    const m = (s.a + s.b) / 2;
    const l = gk15(G, s.a, m);
    const r = gk15(G, m, s.b);
    segs.push({ a: s.a, b: m, ...l }, { a: m, b: s.b, ...r });
    total = segs.reduce((acc, q) => acc + q.value, 0);
    err = segs.reduce((acc, q) => acc + q.error, 0);
    if (!Number.isFinite(total)) break;
  }
  return {
    value: total,
    errorEstimate: err,
    evaluations,
    converged: Number.isFinite(total) && err <= Math.max(tol * 1e3, 1e-8 * Math.abs(total)),
    method: "Gauss–Kronrod adaptif (G7–K15)",
  };
}

/** Central-difference derivative with Richardson extrapolation. */
export function numericDerivative(f: (x: number) => number, x: number, order = 1): number {
  if (order === 1) {
    const h = 1e-3 * Math.max(1, Math.abs(x));
    const d = (hh: number) => (f(x + hh) - f(x - hh)) / (2 * hh);
    // Richardson table
    const d1 = d(h);
    const d2 = d(h / 2);
    const d3 = d(h / 4);
    const r1 = (4 * d2 - d1) / 3;
    const r2 = (4 * d3 - d2) / 3;
    return (16 * r2 - r1) / 15;
  }
  return numericDerivative((t) => numericDerivative(f, t, order - 1), x, 1);
}

/** Classical fourth-order Runge–Kutta for y' = f(t, y) (vector form). */
export function rungeKutta4(
  f: (t: number, y: number[]) => number[],
  t0: number,
  y0: number[],
  t1: number,
  steps: number,
): Array<{ t: number; y: number[] }> {
  const h = (t1 - t0) / steps;
  const out = [{ t: t0, y: [...y0] }];
  let t = t0;
  let y = [...y0];
  const addv = (a: number[], b: number[], s: number) => a.map((v, i) => v + s * b[i]);
  for (let i = 0; i < steps; i++) {
    tick("rk4");
    const k1 = f(t, y);
    const k2 = f(t + h / 2, addv(y, k1, h / 2));
    const k3 = f(t + h / 2, addv(y, k2, h / 2));
    const k4 = f(t + h, addv(y, k3, h));
    y = y.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    t = t0 + (i + 1) * h;
    out.push({ t, y: [...y] });
  }
  return out;
}
