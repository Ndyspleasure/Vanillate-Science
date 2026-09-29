/**
 * Univariate polynomials with exact rational coefficients, plus extraction of polynomial
 * structure from expressions (with symbolic coefficients).
 *
 * Algorithms: long division, Euclidean GCD, rational root theorem, square-free
 * decomposition (Yun), Durand–Kerner simultaneous iteration for numeric roots.
 */
import { tick } from "../core/budget";
import { MathError } from "../core/errors";
import { bigAbs, bigGcd, bigLcm, Rational } from "../core/rational";
import { divisors } from "../core/numtheory";
import { expand } from "./expand";
import { add, mul, pow, ZERO } from "./simplify";
import { containsSymbol, rawNum, rawSym, type Expr } from "./types";

export class Poly {
  /** coeffs[k] is the coefficient of x^k; no trailing zeros; zero polynomial = []. */
  readonly coeffs: readonly Rational[];

  constructor(coeffs: readonly Rational[]) {
    const c = [...coeffs];
    while (c.length && c[c.length - 1].isZero()) c.pop();
    this.coeffs = c;
  }

  static fromNumbers(coeffsAscending: Array<number | bigint | Rational>): Poly {
    return new Poly(coeffsAscending.map((v) => (v instanceof Rational ? v : Rational.of(typeof v === "number" ? BigInt(v) : v))));
  }

  static monomial(c: Rational, k: number): Poly {
    const arr = new Array<Rational>(k + 1).fill(Rational.ZERO);
    arr[k] = c;
    return new Poly(arr);
  }

  static readonly ZERO = new Poly([]);
  static readonly ONE = new Poly([Rational.ONE]);

  get degree(): number {
    return this.coeffs.length - 1; // -1 for zero polynomial
  }
  isZero(): boolean {
    return this.coeffs.length === 0;
  }
  coeff(k: number): Rational {
    return this.coeffs[k] ?? Rational.ZERO;
  }
  lead(): Rational {
    return this.coeffs[this.coeffs.length - 1] ?? Rational.ZERO;
  }

  add(o: Poly): Poly {
    const n = Math.max(this.coeffs.length, o.coeffs.length);
    const r: Rational[] = [];
    for (let k = 0; k < n; k++) r.push(this.coeff(k).add(o.coeff(k)));
    return new Poly(r);
  }
  sub(o: Poly): Poly {
    return this.add(o.scale(Rational.MINUS_ONE));
  }
  scale(c: Rational): Poly {
    return new Poly(this.coeffs.map((a) => a.mul(c)));
  }
  mul(o: Poly): Poly {
    if (this.isZero() || o.isZero()) return Poly.ZERO;
    const r = new Array<Rational>(this.coeffs.length + o.coeffs.length - 1).fill(Rational.ZERO);
    for (let i = 0; i < this.coeffs.length; i++) {
      for (let j = 0; j < o.coeffs.length; j++) {
        tick("poly-mul");
        r[i + j] = r[i + j].add(this.coeffs[i].mul(o.coeffs[j]));
      }
    }
    return new Poly(r);
  }
  pow(n: number): Poly {
    let r: Poly = Poly.ONE;
    for (let i = 0; i < n; i++) r = r.mul(this);
    return r;
  }

  /** Long division: this = q * d + r with deg r < deg d. */
  divmod(d: Poly): { q: Poly; r: Poly } {
    if (d.isZero()) throw new MathError("division-by-zero", "Pembagian polinomial dengan polinomial nol.", { module: "polynomial" });
    let r = new Poly(this.coeffs);
    const q = new Array<Rational>(Math.max(0, this.degree - d.degree + 1)).fill(Rational.ZERO);
    while (!r.isZero() && r.degree >= d.degree) {
      tick("poly-div");
      const k = r.degree - d.degree;
      const c = r.lead().div(d.lead());
      q[k] = c;
      r = r.sub(Poly.monomial(c, k).mul(d));
    }
    return { q: new Poly(q), r };
  }

  monic(): Poly {
    if (this.isZero()) return this;
    return this.scale(this.lead().inv());
  }

  /** Monic greatest common divisor. */
  static gcd(a: Poly, b: Poly): Poly {
    let x = a;
    let y = b;
    while (!y.isZero()) {
      tick("poly-gcd");
      const { r } = x.divmod(y);
      x = y;
      y = r;
    }
    return x.isZero() ? x : x.monic();
  }

  derivative(): Poly {
    return new Poly(this.coeffs.slice(1).map((c, k) => c.mul(Rational.of(k + 1))));
  }

  eval(x: Rational): Rational {
    let r = Rational.ZERO;
    for (let k = this.coeffs.length - 1; k >= 0; k--) r = r.mul(x).add(this.coeffs[k]);
    return r;
  }

  evalNumber(x: number): number {
    let r = 0;
    for (let k = this.coeffs.length - 1; k >= 0; k--) r = r * x + this.coeffs[k].toNumber();
    return r;
  }

  equals(o: Poly): boolean {
    return this.coeffs.length === o.coeffs.length && this.coeffs.every((c, k) => c.equals(o.coeffs[k]));
  }

  /** Integer primitive part: scaled so coefficients are coprime integers with positive lead. */
  primitive(): { content: Rational; poly: Poly } {
    if (this.isZero()) return { content: Rational.ONE, poly: this };
    let den = 1n;
    for (const c of this.coeffs) den = bigLcm(den, c.den);
    let g = 0n;
    for (const c of this.coeffs) g = bigGcd(g, c.num * (den / c.den));
    let content = Rational.of(g, den);
    if (this.lead().isNegative()) content = content.neg();
    return { content, poly: this.scale(content.inv()) };
  }

  toExpr(x: string | Expr): Expr {
    const v = typeof x === "string" ? rawSym(x) : x;
    const terms: Expr[] = [];
    this.coeffs.forEach((c, k) => {
      if (!c.isZero()) terms.push(mul(rawNum(c), pow(v, rawNum(Rational.of(k)))));
    });
    return terms.length ? add(...terms) : ZERO;
  }

  toString(): string {
    return this.coeffs.map((c, k) => `${c.toString()}x^${k}`).join(" + ");
  }

  /**
   * Rational roots via the rational root theorem (with multiplicity), and the remaining
   * factor after deflation.
   */
  rationalRoots(): { roots: Rational[]; rest: Poly } {
    let p = new Poly(this.coeffs);
    const roots: Rational[] = [];
    // zero roots
    while (!p.isZero() && p.coeff(0).isZero()) {
      roots.push(Rational.ZERO);
      p = new Poly(p.coeffs.slice(1));
    }
    if (p.degree < 1) return { roots, rest: p };
    const prim = p.primitive().poly;
    const a0 = bigAbs(prim.coeff(0).num);
    const an = bigAbs(prim.lead().num);
    if (a0.toString().length > 30 || an.toString().length > 30) return { roots, rest: p };
    let ps: bigint[];
    let qs: bigint[];
    try {
      ps = divisors(a0);
      qs = divisors(an);
    } catch {
      return { roots, rest: p };
    }
    if (ps.length * qs.length > 20000) return { roots, rest: p };
    const candidates = new Map<string, Rational>();
    for (const a of ps) for (const b of qs) {
      const r = Rational.of(a, b);
      candidates.set(r.toString(), r);
      candidates.set(r.neg().toString(), r.neg());
    }
    const sorted = [...candidates.values()].sort((a, b) => a.cmp(b));
    for (const r of sorted) {
      tick("rational-roots");
      while (p.degree >= 1 && p.eval(r).isZero()) {
        roots.push(r);
        p = p.divmod(Poly.fromNumbers([r.neg(), Rational.ONE])).q;
      }
    }
    return { roots, rest: p };
  }

  /** Square-free decomposition (Yun): this = c * prod f_i^i. */
  squareFree(): Array<{ factor: Poly; multiplicity: number }> {
    const result: Array<{ factor: Poly; multiplicity: number }> = [];
    if (this.degree < 1) return result;
    const f = this.monic();
    let a = Poly.gcd(f, f.derivative());
    let b = f.divmod(a).q;
    let c = f.derivative().divmod(a).q;
    let d = c.sub(b.derivative());
    let i = 1;
    while (b.degree >= 1) {
      tick("square-free");
      a = Poly.gcd(b, d);
      if (a.degree >= 1) result.push({ factor: a, multiplicity: i });
      b = b.divmod(a).q;
      c = d.divmod(a).q;
      d = c.sub(b.derivative());
      i++;
      if (i > 1000) break;
    }
    return result;
  }
}

/**
 * Numeric roots (all complex roots) of a polynomial with the Durand–Kerner method.
 * Returns roots with an error estimate; throws numerical-instability on non-convergence.
 */
export function numericRoots(p: Poly, tolerance = 1e-13, maxIter = 2000): { roots: Array<{ re: number; im: number }>; iterations: number; converged: boolean } {
  const n = p.degree;
  if (n < 1) return { roots: [], iterations: 0, converged: true };
  const lead = p.lead().toNumber();
  const a = p.coeffs.map((c) => c.toNumber() / lead);
  // Cauchy bound for initial circle radius
  let bound = 0;
  for (let k = 0; k < n; k++) bound = Math.max(bound, Math.abs(a[k]));
  const radius = 1 + bound;
  let z: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) {
    const ang = (2 * Math.PI * k) / n + 0.4;
    z.push([radius * 0.5 * Math.cos(ang), radius * 0.5 * Math.sin(ang)]);
  }
  const evalP = (re: number, im: number): [number, number] => {
    let pr = 1;
    let pi = 0;
    for (let k = n - 1; k >= 0; k--) {
      const nr = pr * re - pi * im + a[k];
      const ni = pr * im + pi * re;
      pr = nr;
      pi = ni;
    }
    return [pr, pi];
  };
  let iterations = 0;
  let converged = false;
  for (; iterations < maxIter; iterations++) {
    tick("durand-kerner");
    let maxDelta = 0;
    const next: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const [zr, zi] = z[i];
      let [nr, ni] = evalP(zr, zi);
      let dr = 1;
      let di = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const tr = zr - z[j][0];
        const ti = zi - z[j][1];
        const r = dr * tr - di * ti;
        di = dr * ti + di * tr;
        dr = r;
      }
      const den = dr * dr + di * di;
      if (den === 0) {
        nr = 0;
        ni = 0;
      }
      const qr = den === 0 ? 1e-8 : (nr * dr + ni * di) / den;
      const qi = den === 0 ? 1e-8 : (ni * dr - nr * di) / den;
      next.push([zr - qr, zi - qi]);
      maxDelta = Math.max(maxDelta, Math.hypot(qr, qi) / Math.max(1, Math.hypot(zr, zi)));
    }
    z = next;
    if (maxDelta < tolerance) {
      converged = true;
      break;
    }
  }
  // Newton polishing
  const dp = p.derivative();
  const polished = z.map(([re, im]) => {
    let zr = re;
    let zi = im;
    for (let k = 0; k < 5; k++) {
      const [fr, fi] = evalComplexPoly(p, zr, zi);
      const [gr, gi] = evalComplexPoly(dp, zr, zi);
      const den = gr * gr + gi * gi;
      if (den === 0) break;
      zr -= (fr * gr + fi * gi) / den;
      zi -= (fi * gr - fr * gi) / den;
    }
    return { re: zr, im: Math.abs(zi) < 1e-12 * Math.max(1, Math.abs(zr)) ? 0 : zi };
  });
  polished.sort((u, v) => u.re - v.re || u.im - v.im);
  return { roots: polished, iterations, converged };
}

function evalComplexPoly(p: Poly, re: number, im: number): [number, number] {
  let pr = 0;
  let pi = 0;
  for (let k = p.coeffs.length - 1; k >= 0; k--) {
    const nr = pr * re - pi * im + p.coeffs[k].toNumber();
    const ni = pr * im + pi * re;
    pr = nr;
    pi = ni;
  }
  return [pr, pi];
}

// ---------------------------------------------------------------------------
// Polynomial structure of expressions
// ---------------------------------------------------------------------------

/**
 * Coefficients (by degree) of `e` viewed as a polynomial in `x`, with coefficients that are
 * expressions free of x. Returns null when e is not a polynomial in x.
 */
export function polyCoefficients(e: Expr, x: string, alreadyExpanded = false): Expr[] | null {
  const ex = alreadyExpanded ? e : expand(e);
  const terms = ex.type === "add" ? ex.terms : [ex];
  const byDeg = new Map<number, Expr[]>();
  for (const t of terms) {
    const factors = t.type === "mul" ? t.factors : [t];
    let deg = 0;
    const coef: Expr[] = [];
    for (const f of factors) {
      if (f.type === "sym" && f.name === x) deg += 1;
      else if (f.type === "pow" && f.base.type === "sym" && f.base.name === x && f.exp.type === "num" && f.exp.value.isInteger() && !f.exp.value.isNegative()) {
        deg += Number(f.exp.value.num);
      } else if (containsSymbol(f, x)) return null;
      else coef.push(f);
    }
    if (deg > 10000) return null;
    byDeg.set(deg, [...(byDeg.get(deg) ?? []), mul(...coef)]);
  }
  const maxDeg = Math.max(0, ...byDeg.keys());
  const out: Expr[] = [];
  for (let k = 0; k <= maxDeg; k++) out.push(add(...(byDeg.get(k) ?? [])));
  while (out.length > 1 && out[out.length - 1].type === "num" && (out[out.length - 1] as { value: Rational }).value.isZero()) out.pop();
  return out;
}

/** Polynomial in x with rational coefficients, or null. */
export function toPoly(e: Expr, x: string): Poly | null {
  const cs = polyCoefficients(e, x);
  if (!cs) return null;
  const rs: Rational[] = [];
  for (const c of cs) {
    if (c.type !== "num") return null;
    rs.push(c.value);
  }
  return new Poly(rs);
}

/** Degree of e as a polynomial in x, or null if not polynomial. */
export function polyDegree(e: Expr, x: string): number | null {
  const cs = polyCoefficients(e, x);
  if (!cs) return null;
  if (cs.length === 1 && cs[0].type === "num" && cs[0].value.isZero()) return -1;
  return cs.length - 1;
}
