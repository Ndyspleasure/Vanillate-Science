/**
 * Single-variable equation solver with method selection and verification.
 *
 * Method selector (deterministic, rule based):
 *   1. constant equation (identity / contradiction)
 *   2. rational equation (variable in a denominator) -> multiply by LCD, exclude poles
 *   3. polynomial with numeric coefficients -> linear / quadratic / higher degree
 *   4. polynomial with symbolic coefficients (literal equations) -> linear / quadratic
 *   5. variable occurs once -> isolation (inverse operations)
 *   6. substitution u = g(x) turning the equation into a polynomial
 *   7. single radical -> isolate and raise to a power, reject extraneous roots
 *   8. exponentials on both sides -> logarithms
 *   9. numeric root finding (sign scan + Brent), clearly labelled approximate
 * Every candidate root is substituted back into the ORIGINAL equation.
 */
import { MathError } from "../core/errors";
import { Rational, bigLcm, exactIntRoot } from "../core/rational";
import { evalComplex, evalReal } from "../expr/evaluate";
import { expand, together } from "../expr/expand";
import { checkEquivalent, isSymbolicallyZero } from "../expr/equivalence";
import { Poly, numericRoots, polyCoefficients, toPoly } from "../expr/polynomial";
import { toLatex, toText } from "../expr/print";
import {
  add,
  div,
  fn,
  mul,
  neg,
  num,
  pow,
  sub,
  substitute,
  substituteSymbols,
  simplify,
  ZERO,
  ONE,
  HALF,
  constantSign,
  frac,
} from "../expr/simplify";
import {
  containsSymbol,
  countSymbol,
  exprKey,
  freeSymbols,
  isConstantExpr,
  rawSym,
  type Expr,
} from "../expr/types";
import { toExpr } from "../parse/convert";
import { syntaxToLatex } from "../parse/print-syntax";
import type { SNode } from "../parse/syntax";
import { makeSolution, REFERENCES } from "../steps/builder";
import {
  aggregateVerification,
  formatComplex,
  formatNumber,
  DEFAULT_DIGITS,
} from "../steps/format";
import type {
  Alternative,
  Answer,
  Solution,
  Step,
  TableData,
  VerificationCheck,
} from "../steps/types";
import { findRealRoots } from "../numeric/methods";
import { factorUnivariate } from "./factor";
import { isolate, PERIOD_SYMBOL } from "./isolate";

export interface EqRoot {
  expr?: Expr;
  approx?: { re: number; im: number };
  multiplicity?: number;
  periodic?: boolean;
}

interface Attempt {
  method: { name: string; description: string; formula?: string };
  steps: Step[];
  roots: EqRoot[];
  status: "solutions" | "none" | "all";
  alternatives?: Alternative[];
  notes?: string[];
  assumptions?: string[];
  rejected?: Array<{ root: EqRoot; reason: string }>;
  numeric?: boolean;
  tables?: TableData[];
  /** Values excluded from the domain (for "all real numbers except ..."). */
  excluded?: Expr[];
}

const eq = (L: Expr, R: Expr) => `${toLatex(L)} = ${toLatex(R)}`;
const X = (x: string) => rawSym(x);

function rootValue(r: EqRoot): { re: number; im: number } {
  if (r.approx) return r.approx;
  if (r.expr) {
    const env: Record<string, number> = {};
    if (containsSymbol(r.expr, PERIOD_SYMBOL)) env[PERIOD_SYMBOL] = 0;
    const v = evalComplex(r.expr, env);
    return { re: v.re, im: v.im };
  }
  return { re: NaN, im: NaN };
}

function hasParameters(r: EqRoot): boolean {
  return !!r.expr && [...freeSymbols(r.expr)].some((v) => v !== PERIOD_SYMBOL);
}

function isRealRoot(r: EqRoot): boolean {
  if (hasParameters(r)) return !containsSymbol(r.expr!, "i");
  const v = rootValue(r);
  return Number.isFinite(v.re) && Math.abs(v.im) <= 1e-12 * Math.max(1, Math.abs(v.re));
}

export function chooseVariable(vars: Set<string>, preferred?: string): string {
  if (preferred && vars.has(preferred)) return preferred;
  if (preferred) return preferred;
  for (const v of ["x", "y", "z", "t", "n", "a"]) if (vars.has(v)) return v;
  return [...vars].sort()[0];
}

// ---------------------------------------------------------------------------
// Linear
// ---------------------------------------------------------------------------

function lcdOfCoefficients(cs: Expr[]): bigint {
  let l = 1n;
  const visit = (e: Expr) => {
    if (e.type === "num") l = bigLcm(l, e.value.den);
    else if (e.type === "mul" && e.factors[0].type === "num") l = bigLcm(l, e.factors[0].value.den);
    else if (e.type === "add") e.terms.forEach(visit);
  };
  cs.forEach(visit);
  return l;
}

function linearAttempt(L0: Expr, R0: Expr, x: string): Attempt | null {
  let L = L0;
  let R = R0;
  const steps: Step[] = [];
  const assumptions: string[] = [];
  const Le = expand(L);
  const Re = expand(R);
  if (exprKey(Le) !== exprKey(L) || exprKey(Re) !== exprKey(R)) {
    steps.push({
      title: "Jabarkan kedua ruas",
      before: eq(L, R),
      after: eq(Le, Re),
      operation: "expand-both-sides",
      rule: { id: "distributive", name: "Sifat distributif", formula: "a(b + c) = ab + ac" },
      reason: "Hilangkan tanda kurung agar suku-suku dapat dikelompokkan.",
    });
    L = Le;
    R = Re;
  }
  let cL = polyCoefficients(L, x, true);
  let cR = polyCoefficients(R, x, true);
  if (!cL || !cR || cL.length > 2 || cR.length > 2) return null;
  const lcd = lcdOfCoefficients([...cL, ...cR]);
  if (lcd > 1n) {
    const nL = expand(mul(num(lcd), L));
    const nR = expand(mul(num(lcd), R));
    steps.push({
      title: `Kalikan kedua ruas dengan ${lcd} (KPK penyebut)`,
      before: eq(L, R),
      after: eq(nL, nR),
      operation: "clear-fractions",
      rule: {
        id: "mul-both",
        name: "Sifat perkalian kesamaan",
        formula: "a = b \\iff ca = cb,\\ c \\ne 0",
      },
      reason: "Menghilangkan pecahan agar perhitungan lebih mudah.",
    });
    L = nL;
    R = nR;
    cL = polyCoefficients(L, x, true)!;
    cR = polyCoefficients(R, x, true)!;
  }
  const a1 = cL[1] ?? ZERO;
  const b1 = cL[0] ?? ZERO;
  const a2 = cR[1] ?? ZERO;
  const b2 = cR[0] ?? ZERO;
  const xs = X(x);
  if (!(a2.type === "num" && a2.value.isZero())) {
    const nL = add(mul(sub(a1, a2), xs), b1);
    const nR = b2;
    const negA2 = a2.type === "num" && a2.value.isNegative();
    steps.push({
      title: negA2
        ? `Tambahkan $${toLatex(mul(neg(a2), xs))}$ ke kedua ruas`
        : `Kurangi kedua ruas dengan $${toLatex(mul(a2, xs))}$`,
      before: eq(L, R),
      after: eq(nL, nR),
      operation: "move-variable-terms",
      rule: {
        id: "add-both",
        name: "Sifat penjumlahan kesamaan",
        formula: "a = b \\iff a + c = b + c",
      },
      reason: "Kumpulkan semua suku yang memuat variabel di ruas kiri.",
    });
    L = nL;
    R = nR;
  }
  const A = sub(a1, a2);
  if (!(b1.type === "num" && b1.value.isZero())) {
    const nL = mul(A, xs);
    const nR = sub(b2, b1);
    const negB1 = b1.type === "num" ? b1.value.isNegative() : constantSign(b1) === -1;
    steps.push({
      title: negB1
        ? `Tambahkan $${toLatex(neg(b1))}$ ke kedua ruas`
        : `Kurangi kedua ruas dengan $${toLatex(b1)}$`,
      before: eq(L, R),
      after: eq(nL, nR),
      operation: "move-constants",
      rule: {
        id: "add-both",
        name: "Sifat penjumlahan kesamaan",
        formula: "a = b \\iff a + c = b + c",
      },
      reason: "Kumpulkan semua konstanta di ruas kanan.",
    });
    L = nL;
    R = nR;
  }
  const B = sub(b2, b1);
  if (A.type === "num" && A.value.isZero()) {
    const identity = B.type === "num" && B.value.isZero();
    steps.push({
      title: identity ? "Kedua ruas selalu sama" : "Diperoleh pernyataan yang salah",
      after: eq(ZERO, B),
      operation: identity ? "identity" : "contradiction",
      reason: identity
        ? "Koefisien variabel menjadi 0 dan kedua ruas bernilai sama, sehingga setiap bilangan real memenuhi."
        : "Koefisien variabel menjadi 0 tetapi ruas kanan tidak 0, sehingga tidak ada nilai yang memenuhi.",
    });
    return {
      method: { name: "Persamaan linear", description: "Operasi yang sama pada kedua ruas." },
      steps,
      roots: [],
      status: identity ? "all" : "none",
    };
  }
  const sol = div(B, A);
  if (!(A.type === "num" && A.value.isOne())) {
    if (!isConstantExpr(A) || A.type !== "num") assumptions.push(`$${toLatex(A)} \\ne 0$`);
    const isFrac =
      A.type === "num" && (A.value.num === 1n || A.value.num === -1n) && !A.value.isInteger();
    steps.push({
      title: isFrac
        ? `Kalikan kedua ruas dengan $${toLatex(div(ONE, A))}$`
        : `Bagi kedua ruas dengan $${toLatex(A)}$`,
      before: eq(L, R),
      after: eq(xs, sol),
      operation: "divide-coefficient",
      rule: {
        id: "mul-both",
        name: "Sifat perkalian kesamaan",
        formula: "ax = b \\iff x = \\frac{b}{a},\\ a \\ne 0",
      },
      reason: "Variabel diisolasi dengan membagi koefisiennya.",
      assumptions: A.type === "num" ? undefined : [`${toLatex(A)} \\ne 0`],
    });
  }
  return {
    method: {
      name: "Persamaan linear (metode keseimbangan)",
      description: "Lakukan operasi yang sama pada kedua ruas hingga variabel terisolasi.",
      formula: "ax + b = c \\iff x = \\frac{c - b}{a}",
    },
    steps,
    roots: [{ expr: sol }],
    status: "solutions",
    assumptions,
  };
}

// ---------------------------------------------------------------------------
// Quadratic
// ---------------------------------------------------------------------------

function isRationalSquare(r: Rational): Rational | null {
  if (r.isNegative()) return null;
  const n = exactIntRoot(r.num, 2);
  const d = exactIntRoot(r.den, 2);
  return n !== null && d !== null ? Rational.of(n, d) : null;
}

function standardFormSteps(L: Expr, R: Expr, P: Poly, x: string): { steps: Step[]; P: Poly } {
  const steps: Step[] = [];
  let poly = P;
  const std = poly.toExpr(x);
  if (!(R.type === "num" && R.value.isZero()) || exprKey(L) !== exprKey(std)) {
    steps.push({
      title: "Pindahkan semua suku ke ruas kiri dan sederhanakan",
      before: eq(L, R),
      after: eq(std, ZERO),
      operation: "standard-form",
      rule: {
        id: "add-both",
        name: "Sifat penjumlahan kesamaan",
        formula: "a = b \\iff a - b = 0",
      },
      reason: "Bentuk umum polinomial = 0 memudahkan pemilihan metode.",
    });
  }
  let den = 1n;
  for (const c of poly.coeffs) den = bigLcm(den, c.den);
  if (den > 1n) {
    const np = poly.scale(Rational.of(den));
    steps.push({
      title: `Kalikan kedua ruas dengan ${den}`,
      before: eq(poly.toExpr(x), ZERO),
      after: eq(np.toExpr(x), ZERO),
      operation: "clear-fractions",
      reason: "Menghilangkan pecahan pada koefisien.",
    });
    poly = np;
  }
  if (poly.lead().isNegative()) {
    const np = poly.scale(Rational.MINUS_ONE);
    steps.push({
      title: "Kalikan kedua ruas dengan −1",
      before: eq(poly.toExpr(x), ZERO),
      after: eq(np.toExpr(x), ZERO),
      operation: "negate",
      reason: "Agar koefisien pangkat tertinggi positif.",
    });
    poly = np;
  }
  return { steps, P: poly };
}

function quadraticFormulaSteps(
  a: Rational,
  b: Rational,
  c: Rational,
  x: string,
): { steps: Step[]; roots: EqRoot[] } {
  const D = b.mul(b).sub(Rational.of(4).mul(a).mul(c));
  const sqrtD = pow(num(D), HALF);
  const x1 = div(add(num(b.neg()), sqrtD), num(a.mul(Rational.TWO)));
  const x2 = div(sub(num(b.neg()), sqrtD), num(a.mul(Rational.TWO)));
  const par = (r: Rational) =>
    r.isNegative() ? `\\left(${toLatex(num(r))}\\right)` : toLatex(num(r));
  const steps: Step[] = [
    {
      title: "Substitusikan a, b, c ke rumus kuadratik (rumus ABC)",
      after: `${toLatex(X(x))}_{1,2} = \\frac{-${par(b)} \\pm \\sqrt{${par(b)}^{2} - 4 \\cdot ${par(a)} \\cdot ${par(c)}}}{2 \\cdot ${par(a)}} = \\frac{${toLatex(num(b.neg()))} \\pm \\sqrt{${toLatex(num(D))}}}{${toLatex(num(a.mul(Rational.TWO)))}}`,
      operation: "quadratic-formula",
      rule: {
        id: "quadratic-formula",
        name: "Rumus kuadratik (rumus ABC)",
        formula: "x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
        conditions: "a ≠ 0",
      },
      reason: "Rumus ABC berlaku untuk semua persamaan kuadrat.",
    },
  ];
  if (!D.isZero()) {
    const simplifiedRoot = toLatex(sqrtD);
    if (simplifiedRoot !== `\\sqrt{${toLatex(num(D))}}`) {
      steps.push({
        title: "Sederhanakan bentuk akar",
        after: `\\sqrt{${toLatex(num(D))}} = ${simplifiedRoot}`,
        operation: "simplify-radical",
        rule: {
          id: "radical",
          name: "Penyederhanaan akar",
          formula: "\\sqrt{a^2 b} = a\\sqrt{b},\\ \\sqrt{-a} = i\\sqrt{a}",
        },
        reason: D.isNegative()
          ? "Akar dari bilangan negatif menghasilkan bilangan imajiner (i² = −1)."
          : "Keluarkan faktor kuadrat sempurna dari bawah akar.",
      });
    }
    steps.push({
      title: "Hitung kedua akar",
      after: `${toLatex(X(x))}_{1} = ${toLatex(x1)},\\quad ${toLatex(X(x))}_{2} = ${toLatex(x2)}`,
      operation: "compute-roots",
      reason: "Gunakan tanda + untuk akar pertama dan − untuk akar kedua.",
    });
    return { steps, roots: [{ expr: x1 }, { expr: x2 }] };
  }
  steps.push({
    title: "D = 0: akar kembar",
    after: `${toLatex(X(x))}_{1} = ${toLatex(X(x))}_{2} = ${toLatex(x1)}`,
    operation: "double-root",
    reason: "Karena √D = 0, kedua akar sama.",
  });
  return { steps, roots: [{ expr: x1, multiplicity: 2 }] };
}

function completingSquareSteps(a: Rational, b: Rational, c: Rational, x: string): Step[] {
  const xs = X(x);
  const p = b.div(a);
  const q = c.div(a);
  const h = p.div(Rational.TWO);
  const rhs = q.neg().add(h.mul(h));
  const shifted = add(xs, num(h));
  const steps: Step[] = [];
  if (!a.isOne())
    steps.push({
      title: `Bagi kedua ruas dengan a = ${a.toString()}`,
      after: eq(add(pow(xs, num(2)), mul(num(p), xs), num(q)), ZERO),
      operation: "normalize",
      reason: "Koefisien x² harus 1 untuk melengkapkan kuadrat.",
    });
  steps.push({
    title: "Pindahkan konstanta ke ruas kanan",
    after: eq(add(pow(xs, num(2)), mul(num(p), xs)), num(q.neg())),
    operation: "move-constant",
    reason: "Siapkan ruas kiri untuk dilengkapkan.",
  });
  steps.push({
    title: `Tambahkan (b/2a)² = $${toLatex(num(h.mul(h)))}$ ke kedua ruas`,
    after: eq(add(pow(xs, num(2)), mul(num(p), xs), num(h.mul(h))), num(rhs)),
    operation: "complete-square",
    rule: {
      id: "complete-square",
      name: "Melengkapkan kuadrat sempurna",
      formula: "x^2 + px + \\left(\\tfrac{p}{2}\\right)^2 = \\left(x + \\tfrac{p}{2}\\right)^2",
    },
    reason: "Ruas kiri menjadi kuadrat sempurna.",
  });
  steps.push({
    title: "Tulis ruas kiri sebagai kuadrat",
    after: `\\left(${toLatex(shifted)}\\right)^{2} = ${toLatex(num(rhs))}`,
    operation: "square-form",
    reason: "x² + px + (p/2)² = (x + p/2)².",
  });
  const root = pow(num(rhs), HALF);
  steps.push({
    title: "Tarik akar kedua ruas",
    after: `${toLatex(shifted)} = \\pm ${toLatex(root)}`,
    operation: "sqrt-both",
    rule: {
      id: "even-root",
      name: "Sifat akar kuadrat",
      formula: "u^2 = c \\iff u = \\pm\\sqrt{c}",
    },
    reason: "Kuadrat suatu bilangan sama dengan c berarti bilangan itu ±√c.",
  });
  steps.push({
    title: "Isolasi x",
    after: `${toLatex(xs)} = ${toLatex(num(h.neg()))} \\pm ${toLatex(root)}`,
    operation: "isolate",
    reason: `Kurangi kedua ruas dengan $${toLatex(num(h))}$.`,
  });
  return steps;
}

function quadraticAttempt(L: Expr, R: Expr, P0: Poly, x: string): Attempt {
  const { steps, P } = standardFormSteps(L, R, P0, x);
  const a = P.coeff(2);
  const b = P.coeff(1);
  const c = P.coeff(0);
  const xs = X(x);
  const D = b.mul(b).sub(Rational.of(4).mul(a).mul(c));
  steps.push({
    title: "Identifikasi koefisien",
    after: `a = ${toLatex(num(a))},\\quad b = ${toLatex(num(b))},\\quad c = ${toLatex(num(c))}`,
    operation: "identify-coefficients",
    reason: "Bandingkan dengan bentuk umum ax² + bx + c = 0.",
  });
  steps.push({
    title: "Hitung diskriminan",
    after: `D = b^2 - 4ac = ${toLatex(num(D))}`,
    operation: "discriminant",
    rule: { id: "discriminant", name: "Diskriminan", formula: "D = b^2 - 4ac" },
    reason: D.isPositive()
      ? "D > 0: ada dua akar real berbeda."
      : D.isZero()
        ? "D = 0: ada satu akar real (akar kembar)."
        : "D < 0: tidak ada akar real; kedua akar merupakan bilangan kompleks sekawan.",
  });
  const alternatives: Alternative[] = [];
  const formula = quadraticFormulaSteps(a, b, c, x);
  const cs = completingSquareSteps(a, b, c, x);
  let method: Attempt["method"];
  let roots: EqRoot[];
  const sqrtD = isRationalSquare(D);
  if (c.isZero()) {
    const r2 = num(b.neg().div(a));
    steps.push({
      title: `Faktorkan $${toLatex(xs)}$ keluar`,
      after: eq(mul(xs, add(mul(num(a), xs), num(b))), ZERO),
      operation: "factor-gcf",
      rule: { id: "distributive", name: "Sifat distributif", formula: "ax^2 + bx = x(ax + b)" },
      reason: "Setiap suku memuat x.",
    });
    steps.push({
      title: "Gunakan sifat perkalian nol",
      after: `${toLatex(xs)} = 0 \\ \\lor\\ ${toLatex(add(mul(num(a), xs), num(b)))} = 0`,
      operation: "zero-product",
      rule: {
        id: "zero-product",
        name: "Sifat perkalian nol",
        formula: "pq = 0 \\iff p = 0 \\lor q = 0",
      },
      reason: "Hasil kali bernilai nol jika salah satu faktornya nol.",
    });
    steps.push({
      title: "Selesaikan masing-masing faktor",
      after: `${toLatex(xs)}_{1} = 0,\\quad ${toLatex(xs)}_{2} = ${toLatex(r2)}`,
      operation: "solve-factors",
      reason: "Setiap faktor linear diselesaikan.",
    });
    method = {
      name: "Faktorisasi (faktor persekutuan x)",
      description: "Keluarkan x sebagai faktor persekutuan lalu gunakan sifat perkalian nol.",
    };
    roots = b.isZero() ? [{ expr: ZERO, multiplicity: 2 }] : [{ expr: ZERO }, { expr: r2 }];
    alternatives.push({
      name: "Rumus kuadratik (rumus ABC)",
      description: "Substitusi koefisien ke rumus ABC.",
      steps: formula.steps,
    });
  } else if (b.isZero()) {
    const rhs = c.neg().div(a);
    steps.push({
      title: "Isolasi x²",
      after: eq(pow(xs, num(2)), num(rhs)),
      operation: "isolate-square",
      reason: "Tidak ada suku x sehingga x² dapat langsung diisolasi.",
    });
    const root = pow(num(rhs), HALF);
    steps.push({
      title: "Tarik akar kuadrat kedua ruas",
      after: `${toLatex(xs)} = \\pm ${toLatex(root)}`,
      operation: "sqrt-both",
      rule: {
        id: "even-root",
        name: "Sifat akar kuadrat",
        formula: "x^2 = c \\iff x = \\pm\\sqrt{c}",
      },
      reason: rhs.isNegative()
        ? "Ruas kanan negatif sehingga akarnya imajiner (tidak ada akar real)."
        : "Kuadrat bernilai c dicapai oleh ±√c.",
    });
    method = {
      name: "Sifat akar kuadrat",
      description: "Isolasi x² lalu tarik akar kuadrat kedua ruas.",
      formula: "x^2 = c \\iff x = \\pm\\sqrt{c}",
    };
    roots = [{ expr: root }, { expr: neg(root) }];
    alternatives.push({
      name: "Rumus kuadratik (rumus ABC)",
      description: "Substitusi koefisien ke rumus ABC.",
      steps: formula.steps,
    });
  } else if (sqrtD) {
    const f = factorUnivariate(P, x);
    steps.push(...f.steps);
    const factorLatex = f.factors.map((fc) => `${toLatex(fc.factor)} = 0`).join(" \\ \\lor\\ ");
    steps.push({
      title: "Gunakan sifat perkalian nol",
      after: factorLatex,
      operation: "zero-product",
      rule: {
        id: "zero-product",
        name: "Sifat perkalian nol",
        formula: "pq = 0 \\iff p = 0 \\lor q = 0",
      },
      reason: "Hasil kali bernilai nol jika salah satu faktornya nol.",
    });
    // Same order as the final answers (ascending), so x₁/x₂ labels agree everywhere.
    roots = [...formula.roots].sort((a, b) => evalReal(a.expr!) - evalReal(b.expr!));
    steps.push({
      title: "Selesaikan setiap faktor",
      after: roots
        .map((r, i) => `${toLatex(xs)}_{${i + 1}} = ${toLatex(r.expr!)}`)
        .join(",\\quad "),
      operation: "solve-factors",
      reason: "Setiap faktor linear diselesaikan secara terpisah.",
    });
    method = {
      name: "Faktorisasi",
      description:
        "Diskriminan merupakan kuadrat sempurna sehingga polinomial dapat difaktorkan atas bilangan rasional.",
    };
    alternatives.push({
      name: "Rumus kuadratik (rumus ABC)",
      description: "Substitusi koefisien ke rumus ABC.",
      steps: formula.steps,
    });
  } else {
    steps.push(...formula.steps);
    roots = formula.roots;
    method = {
      name: "Rumus kuadratik (rumus ABC)",
      description:
        "Diskriminan bukan kuadrat sempurna sehingga akar-akarnya irasional/kompleks; rumus ABC memberikan bentuk eksak.",
      formula: "x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
    };
  }
  alternatives.push({
    name: "Melengkapkan kuadrat sempurna",
    description: "Ubah ruas kiri menjadi bentuk (x + p)² lalu tarik akar.",
    steps: cs,
  });
  const notes: string[] = [];
  if (D.isNegative())
    notes.push(
      "Diskriminan negatif: persamaan tidak memiliki penyelesaian bilangan real. Akar kompleks ditampilkan sebagai informasi.",
    );
  // Vieta check as extra info
  return { method, steps, roots, status: "solutions", alternatives, notes };
}

// ---------------------------------------------------------------------------
// Higher-degree polynomials
// ---------------------------------------------------------------------------

function polynomialAttempt(L: Expr, R: Expr, P0: Poly, x: string): Attempt {
  const deg = P0.degree;
  if (deg <= 0) {
    const zero = P0.isZero();
    return {
      method: { name: "Persamaan konstan", description: "Variabel hilang setelah penyederhanaan." },
      steps: [
        {
          title: zero ? "Kedua ruas identik" : "Diperoleh pernyataan yang salah",
          before: eq(L, R),
          after: eq(P0.toExpr(x), ZERO),
          operation: zero ? "identity" : "contradiction",
          reason: zero
            ? "Setiap bilangan real memenuhi persamaan."
            : "Tidak ada nilai yang memenuhi.",
        },
      ],
      roots: [],
      status: zero ? "all" : "none",
    };
  }
  if (deg === 1) return linearAttempt(L, R, x)!;
  if (deg === 2) return quadraticAttempt(L, R, P0, x);
  const { steps, P } = standardFormSteps(L, R, P0, x);
  const xs = X(x);
  const nonzero = P.coeffs.map((c, k) => ({ c, k })).filter((t) => !t.c.isZero());
  // pure power a x^n + c = 0
  if (nonzero.length === 2 && nonzero[0].k === 0) {
    const n = nonzero[1].k;
    const rhs = nonzero[0].c.neg().div(nonzero[1].c);
    steps.push({
      title: `Isolasi $${toLatex(pow(xs, num(n)))}$`,
      after: eq(pow(xs, num(n)), num(rhs)),
      operation: "isolate-power",
      reason: "Hanya ada satu suku yang memuat x.",
    });
    const roots: EqRoot[] = [];
    // all n complex roots: r^(1/n) * exp(2 pi i k / n)
    const mag = Math.pow(Math.abs(rhs.toNumber()), 1 / n);
    const baseAng = rhs.isNegative() ? Math.PI : 0;
    for (let k = 0; k < n; k++) {
      const ang = (baseAng + 2 * Math.PI * k) / n;
      const re = mag * Math.cos(ang);
      const im = mag * Math.sin(ang);
      if (Math.abs(im) < 1e-12 * Math.max(1, mag)) {
        roots.push({
          expr: re >= 0 ? pow(num(rhs.abs()), frac(1, n)) : neg(pow(num(rhs.abs()), frac(1, n))),
          approx: { re, im: 0 },
        });
      } else roots.push({ approx: { re, im } });
    }
    steps.push({
      title: `Tarik akar pangkat ${n}`,
      after:
        roots
          .filter(isRealRoot)
          .map((r) => `${toLatex(xs)} = ${toLatex(r.expr!)}`)
          .join(",\\ ") || "\\text{tidak ada akar real}",
      operation: "nth-root",
      rule: {
        id: "nth-root",
        name: "Akar pangkat n",
        formula:
          n % 2 === 0
            ? "x^{n} = c \\iff x = \\pm\\sqrt[n]{c},\\ c \\ge 0"
            : "x^{n} = c \\iff x = \\sqrt[n]{c}",
      },
      reason:
        n % 2 === 0
          ? "Pangkat genap: dua akar real jika ruas kanan positif."
          : "Pangkat ganjil: tepat satu akar real.",
    });
    return {
      method: {
        name: "Akar pangkat n",
        description:
          "Isolasi xⁿ lalu tarik akar pangkat n; akar kompleks dihitung dengan bentuk polar (de Moivre).",
      },
      steps,
      roots,
      status: "solutions",
      notes: ["Akar kompleks dihitung dengan rumus de Moivre dan ditampilkan sebagai aproksimasi."],
    };
  }
  // biquadratic a x^4 + b x^2 + c
  if (deg === 4 && P.coeff(1).isZero() && P.coeff(3).isZero()) {
    const u = rawSym("u");
    const Q = new Poly([P.coeff(0), P.coeff(2), P.coeff(4)]);
    steps.push({
      title: "Substitusi u = x²",
      after: eq(Q.toExpr(u), ZERO),
      operation: "substitution",
      rule: { id: "substitution", name: "Substitusi", formula: "u = x^2" },
      reason: "Polinomial hanya memuat pangkat genap sehingga menjadi persamaan kuadrat dalam u.",
    });
    const inner = quadraticAttempt(Q.toExpr(u), ZERO, Q, "u");
    steps.push({
      title: "Selesaikan persamaan kuadrat dalam u",
      after: inner.roots.map((r, i) => `u_{${i + 1}} = ${toLatex(r.expr!)}`).join(",\\ "),
      operation: "solve-quadratic",
      reason: inner.method.name,
      substeps: inner.steps,
    });
    const roots: EqRoot[] = [];
    for (const r of inner.roots) {
      const s = pow(r.expr!, HALF);
      roots.push({ expr: s }, { expr: neg(s) });
    }
    steps.push({
      title: "Kembalikan substitusi: x = ±√u",
      after: roots.map((r) => `${toLatex(xs)} = ${toLatex(r.expr!)}`).join(",\\ "),
      operation: "back-substitute",
      reason: "Setiap nilai u memberi dua nilai x.",
    });
    return {
      method: {
        name: "Persamaan bikuadrat (substitusi u = x²)",
        description: "Ubah menjadi persamaan kuadrat dalam u lalu kembalikan substitusi.",
      },
      steps,
      roots,
      status: "solutions",
    };
  }
  // general: rational roots + remaining factor
  const f = factorUnivariate(P, x);
  steps.push(...f.steps);
  const roots: EqRoot[] = [];
  const notes: string[] = [];
  let numeric = false;
  for (const { factor, multiplicity } of f.factors) {
    const fp = toPoly(factor, x)!;
    if (fp.degree === 1)
      roots.push({ expr: div(num(fp.coeff(0).neg()), num(fp.coeff(1))), multiplicity });
    else if (fp.degree === 2) {
      const q = quadraticFormulaSteps(fp.coeff(2), fp.coeff(1), fp.coeff(0), x);
      steps.push({
        title: `Selesaikan faktor kuadrat $${toLatex(factor)} = 0$`,
        after: q.roots.map((r) => `${toLatex(xs)} = ${toLatex(r.expr!)}`).join(",\\ "),
        operation: "solve-quadratic-factor",
        reason: "Faktor kuadrat diselesaikan dengan rumus ABC.",
        substeps: q.steps,
      });
      for (const r of q.roots)
        roots.push({ ...r, multiplicity: (r.multiplicity ?? 1) * multiplicity });
    } else {
      const nr = numericRoots(fp);
      numeric = true;
      steps.push({
        title: `Akar faktor berderajat ${fp.degree} dihitung secara numerik`,
        after: nr.roots
          .map((r) => `${toLatex(xs)} \\approx ${formatComplex(r.re, r.im)}`)
          .join(",\\ "),
        operation: "numeric-roots",
        rule: {
          id: "durand-kerner",
          name: "Metode Durand–Kerner (Weierstrass)",
          formula: "z_i \\leftarrow z_i - \\frac{p(z_i)}{\\prod_{j \\ne i}(z_i - z_j)}",
        },
        reason: `Faktor ini tidak memiliki akar rasional; akar dihitung secara iteratif (${nr.iterations} iterasi, toleransi relatif 1e-13${nr.converged ? "" : ", TIDAK konvergen"}).`,
      });
      if (!nr.converged)
        notes.push("Iterasi numerik tidak konvergen penuh; akar numerik mungkin kurang akurat.");
      for (const r of nr.roots) roots.push({ approx: { re: r.re, im: r.im }, multiplicity });
    }
  }
  if (numeric) notes.push("Sebagian akar merupakan aproksimasi numerik (bukan bentuk eksak).");
  return {
    method: {
      name: "Teorema akar rasional dan pembagian sintetik",
      description:
        "Cari akar rasional, turunkan derajat polinomial dengan pembagian sintetik, lalu selesaikan faktor yang tersisa.",
    },
    steps,
    roots,
    status: "solutions",
    notes,
    numeric,
  };
}

// ---------------------------------------------------------------------------
// Symbolic quadratic (literal coefficients)
// ---------------------------------------------------------------------------

function symbolicQuadraticAttempt(L: Expr, R: Expr, cs: Expr[], x: string): Attempt {
  const [c, b, a] = cs;
  const xs = X(x);
  const D = sub(pow(b, num(2)), mul(num(4), a, c));
  const sqrtD = pow(D, HALF);
  const x1 = div(add(neg(b), sqrtD), mul(num(2), a));
  const x2 = div(sub(neg(b), sqrtD), mul(num(2), a));
  const steps: Step[] = [
    {
      title: "Tulis dalam bentuk umum",
      before: eq(L, R),
      after: eq(add(mul(a, pow(xs, num(2))), mul(b, xs), c), ZERO),
      operation: "standard-form",
      reason: "Kumpulkan semua suku di ruas kiri.",
    },
    {
      title: "Identifikasi koefisien",
      after: `a = ${toLatex(a)},\\ b = ${toLatex(b)},\\ c = ${toLatex(c)}`,
      operation: "identify-coefficients",
      reason: "Koefisien boleh memuat parameter.",
    },
    {
      title: "Gunakan rumus kuadratik",
      after: `${toLatex(xs)}_{1,2} = \\frac{${toLatex(neg(b))} \\pm \\sqrt{${toLatex(D)}}}{${toLatex(mul(num(2), a))}}`,
      operation: "quadratic-formula",
      rule: {
        id: "quadratic-formula",
        name: "Rumus kuadratik",
        formula: "x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
      },
      reason: "Rumus ABC berlaku untuk koefisien simbolik selama a ≠ 0.",
    },
  ];
  return {
    method: {
      name: "Rumus kuadratik (koefisien simbolik)",
      description: "Persamaan kuadrat dengan parameter diselesaikan dengan rumus ABC.",
    },
    steps,
    roots: [{ expr: x1 }, { expr: x2 }],
    status: "solutions",
    assumptions: [`$${toLatex(a)} \\ne 0$`, "Akar real hanya ada jika diskriminan ≥ 0."],
  };
}

// ---------------------------------------------------------------------------
// Rational equations
// ---------------------------------------------------------------------------

function variableDenominators(e: Expr, x: string, out: Expr[] = []): Expr[] {
  if (
    e.type === "pow" &&
    e.exp.type === "num" &&
    e.exp.value.isNegative() &&
    containsSymbol(e.base, x)
  ) {
    if (!out.some((d) => exprKey(d) === exprKey(e.base))) out.push(e.base);
  }
  if (e.type === "add" || e.type === "mul")
    for (const c of e.type === "add" ? e.terms : e.factors) variableDenominators(c, x, out);
  if (e.type === "pow") variableDenominators(e.base, x, out);
  return out;
}

function rationalAttempt(L: Expr, R: Expr, x: string, depth: number): Attempt | null {
  const dens = [...variableDenominators(L, x), ...variableDenominators(R, x)];
  if (dens.length === 0) return null;
  const steps: Step[] = [];
  const xs = X(x);
  // exclusions: real zeros of denominators
  const excluded: Expr[] = [];
  for (const d of dens) {
    const p = toPoly(d, x);
    if (p) {
      const { roots, rest } = p.rationalRoots();
      for (const r of roots)
        if (!excluded.some((e) => exprKey(e) === exprKey(num(r)))) excluded.push(num(r));
      if (rest.degree === 2) {
        const disc = rest
          .coeff(1)
          .mul(rest.coeff(1))
          .sub(Rational.of(4).mul(rest.coeff(2)).mul(rest.coeff(0)));
        if (!disc.isNegative()) {
          for (const sgn of [1, -1]) {
            excluded.push(
              div(
                add(num(rest.coeff(1).neg()), mul(num(sgn), pow(num(disc), HALF))),
                num(rest.coeff(2).mul(Rational.TWO)),
              ),
            );
          }
        }
      }
    }
  }
  steps.push({
    title: "Tentukan syarat: penyebut tidak boleh nol",
    after:
      dens.map((d) => `${toLatex(d)} \\ne 0`).join(",\\ ") +
      (excluded.length
        ? `\\ \\Rightarrow\\ ${excluded.map((e) => `${toLatex(xs)} \\ne ${toLatex(e)}`).join(",\\ ")}`
        : ""),
    operation: "domain",
    rule: {
      id: "domain-rational",
      name: "Syarat pecahan",
      formula: "\\frac{p}{q} \\text{ terdefinisi} \\iff q \\ne 0",
    },
    reason: "Nilai yang membuat penyebut nol tidak boleh menjadi solusi.",
  });
  const f = sub(L, R);
  const { numer, denom } = together(f);
  const N = expand(numer);
  steps.push({
    title: "Kalikan kedua ruas dengan KPK penyebut",
    before: eq(L, R),
    after: eq(N, ZERO),
    operation: "multiply-lcd",
    rule: {
      id: "mul-both",
      name: "Sifat perkalian kesamaan",
      formula: "\\frac{p}{q} = 0 \\iff p = 0,\\ q \\ne 0",
    },
    reason: `Semua pecahan digabung dengan penyebut $${toLatex(denom)}$; pecahan bernilai nol tepat ketika pembilangnya nol (dan penyebut tidak nol).`,
  });
  const inner = solveCore(N, ZERO, x, depth + 1);
  steps.push({
    title: `Selesaikan $${toLatex(N)} = 0$`,
    after: inner.roots.length
      ? inner.roots
          .map(
            (r) =>
              `${toLatex(xs)} = ${r.expr ? toLatex(r.expr) : formatComplex(r.approx!.re, r.approx!.im)}`,
          )
          .join(",\\ ")
      : inner.status === "all"
        ? "\\text{semua bilangan real}"
        : "\\text{tidak ada solusi}",
    operation: "solve-numerator",
    reason: inner.method.name,
    substeps: inner.steps,
  });
  const rejected: Attempt["rejected"] = [];
  const kept: EqRoot[] = [];
  for (const r of inner.roots) {
    const v = rootValue(r);
    const bad =
      excluded.some(
        (e) =>
          Math.abs(evalReal(e) - v.re) < 1e-9 * Math.max(1, Math.abs(v.re)) &&
          Math.abs(v.im) < 1e-12,
      ) ||
      dens.some((d) => {
        const dv = evalComplex(d, { [x]: v.re });
        return Math.hypot(dv.re, dv.im) < 1e-12;
      });
    if (bad) rejected.push({ root: r, reason: "membuat penyebut bernilai nol (solusi palsu)" });
    else kept.push(r);
  }
  if (rejected.length) {
    steps.push({
      title: "Periksa syarat penyebut",
      after: rejected
        .map(
          (rj) =>
            `${toLatex(xs)} = ${rj.root.expr ? toLatex(rj.root.expr) : formatNumber(rootValue(rj.root).re)}\\ \\text{ditolak}`,
        )
        .join(",\\ "),
      operation: "reject-extraneous",
      reason: "Kandidat yang membuat penyebut nol bukan solusi persamaan awal.",
    });
  }
  return {
    method: {
      name: "Persamaan rasional",
      description:
        "Tentukan syarat penyebut, kalikan dengan KPK penyebut, selesaikan, lalu buang solusi palsu.",
    },
    steps,
    roots: kept,
    status: inner.status === "all" ? "all" : kept.length ? "solutions" : "none",
    rejected,
    notes: inner.notes,
    excluded,
    numeric: inner.numeric,
  };
}

// ---------------------------------------------------------------------------
// Isolation, substitution, radicals, exponentials, numeric
// ---------------------------------------------------------------------------

function isolationAttempt(L: Expr, R: Expr, x: string): Attempt | null {
  const res = isolate(L, R, x);
  if (!res) return null;
  const steps: Step[] = [];
  const roots: EqRoot[] = [];
  const assumptions = new Set<string>();
  res.branches.forEach((b, i) => {
    if (res.branches.length > 1) {
      steps.push({
        title: `Cabang ${i + 1}`,
        after: `${toLatex(X(x))} = ${toLatex(b.value)}${b.periodic ? ",\\ k \\in \\mathbb{Z}" : ""}`,
        operation: "branch",
        reason: "Setiap cabang diselesaikan terpisah.",
        substeps: b.steps,
      });
    } else steps.push(...b.steps);
    b.conditions.forEach((c) => assumptions.add(`$${c}$`));
    roots.push({ expr: b.value, periodic: b.periodic });
  });
  for (const reason of res.noSolution) {
    steps.push({
      title: "Cabang tanpa solusi real",
      after: "\\varnothing",
      operation: "no-solution",
      reason,
    });
  }
  const periodic = roots.some((r) => r.periodic);
  return {
    method: {
      name: "Isolasi variabel (operasi invers)",
      description:
        "Variabel hanya muncul sekali, sehingga dapat diisolasi dengan menerapkan operasi invers pada kedua ruas.",
    },
    steps,
    roots,
    status: roots.length ? "solutions" : "none",
    assumptions: [...assumptions],
    notes: periodic
      ? [
          "k adalah sebarang bilangan bulat (k ∈ ℤ). Solusi pada interval [0, 2π) ditampilkan sebagai contoh.",
        ]
      : [],
  };
}

function trigPythagoreanRewrite(f: Expr, x: string): Expr {
  // rewrite cos(u)^2 -> 1 - sin(u)^2 when sin(u) also occurs (and vice versa)
  let out = f;
  const visit = (e: Expr, found: Map<string, Expr>) => {
    if (e.type === "fn" && (e.name === "sin" || e.name === "cos") && containsSymbol(e, x))
      found.set(`${e.name}|${exprKey(e.args[0])}`, e);
    if (e.type === "add" || e.type === "mul")
      (e.type === "add" ? e.terms : e.factors).forEach((c) => visit(c, found));
    if (e.type === "pow") visit(e.base, found);
  };
  const found = new Map<string, Expr>();
  visit(f, found);
  for (const [k] of found) {
    const [name, argKey] = k.split("|");
    const other = name === "sin" ? "cos" : "sin";
    if (found.has(`${other}|${argKey}`)) {
      const arg =
        found.get(k)!.type === "fn" ? (found.get(k) as { args: readonly Expr[] }).args[0] : ZERO;
      // replace other^2 by 1 - name^2 (only even powers)
      const target = pow(fn(other, arg), num(2));
      const repl = sub(ONE, pow(fn(name, arg), num(2)));
      const candidate = expand(substitute(out, target, repl));
      const replaced = substitute(expand(out), pow(fn(other, arg), num(2)), repl);
      const test = expand(replaced);
      if (!containsFunction(test, other, arg)) return test;
      if (!containsFunction(candidate, other, arg)) out = candidate;
    }
  }
  return out;
}

function containsFunction(e: Expr, name: string, arg: Expr): boolean {
  if (e.type === "fn" && e.name === name && exprKey(e.args[0]) === exprKey(arg)) return true;
  const kids =
    e.type === "add"
      ? e.terms
      : e.type === "mul"
        ? e.factors
        : e.type === "pow"
          ? [e.base, e.exp]
          : e.type === "fn"
            ? e.args
            : [];
  return kids.some((k) => containsFunction(k, name, arg));
}

function substitutionCandidates(
  f: Expr,
  x: string,
): Array<{ g: Expr; replace: (e: Expr) => Expr }> {
  const cands: Array<{ g: Expr; replace: (e: Expr) => Expr }> = [];
  const U = rawSym("__u");
  const seen = new Set<string>();
  const visit = (e: Expr) => {
    if (e.type === "fn" && containsSymbol(e, x)) {
      const k = exprKey(e);
      if (!seen.has(k)) {
        seen.add(k);
        cands.push({ g: e, replace: (t) => substitute(t, e, U) });
      }
    }
    if (e.type === "pow" && !containsSymbol(e.base, x) && containsSymbol(e.exp, x)) {
      // b^(m x + c): use u = base0^(x) with base0 the smallest common base
      const k = exprKey(e.base);
      if (!seen.has(`exp|${k}`)) {
        seen.add(`exp|${k}`);
        cands.push({ g: pow(e.base, X(x)), replace: (t) => replaceExponentials(t, e.base, x, U) });
      }
    }
    if (
      e.type === "pow" &&
      e.base.type === "sym" &&
      e.base.name === x &&
      e.exp.type === "num" &&
      e.exp.value.den === 2n
    ) {
      if (!seen.has("sqrtx")) {
        seen.add("sqrtx");
        cands.push({ g: pow(X(x), HALF), replace: (t) => replaceSqrtX(t, x, U) });
      }
    }
    const kids =
      e.type === "add"
        ? e.terms
        : e.type === "mul"
          ? e.factors
          : e.type === "pow"
            ? [e.base, e.exp]
            : e.type === "fn"
              ? e.args
              : [];
    kids.forEach(visit);
  };
  visit(f);
  return cands;
}

function replaceExponentials(e: Expr, base: Expr, x: string, U: Expr): Expr {
  const bv = evalReal(base);
  const rec = (t: Expr): Expr => {
    if (t.type === "pow" && !containsSymbol(t.base, x) && containsSymbol(t.exp, x)) {
      const cs = polyCoefficients(t.exp, x);
      const tb = evalReal(t.base);
      if (
        cs &&
        cs.length === 2 &&
        cs[1].type === "num" &&
        Number.isFinite(tb) &&
        tb > 0 &&
        Number.isFinite(bv) &&
        bv > 0
      ) {
        // t = t.base^(m x + c) = t.base^c * (base^x)^(m * log_base(t.base))
        const ratio = Math.log(tb) / Math.log(bv);
        const rr = Math.round(ratio * 1e9) / 1e9;
        const rq = Rational.fromNumber(rr);
        if (Math.abs(ratio - rq.toNumber()) < 1e-12) {
          const m = cs[1].value.mul(rq);
          if (m.isInteger()) return mul(pow(t.base, cs[0]), pow(U, num(m)));
        }
      }
      return t;
    }
    switch (t.type) {
      case "add":
        return add(...t.terms.map(rec));
      case "mul":
        return mul(...t.factors.map(rec));
      case "pow":
        return pow(rec(t.base), rec(t.exp));
      case "fn":
        return fn(t.name, ...t.args.map(rec));
      default:
        return t;
    }
  };
  return rec(e);
}

function replaceSqrtX(e: Expr, x: string, U: Expr): Expr {
  const rec = (t: Expr): Expr => {
    if (t.type === "sym" && t.name === x) return pow(U, num(2));
    if (t.type === "pow" && t.base.type === "sym" && t.base.name === x && t.exp.type === "num") {
      const k = t.exp.value.mul(Rational.TWO);
      if (k.isInteger()) return pow(U, num(k));
    }
    switch (t.type) {
      case "add":
        return add(...t.terms.map(rec));
      case "mul":
        return mul(...t.factors.map(rec));
      case "pow":
        return pow(rec(t.base), rec(t.exp));
      case "fn":
        return fn(t.name, ...t.args.map(rec));
      default:
        return t;
    }
  };
  return rec(e);
}

function substitutionAttempt(L: Expr, R: Expr, x: string, depth: number): Attempt | null {
  if (depth > 3) return null;
  let f = expand(sub(L, R));
  const rewritten = trigPythagoreanRewrite(f, x);
  const steps: Step[] = [];
  if (exprKey(rewritten) !== exprKey(f)) {
    steps.push({
      title: "Gunakan identitas Pythagoras",
      before: eq(f, ZERO),
      after: eq(rewritten, ZERO),
      operation: "pythagorean-identity",
      rule: {
        id: "pythagoras-trig",
        name: "Identitas Pythagoras",
        formula: "\\sin^2 u + \\cos^2 u = 1",
      },
      reason: "Agar persamaan hanya memuat satu jenis fungsi trigonometri.",
    });
    f = rewritten;
  }
  for (const cand of substitutionCandidates(f, x)) {
    const fu = cand.replace(f);
    if (containsSymbol(fu, x)) continue;
    const P = toPoly(fu, "__u");
    if (!P || P.degree < 2) continue;
    const U = rawSym("u");
    const fuDisplay = substitute(fu, rawSym("__u"), U);
    steps.push({
      title: `Substitusi u = $${toLatex(cand.g)}$`,
      before: eq(f, ZERO),
      after: eq(fuDisplay, ZERO),
      operation: "substitution",
      rule: { id: "substitution", name: "Metode substitusi", formula: `u = ${toLatex(cand.g)}` },
      reason: "Persamaan menjadi polinomial dalam u.",
    });
    const inner = solveCore(fuDisplay, ZERO, "u", depth + 1);
    steps.push({
      title: "Selesaikan persamaan dalam u",
      after:
        inner.roots
          .map((r) => `u = ${r.expr ? toLatex(r.expr) : formatComplex(r.approx!.re, r.approx!.im)}`)
          .join(",\\ ") || "\\varnothing",
      operation: "solve-u",
      reason: inner.method.name,
      substeps: inner.steps,
    });
    const roots: EqRoot[] = [];
    const notes: string[] = [...(inner.notes ?? [])];
    const assumptions: string[] = [];
    let periodic = false;
    for (const r of inner.roots) {
      if (!isRealRoot(r)) continue;
      const uval = r.expr ?? num(Rational.fromNumber(r.approx!.re));
      const back = solveCore(cand.g, uval, x, depth + 1);
      steps.push({
        title: `Kembalikan substitusi: $${toLatex(cand.g)} = ${toLatex(uval)}$`,
        after:
          back.status === "none"
            ? "\\text{tidak ada solusi real}"
            : back.roots
                .map(
                  (b) =>
                    `${toLatex(X(x))} = ${b.expr ? toLatex(b.expr) : formatNumber(rootValue(b).re)}${b.periodic ? ",\\ k \\in \\mathbb{Z}" : ""}`,
                )
                .join(",\\ "),
        operation: "back-substitute",
        reason:
          back.status === "none"
            ? back.steps.map((s) => s.reason).join(" ") || "Tidak ada nilai x yang memenuhi."
            : back.method.name,
        substeps: back.steps,
      });
      for (const b of back.roots) {
        roots.push(b);
        if (b.periodic) periodic = true;
      }
      assumptions.push(...(back.assumptions ?? []));
    }
    if (periodic) notes.push("k adalah sebarang bilangan bulat (k ∈ ℤ).");
    return {
      method: {
        name: "Metode substitusi",
        description: `Misalkan u = $${toLatex(cand.g)}$ sehingga persamaan menjadi polinomial dalam u.`,
      },
      steps,
      roots,
      status: roots.length ? "solutions" : "none",
      notes,
      assumptions,
    };
  }
  return null;
}

function radicalAttempt(L: Expr, R: Expr, x: string, depth: number): Attempt | null {
  if (depth > 3) return null;
  const f = sub(L, R);
  const radicals: Expr[] = [];
  const visit = (e: Expr) => {
    if (
      e.type === "pow" &&
      e.exp.type === "num" &&
      !e.exp.value.isInteger() &&
      e.exp.value.num === 1n &&
      containsSymbol(e.base, x)
    ) {
      if (!radicals.some((r) => exprKey(r) === exprKey(e))) radicals.push(e);
    }
    const kids =
      e.type === "add"
        ? e.terms
        : e.type === "mul"
          ? e.factors
          : e.type === "pow"
            ? [e.base, e.exp]
            : e.type === "fn"
              ? e.args
              : [];
    kids.forEach(visit);
  };
  visit(f);
  if (radicals.length !== 1) return null;
  const rad = radicals[0] as Expr & { type: "pow" };
  const q = Number((rad.exp as { value: Rational }).value.den);
  const T = rawSym("__r");
  const g = substitute(f, rad, T);
  const cs = polyCoefficients(g, "__r");
  if (!cs || cs.length !== 2 || containsSymbol(cs[1], x)) return null;
  const A = cs[1];
  const B = cs[0];
  const isolated = div(neg(B), A);
  const steps: Step[] = [];
  steps.push({
    title: "Isolasi bentuk akar di satu ruas",
    before: eq(L, R),
    after: eq(rad, isolated),
    operation: "isolate-radical",
    reason: "Bentuk akar dipisahkan agar dapat dihilangkan dengan memangkatkan kedua ruas.",
  });
  const newL = rad.base;
  const newR = expand(pow(isolated, num(q)));
  steps.push({
    title: q === 2 ? "Kuadratkan kedua ruas" : `Pangkatkan kedua ruas dengan ${q}`,
    before: eq(rad, isolated),
    after: eq(newL, newR),
    operation: "raise-power",
    rule: {
      id: "raise-power",
      name: "Memangkatkan kedua ruas",
      formula: "\\sqrt{u} = v \\Rightarrow u = v^{2}",
      conditions: "Implikasi satu arah: dapat memunculkan solusi palsu.",
    },
    reason:
      "Menghilangkan akar. Karena langkah ini tidak selalu setara, setiap kandidat wajib diperiksa.",
  });
  const inner = solveCore(newL, newR, x, depth + 1);
  steps.push({
    title: "Selesaikan persamaan hasil pemangkatan",
    after:
      inner.roots
        .map(
          (r) => `${toLatex(X(x))} = ${r.expr ? toLatex(r.expr) : formatNumber(rootValue(r).re)}`,
        )
        .join(",\\ ") || "\\varnothing",
    operation: "solve",
    reason: inner.method.name,
    substeps: inner.steps,
  });
  const kept: EqRoot[] = [];
  const rejected: Attempt["rejected"] = [];
  for (const r of inner.roots) {
    if (!isRealRoot(r)) continue;
    const v = rootValue(r).re;
    const lv = evalReal(L, { [x]: v });
    const rv = evalReal(R, { [x]: v });
    if (
      Number.isFinite(lv) &&
      Number.isFinite(rv) &&
      Math.abs(lv - rv) <= 1e-9 * Math.max(1, Math.abs(lv), Math.abs(rv))
    )
      kept.push(r);
    else
      rejected.push({
        root: r,
        reason: `tidak memenuhi persamaan awal (${Number.isFinite(lv) ? `ruas kiri ${formatNumber(lv, 6)}` : "ruas kiri tidak terdefinisi"}, ruas kanan ${formatNumber(rv, 6)}) — solusi palsu akibat pemangkatan`,
      });
  }
  steps.push({
    title: "Periksa setiap kandidat pada persamaan awal",
    after:
      [
        ...kept.map(
          (r) =>
            `${toLatex(X(x))} = ${r.expr ? toLatex(r.expr) : formatNumber(rootValue(r).re)}\\ \\checkmark`,
        ),
        ...rejected.map(
          (rj) =>
            `${toLatex(X(x))} = ${rj.root.expr ? toLatex(rj.root.expr) : formatNumber(rootValue(rj.root).re)}\\ \\times`,
        ),
      ].join(",\\quad ") || "\\varnothing",
    operation: "check-extraneous",
    reason:
      "Pemangkatan kedua ruas dapat menambah solusi palsu, sehingga kandidat disubstitusikan kembali.",
  });
  return {
    method: {
      name: "Persamaan irasional (isolasi akar dan pemangkatan)",
      description:
        "Isolasi bentuk akar, pangkatkan kedua ruas, selesaikan, lalu periksa solusi palsu.",
    },
    steps,
    roots: kept,
    status: kept.length ? "solutions" : "none",
    rejected,
  };
}

function exponentialBothSidesAttempt(L: Expr, R: Expr, x: string, depth: number): Attempt | null {
  const split = (e: Expr): { c: Expr; base: Expr; exp: Expr } | null => {
    if (e.type === "pow" && !containsSymbol(e.base, x) && containsSymbol(e.exp, x))
      return { c: ONE, base: e.base, exp: e.exp };
    if (e.type === "mul") {
      const p = e.factors.filter((f) => containsSymbol(f, x));
      if (p.length === 1 && p[0].type === "pow" && !containsSymbol(p[0].base, x)) {
        return {
          c: mul(...e.factors.filter((f) => !containsSymbol(f, x))),
          base: p[0].base,
          exp: p[0].exp,
        };
      }
    }
    return null;
  };
  const a = split(L);
  const b = split(R);
  if (!a || !b) return null;
  const va = evalReal(a.base);
  const vb = evalReal(b.base);
  const ca = evalReal(a.c);
  const cb = evalReal(b.c);
  if (!(va > 0 && vb > 0 && ca > 0 && cb > 0)) return null;
  const lnSide = (s: { c: Expr; base: Expr; exp: Expr }) =>
    add(fn("ln", s.c), mul(s.exp, fn("ln", s.base)));
  const nL = expand(lnSide(a));
  const nR = expand(lnSide(b));
  const inner = solveCore(nL, nR, x, depth + 1);
  return {
    method: {
      name: "Logaritma kedua ruas",
      description: "Ambil logaritma natural kedua ruas sehingga eksponen menjadi koefisien.",
    },
    steps: [
      {
        title: "Ambil ln kedua ruas",
        before: eq(L, R),
        after: eq(nL, nR),
        operation: "log-both-sides",
        rule: {
          id: "log-power",
          name: "Sifat logaritma",
          formula: "\\ln(c\\,b^{u}) = \\ln c + u \\ln b",
        },
        reason: "Logaritma mengubah perpangkatan menjadi perkalian.",
      },
      ...inner.steps,
    ],
    roots: inner.roots,
    status: inner.status,
    assumptions: inner.assumptions,
  };
}

function numericAttempt(L: Expr, R: Expr, x: string): Attempt {
  const f = sub(L, R);
  const F = (t: number) => evalReal(f, { [x]: t });
  const lo = -100;
  const hi = 100;
  const search = findRealRoots(F, lo, hi, 8000, 40);
  const roots: EqRoot[] = search.roots.map((r) => ({ approx: { re: r.root, im: 0 } }));
  const steps: Step[] = [
    {
      title: "Tidak ada metode simbolik yang berlaku",
      before: eq(L, R),
      after: eq(f, ZERO),
      operation: "numeric-fallback",
      reason: "Sistem beralih ke metode numerik. Hasil adalah aproksimasi.",
    },
    {
      title: `Pindai tanda f(${x}) pada interval [${lo}, ${hi}]`,
      after: `f(${toLatex(X(x))}) = ${toLatex(f)}`,
      operation: "sign-scan",
      reason: `f dievaluasi pada ${search.samples} titik; perubahan tanda menandakan adanya akar (teorema nilai antara). Minimum lokal |f| yang mendekati 0 diperiksa untuk akar ganda.`,
    },
    {
      title: "Perhalus setiap akar dengan metode Brent",
      after: roots.length
        ? roots
            .map((r) => `${toLatex(X(x))} \\approx ${formatNumber(r.approx!.re, 12)}`)
            .join(",\\ ")
        : "\\text{tidak ditemukan akar pada interval}",
      operation: "brent",
      rule: {
        id: "brent",
        name: "Metode Brent (kombinasi bagi dua, secant, interpolasi kuadrat terbalik)",
      },
      reason: "Toleransi 1e-12; setiap akar memiliki residu |f(x)| yang dilaporkan pada tabel.",
    },
  ];
  const notes = [
    `Pencarian numerik dibatasi pada interval [${lo}, ${hi}]; akar di luar interval ini tidak akan ditemukan.`,
  ];
  if (search.truncated) notes.push("Terlalu banyak akar; hanya 40 akar pertama yang ditampilkan.");
  return {
    method: {
      name: "Metode numerik (pindai tanda + Brent)",
      description: "Aproksimasi akar real dengan toleransi 1e-12 pada interval terbatas.",
    },
    steps,
    roots,
    status: roots.length ? "solutions" : "none",
    numeric: true,
    notes,
    tables: [
      {
        caption: "Akar numerik",
        headers: ["x", "|f(x)|", "Iterasi", "Metode"],
        rows: search.roots.map((r) => [
          formatNumber(r.root, 14),
          r.residual.toExponential(2),
          String(r.iterations),
          r.method,
        ]),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Core dispatcher
// ---------------------------------------------------------------------------

export function solveCore(L: Expr, R: Expr, x: string, depth = 0): Attempt {
  if (depth > 6)
    throw new MathError(
      "limit-exceeded",
      "Persamaan terlalu kompleks (rekursi solver terlalu dalam).",
      { module: "equation" },
    );
  const f = sub(L, R);
  if (!containsSymbol(f, x)) {
    const zero = isSymbolicallyZero(f);
    const nonzero = !zero && isConstantExpr(f) && Math.abs(evalReal(f)) > 1e-12;
    return {
      method: { name: "Persamaan tanpa variabel", description: "Variabel hilang dari persamaan." },
      steps: [
        {
          title: zero ? "Kedua ruas identik" : "Kedua ruas tidak sama",
          before: eq(L, R),
          after: eq(f, ZERO),
          operation: zero ? "identity" : "contradiction",
          reason: zero
            ? "Persamaan benar untuk setiap nilai variabel."
            : nonzero
              ? "Persamaan tidak pernah benar."
              : "Persamaan tidak memuat variabel yang dicari.",
        },
      ],
      roots: [],
      status: zero ? "all" : "none",
    };
  }
  const rational = variableDenominators(f, x).length > 0 ? rationalAttempt(L, R, x, depth) : null;
  if (rational) return rational;
  const cs = polyCoefficients(f, x);
  if (cs) {
    if (cs.every((c) => c.type === "num")) {
      const P = new Poly(cs.map((c) => (c as { value: Rational }).value));
      return polynomialAttempt(L, R, P, x);
    }
    if (cs.length === 2) {
      const lin = linearAttempt(L, R, x);
      if (lin) return lin;
    }
    if (cs.length === 3) return symbolicQuadraticAttempt(L, R, cs, x);
  }
  if (countSymbol(L, x) + countSymbol(R, x) === 1) {
    const iso = isolationAttempt(L, R, x);
    if (iso) return iso;
  }
  const subst = substitutionAttempt(L, R, x, depth);
  if (subst) return subst;
  const rad = radicalAttempt(L, R, x, depth);
  if (rad) return rad;
  const expo = exponentialBothSidesAttempt(L, R, x, depth);
  if (expo) return expo;
  if (freeSymbols(f).size > 1) {
    throw new MathError(
      "unsupported",
      "Persamaan dengan parameter ini tidak dapat diselesaikan secara simbolik.",
      {
        module: "equation",
        cause: "Metode numerik membutuhkan semua parameter bernilai angka.",
        hint: "Substitusikan nilai parameter atau pilih variabel lain.",
      },
    );
  }
  return numericAttempt(L, R, x);
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

function periodicInstances(e: Expr, maxCount = 12): Expr[] {
  const out: Array<{ v: number; e: Expr }> = [];
  for (let k = -12; k <= 12; k++) {
    const inst = substituteSymbols(e, { [PERIOD_SYMBOL]: num(k) });
    const v = evalReal(inst);
    if (Number.isFinite(v) && v >= -1e-12 && v < 2 * Math.PI - 1e-12)
      out.push({ v, e: simplify(inst) });
  }
  out.sort((a, b) => a.v - b.v);
  return out.slice(0, maxCount).map((o) => o.e);
}

function verifyRoot(L: Expr, R: Expr, x: string, r: EqRoot): VerificationCheck {
  const label = r.expr ? toLatex(r.expr) : formatComplex(rootValue(r).re, rootValue(r).im);
  if (r.expr && !r.periodic) {
    try {
      const d = sub(substitute(L, X(x), r.expr), substitute(R, X(x), r.expr));
      if (isSymbolicallyZero(d)) {
        return {
          description: `Substitusi $${toLatex(X(x))} = ${label}$ ke persamaan awal`,
          latex: `${toLatex(substitute(L, X(x), r.expr))} = ${toLatex(substitute(R, X(x), r.expr))}`,
          passed: true,
          method: "Substitusi eksak (simbolik)",
        };
      }
    } catch {
      // fall through to numeric
    }
  }
  if (hasParameters(r) && r.expr) {
    const res = checkEquivalent(substitute(L, X(x), r.expr), substitute(R, X(x), r.expr));
    return {
      description: `Substitusi $${toLatex(X(x))} = ${label}$ ke persamaan awal`,
      passed: res.equivalent,
      method:
        res.method === "symbolic"
          ? "Substitusi simbolik"
          : "Substitusi numerik (parameter diambil acak)",
      detail: res.detail,
    };
  }
  const ks = r.periodic ? [0, 1, -1] : [0];
  let worst = 0;
  let valid = true;
  for (const k of ks) {
    const env: Record<string, number> = { [PERIOD_SYMBOL]: k };
    const v = r.expr ? evalComplex(r.expr, env) : { re: r.approx!.re, im: r.approx!.im };
    const envX = { ...env, [x]: v.re };
    const lv = Math.abs(v.im) > 1e-12 ? null : evalComplex(L, envX);
    const rv = Math.abs(v.im) > 1e-12 ? null : evalComplex(R, envX);
    if (lv && rv) {
      if (!Number.isFinite(lv.re) || !Number.isFinite(rv.re)) valid = false;
      const scale = Math.max(1, Math.hypot(lv.re, lv.im), Math.hypot(rv.re, rv.im));
      worst = Math.max(worst, Math.hypot(lv.re - rv.re, lv.im - rv.im) / scale);
    } else {
      // complex root of a polynomial: evaluate f at complex point via polynomial coefficients
      const cs = polyCoefficients(sub(L, R), x);
      if (!cs) {
        valid = false;
        continue;
      }
      let pr = 0;
      let pi = 0;
      for (let j = cs.length - 1; j >= 0; j--) {
        const c = evalReal(cs[j]);
        const nr = pr * v.re - pi * v.im + c;
        pi = pr * v.im + pi * v.re;
        pr = nr;
      }
      let scale = 1;
      for (let j = 0; j < cs.length; j++)
        scale = Math.max(scale, Math.abs(evalReal(cs[j])) * Math.pow(Math.hypot(v.re, v.im), j));
      worst = Math.max(worst, Math.hypot(pr, pi) / scale);
    }
  }
  const passed = valid && worst <= 1e-8;
  return {
    description: `Substitusi $${toLatex(X(x))} = ${label}$${r.periodic ? " (untuk k = 0, 1, −1)" : ""} ke persamaan awal`,
    passed,
    method: "Substitusi numerik",
    detail: valid
      ? `Selisih relatif ruas kiri dan kanan: ${worst.toExponential(2)} (toleransi 1e-8).`
      : "Ruas persamaan tidak terdefinisi pada nilai ini.",
  };
}

export interface EquationOptions {
  variable?: string;
  warnings?: string[];
}

export function solveEquation(input: string, node: SNode, options: EquationOptions = {}): Solution {
  if (node.k !== "rel" || node.ops.length !== 1 || node.ops[0] !== "=") {
    throw new MathError("internal", "solveEquation membutuhkan satu tanda '='.", {
      module: "equation",
    });
  }
  const L = toExpr(node.operands[0]);
  const R = toExpr(node.operands[1]);
  const vars = new Set([...freeSymbols(L), ...freeSymbols(R)]);
  const inputLatex = syntaxToLatex(node);
  const notes = [...(options.warnings ?? [])];
  if (vars.size === 0) {
    const d = sub(L, R);
    const truth = isSymbolicallyZero(d) || Math.abs(evalReal(d)) < 1e-12;
    const lv = evalReal(L);
    const rv = evalReal(R);
    return makeSolution({
      kind: "equation",
      title: "Pemeriksaan kesamaan",
      input,
      inputLatex,
      answers: [
        {
          label: "Pernyataan",
          latex: truth ? "\\text{Benar}" : "\\text{Salah}",
          text: truth ? "Benar" : "Salah",
          exact: true,
        },
      ],
      method: {
        name: "Evaluasi kedua ruas",
        description: "Kedua ruas dihitung secara eksak lalu dibandingkan.",
      },
      steps: [
        {
          title: "Hitung ruas kiri",
          after: toLatex(L),
          operation: "evaluate-left",
          reason: `≈ ${formatNumber(lv)}`,
        },
        {
          title: "Hitung ruas kanan",
          after: toLatex(R),
          operation: "evaluate-right",
          reason: `≈ ${formatNumber(rv)}`,
        },
        {
          title: truth ? "Kedua ruas sama" : "Kedua ruas berbeda",
          after: truth ? `${toLatex(L)} = ${toLatex(R)}` : `${toLatex(L)} \\ne ${toLatex(R)}`,
          operation: "compare",
          reason: truth ? "Selisih kedua ruas adalah 0." : "Selisih kedua ruas tidak 0.",
        },
      ],
      verification: aggregateVerification([
        {
          description: "Perbandingan numerik kedua ruas",
          passed: true,
          method: "Evaluasi numerik",
          detail: `${formatNumber(lv, 12)} vs ${formatNumber(rv, 12)}`,
        },
      ]),
      module: "equation",
      notes,
    });
  }
  const x = chooseVariable(vars, options.variable);
  if (vars.size > 1)
    notes.push(
      `Diselesaikan untuk ${x}; ${[...vars].filter((v) => v !== x).join(", ")} dianggap sebagai konstanta (parameter).`,
    );
  const attempt = solveCore(L, R, x);

  // Deduplicate roots
  const unique: EqRoot[] = [];
  for (const r of attempt.roots) {
    const v = rootValue(r);
    const dup = unique.find((u) => {
      if (r.expr && u.expr && exprKey(r.expr) === exprKey(u.expr)) return true;
      if (r.periodic || u.periodic) return false;
      const w = rootValue(u);
      return Math.hypot(v.re - w.re, v.im - w.im) <= 1e-9 * Math.max(1, Math.hypot(v.re, v.im));
    });
    if (dup) dup.multiplicity = (dup.multiplicity ?? 1) + (r.multiplicity ?? 1);
    else unique.push({ ...r });
  }
  const real = unique.filter(isRealRoot).sort((a, b) => rootValue(a).re - rootValue(b).re);
  const complex = unique.filter((r) => !isRealRoot(r));

  const answers: Answer[] = [];
  const checks: VerificationCheck[] = [];
  const hasFree = (r: EqRoot) =>
    !!r.expr && [...freeSymbols(r.expr)].some((v) => v !== PERIOD_SYMBOL);
  const fmtAnswer = (r: EqRoot, label: string): Answer => {
    if (r.expr) {
      const latex = toLatex(r.expr) + (r.periodic ? ",\\ k \\in \\mathbb{Z}" : "");
      const v = rootValue(r);
      const needsApprox =
        !r.periodic &&
        !hasFree(r) &&
        !(r.expr.type === "num" && r.expr.value.hasTerminatingDecimal());
      return {
        label,
        latex,
        text: toText(r.expr) + (r.periodic ? ", k ∈ ℤ" : ""),
        approx: needsApprox ? formatComplex(v.re, v.im) : undefined,
        exact: true,
      };
    }
    const v = r.approx!;
    return {
      label,
      latex: `\\approx ${formatComplex(v.re, v.im, 12)}`,
      text: `≈ ${formatComplex(v.re, v.im, 12)}`,
      exact: false,
    };
  };
  const sub_ = (i: number, n: number) =>
    n > 1 ? `${x}${String(i + 1).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)])}` : x;
  if (attempt.status === "all") {
    const excluded = attempt.excluded ?? [];
    answers.push({
      label: "Himpunan penyelesaian",
      latex: excluded.length
        ? `\\mathbb{R} \\setminus \\left\\{${excluded.map((e) => toLatex(e)).join(", ")}\\right\\}`
        : "\\mathbb{R}",
      text: excluded.length
        ? `semua bilangan real kecuali ${excluded.map((e) => toText(e)).join(", ")}`
        : "semua bilangan real",
      exact: true,
    });
  } else if (real.length === 0 && complex.length === 0) {
    answers.push({
      label: "Himpunan penyelesaian",
      latex: "\\varnothing",
      text: "∅ (tidak ada solusi real)",
      exact: true,
    });
  }
  const allListed = [...real, ...complex];
  allListed.forEach((r, i) => {
    const a = fmtAnswer(r, sub_(i, allListed.length));
    if (!isRealRoot(r)) a.label = `${a.label} (kompleks)`;
    if ((r.multiplicity ?? 1) > 1) a.label = `${a.label} (multiplisitas ${r.multiplicity})`;
    answers.push(a);
    checks.push(verifyRoot(L, R, x, r));
  });
  if (attempt.status === "solutions" && real.length === 0 && complex.length > 0) {
    answers.unshift({
      label: "Penyelesaian real",
      latex: "\\varnothing",
      text: "tidak ada penyelesaian real",
      exact: true,
    });
  }
  if (attempt.status === "all") {
    checks.push({
      description: "Selisih kedua ruas identik nol",
      passed: true,
      method: "Penyederhanaan simbolik",
    });
  }
  // periodic particular solutions
  const periodicRoots = real.filter((r) => r.periodic && r.expr && freeSymbols(r.expr).size <= 1);
  if (periodicRoots.length) {
    const inst = periodicRoots.flatMap((r) => periodicInstances(r.expr!));
    const uniq = inst
      .filter((e, i) => inst.findIndex((f) => Math.abs(evalReal(f) - evalReal(e)) < 1e-9) === i)
      .sort((a, b) => evalReal(a) - evalReal(b));
    if (uniq.length) {
      answers.push({
        label: "Solusi pada [0, 2π)",
        latex: uniq.map((e) => toLatex(e)).join(",\\ "),
        text: uniq.map((e) => toText(e)).join(", "),
        exact: true,
        approx: uniq.map((e) => formatNumber(evalReal(e), 8)).join(", "),
      });
    }
  }
  for (const rj of attempt.rejected ?? []) {
    notes.push(
      `Kandidat ${rj.root.expr ? toText(rj.root.expr) : formatNumber(rootValue(rj.root).re)} ditolak karena ${rj.reason}.`,
    );
  }
  if (attempt.numeric) notes.push("Hasil bertanda ≈ adalah aproksimasi numerik.");
  notes.push(...(attempt.notes ?? []));

  // Plot: both sides with real intersections
  const vset = new Set([...freeSymbols(L), ...freeSymbols(R)]);
  let plot: Solution["plot"];
  if (vset.size === 1) {
    const pts = real
      .filter((r) => !r.periodic)
      .map((r) => {
        const v = rootValue(r).re;
        return { x: v, y: evalReal(L, { [x]: v }), label: `${x} = ${formatNumber(v, 6)}` };
      })
      .filter((p) => Number.isFinite(p.y));
    const xsVals = pts.map((p) => p.x);
    const span = xsVals.length ? [Math.min(...xsVals), Math.max(...xsVals)] : [-5, 5];
    const pad = Math.max(2, (span[1] - span[0]) * 0.5);
    plot = {
      kind: "function",
      variable: x,
      functions: [
        { expr: toText(L), label: `y = ${toText(L)}` },
        { expr: toText(R), label: `y = ${toText(R)}` },
      ],
      points: pts,
      xRange: [span[0] - pad, span[1] + pad],
    };
  }

  const verification = aggregateVerification(
    checks,
    attempt.status === "none"
      ? "Tidak ada kandidat solusi yang perlu diverifikasi; kesimpulan 'tidak ada solusi' berasal dari langkah-langkah di atas."
      : undefined,
  );
  if (verification.status === "failed" || verification.status === "partial") {
    notes.push(
      "PERINGATAN: sebagian hasil gagal diverifikasi dengan substitusi. Hasil yang gagal tidak boleh dianggap benar.",
    );
  }
  return makeSolution({
    kind: "equation",
    title: attempt.method.name.startsWith("Persamaan")
      ? attempt.method.name
      : `Persamaan — ${attempt.method.name}`,
    input,
    inputLatex,
    answers,
    method: attempt.method,
    steps: attempt.steps,
    verification,
    module: "equation",
    assumptions: [
      "Variabel bernilai real kecuali dinyatakan lain.",
      ...(attempt.assumptions ?? []),
    ],
    notes,
    alternatives: attempt.alternatives,
    plot,
    tables: attempt.tables,
    references: [REFERENCES.openstaxAlgebra, ...(attempt.numeric ? [REFERENCES.burdenFaires] : [])],
  });
}

export { DEFAULT_DIGITS };
