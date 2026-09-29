/**
 * Symbolic integration with steps.
 *
 * Method selector (in order): constant, linearity, table of basic antiderivatives,
 * rational functions (long division + partial fractions), trigonometric identities
 * (power reduction, odd powers), u-substitution (derivative-divides), integration by
 * parts (LIATE, repeated), cyclic integrals e^{ax} sin/cos(bx). Returns null when no
 * method applies; callers must then say so honestly (and may integrate numerically).
 *
 * References: OpenStax Calculus Volume 2, chapters "Integration" and "Techniques of
 * Integration"; J. R. Slagle's derivative-divides heuristic (SAINT, 1961).
 */
import { tick } from "../core/budget";
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { expand, together } from "../expr/expand";
import { Poly, toPoly } from "../expr/polynomial";
import { toLatex } from "../expr/print";
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
  ONE,
  ZERO,
  HALF,
  MINUS_ONE,
  E,
  frac,
  sqrt,
} from "../expr/simplify";
import { containsSymbol, exprKey, exprSize, rawSym, type Expr } from "../expr/types";
import { RMatrix } from "../linalg/matrix";
import type { Step } from "../steps/types";
import { differentiate } from "./derivative";

export interface IntResult {
  value: Expr;
  step: Step;
}

const intL = (e: Expr, x: string) => `\\int ${wrapInt(e)} \\, d${toLatex(rawSym(x))}`;
function wrapInt(e: Expr): string {
  return e.type === "add" ? `\\left(${toLatex(e)}\\right)` : toLatex(e);
}

function isX(e: Expr, x: string): boolean {
  return e.type === "sym" && e.name === x;
}

function mk(
  e: Expr,
  x: string,
  value: Expr,
  title: string,
  rule: Step["rule"],
  reason: string,
  substeps?: Step[],
  extra: Partial<Step> = {},
): IntResult {
  return {
    value,
    step: {
      title,
      before: intL(e, x),
      after: toLatex(value),
      operation: `int-${rule?.id ?? "rule"}`,
      rule,
      reason,
      substeps,
      ...extra,
    },
  };
}

// ---------------------------------------------------------------------------
// Table of basic antiderivatives (argument exactly x)
// ---------------------------------------------------------------------------

function table(e: Expr, x: string): IntResult | null {
  const X = rawSym(x);
  if (isX(e, x))
    return mk(
      e,
      x,
      mul(HALF, pow(X, num(2))),
      "Aturan pangkat",
      {
        id: "power",
        name: "Aturan pangkat integral",
        formula: "\\int x^{n}dx = \\frac{x^{n+1}}{n+1} + C,\\ n \\ne -1",
      },
      "x = x¹, naikkan pangkat menjadi 2 lalu bagi dengan 2.",
    );
  if (e.type === "pow" && isX(e.base, x) && !containsSymbol(e.exp, x)) {
    if (e.exp.type === "num" && e.exp.value.isMinusOne()) {
      return mk(
        e,
        x,
        fn("ln", fn("abs", X)),
        "Integral 1/x",
        { id: "reciprocal", name: "Integral 1/x", formula: "\\int \\frac{1}{x}dx = \\ln|x| + C" },
        "Kasus khusus n = −1 pada aturan pangkat menghasilkan logaritma natural.",
      );
    }
    const n1 = add(e.exp, ONE);
    return mk(
      e,
      x,
      div(pow(X, n1), n1),
      "Aturan pangkat",
      {
        id: "power",
        name: "Aturan pangkat integral",
        formula: "\\int x^{n}dx = \\frac{x^{n+1}}{n+1} + C,\\ n \\ne -1",
      },
      `Naikkan pangkat ${toLatex(e.exp)} menjadi ${toLatex(n1)} lalu bagi dengan pangkat baru.`,
    );
  }
  if (e.type === "pow" && !containsSymbol(e.base, x) && isX(e.exp, x)) {
    const isE = e.base.type === "sym" && e.base.name === "e";
    return mk(
      e,
      x,
      isE ? e : div(e, fn("ln", e.base)),
      isE ? "Integral eˣ" : "Integral aˣ",
      {
        id: isE ? "exp" : "exp-base",
        name: isE ? "Integral eˣ" : "Integral aˣ",
        formula: isE ? "\\int e^{x}dx = e^{x} + C" : "\\int a^{x}dx = \\frac{a^{x}}{\\ln a} + C",
      },
      isE
        ? "eˣ adalah antiturunan dirinya sendiri."
        : "Kebalikan dari aturan turunan aˣ = aˣ ln a.",
    );
  }
  if (e.type === "fn" && e.args.length === 1 && isX(e.args[0], x)) {
    const T: Record<string, [Expr, string, string]> = {
      sin: [neg(fn("cos", X)), "\\int \\sin x\\,dx = -\\cos x + C", "Integral sinus"],
      cos: [fn("sin", X), "\\int \\cos x\\,dx = \\sin x + C", "Integral kosinus"],
      tan: [
        neg(fn("ln", fn("abs", fn("cos", X)))),
        "\\int \\tan x\\,dx = -\\ln|\\cos x| + C",
        "Integral tangen",
      ],
      cot: [
        fn("ln", fn("abs", fn("sin", X))),
        "\\int \\cot x\\,dx = \\ln|\\sin x| + C",
        "Integral kotangen",
      ],
      sec: [
        fn("ln", fn("abs", add(fn("sec", X), fn("tan", X)))),
        "\\int \\sec x\\,dx = \\ln|\\sec x + \\tan x| + C",
        "Integral sekan",
      ],
      csc: [
        neg(fn("ln", fn("abs", add(fn("csc", X), fn("cot", X))))),
        "\\int \\csc x\\,dx = -\\ln|\\csc x + \\cot x| + C",
        "Integral kosekan",
      ],
      sinh: [fn("cosh", X), "\\int \\sinh x\\,dx = \\cosh x + C", "Integral sinh"],
      cosh: [fn("sinh", X), "\\int \\cosh x\\,dx = \\sinh x + C", "Integral cosh"],
      tanh: [fn("ln", fn("cosh", X)), "\\int \\tanh x\\,dx = \\ln(\\cosh x) + C", "Integral tanh"],
    };
    const t = T[e.name];
    if (t)
      return mk(
        e,
        x,
        t[0],
        t[2],
        { id: `table-${e.name}`, name: t[2], formula: t[1] },
        "Rumus dasar tabel integral.",
      );
  }
  // sec^2, csc^2, sec*tan, csc*cot
  if (
    e.type === "pow" &&
    e.exp.type === "num" &&
    e.exp.value.equals(Rational.TWO) &&
    e.base.type === "fn" &&
    isX(e.base.args[0] ?? ZERO, x)
  ) {
    if (e.base.name === "sec")
      return mk(
        e,
        x,
        fn("tan", X),
        "Integral sec²",
        { id: "sec2", name: "Integral sec²x", formula: "\\int \\sec^2 x\\,dx = \\tan x + C" },
        "Karena (tan x)' = sec² x.",
      );
    if (e.base.name === "csc")
      return mk(
        e,
        x,
        neg(fn("cot", X)),
        "Integral csc²",
        { id: "csc2", name: "Integral csc²x", formula: "\\int \\csc^2 x\\,dx = -\\cot x + C" },
        "Karena (cot x)' = −csc² x.",
      );
    if (e.base.name === "sech")
      return mk(
        e,
        x,
        fn("tanh", X),
        "Integral sech²",
        {
          id: "sech2",
          name: "Integral sech²x",
          formula: "\\int \\operatorname{sech}^2 x\\,dx = \\tanh x + C",
        },
        "Karena (tanh x)' = sech² x.",
      );
  }
  if (
    e.type === "mul" &&
    e.factors.length === 2 &&
    e.factors.every((f) => f.type === "fn" && isX(f.args[0], x))
  ) {
    const names = e.factors
      .map((f) => (f as { name: string }).name)
      .sort()
      .join(",");
    if (names === "sec,tan")
      return mk(
        e,
        x,
        fn("sec", X),
        "Integral sec·tan",
        {
          id: "sectan",
          name: "Integral sec x tan x",
          formula: "\\int \\sec x\\tan x\\,dx = \\sec x + C",
        },
        "Karena (sec x)' = sec x tan x.",
      );
    if (names === "cot,csc")
      return mk(
        e,
        x,
        neg(fn("csc", X)),
        "Integral csc·cot",
        {
          id: "csccot",
          name: "Integral csc x cot x",
          formula: "\\int \\csc x\\cot x\\,dx = -\\csc x + C",
        },
        "Karena (csc x)' = −csc x cot x.",
      );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Forms a^2 ± x^2 (arctan / arcsin)
// ---------------------------------------------------------------------------

function quadraticRootForms(e: Expr, x: string): IntResult | null {
  // 1/(a x^2 + c), 1/sqrt(c - a x^2), sqrt(c - a x^2), 1/sqrt(a x^2 + c)
  if (e.type !== "pow" || e.exp.type !== "num") return null;
  const p = toPoly(e.base, x);
  if (!p || p.degree !== 2 || !p.coeff(1).isZero()) return null;
  const a = p.coeff(2);
  const c = p.coeff(0);
  const X = rawSym(x);
  const k = e.exp.value;
  if (k.isMinusOne() && a.isPositive() && c.isPositive()) {
    // 1/(a x^2 + c) = (1/sqrt(ac)) atan(x sqrt(a/c))
    const value = mul(
      pow(num(a.mul(c)), num(Rational.of(-1, 2))),
      fn("atan", mul(X, pow(num(a.div(c)), HALF))),
    );
    return mk(
      e,
      x,
      value,
      "Bentuk arctan",
      {
        id: "atan-form",
        name: "Integral bentuk 1/(a²+x²)",
        formula: "\\int \\frac{dx}{a^2 + x^2} = \\frac{1}{a}\\arctan\\frac{x}{a} + C",
      },
      "Penyebut berbentuk jumlah kuadrat.",
    );
  }
  if (k.equals(Rational.of(-1, 2)) && a.isNegative() && c.isPositive()) {
    const value = mul(
      pow(num(a.neg()), num(Rational.of(-1, 2))),
      fn("asin", mul(X, pow(num(a.neg().div(c)), HALF))),
    );
    return mk(
      e,
      x,
      value,
      "Bentuk arcsin",
      {
        id: "asin-form",
        name: "Integral bentuk 1/√(a²−x²)",
        formula: "\\int \\frac{dx}{\\sqrt{a^2 - x^2}} = \\arcsin\\frac{x}{a} + C",
      },
      "Bentuk √(a² − x²) di penyebut (substitusi trigonometri x = a sin θ).",
    );
  }
  if (k.equals(Rational.of(-1, 2)) && a.isPositive()) {
    // 1/sqrt(a x^2 + c) = (1/sqrt(a)) ln|sqrt(a) x + sqrt(a x^2 + c)|
    const value = mul(
      pow(num(a), num(Rational.of(-1, 2))),
      fn("ln", fn("abs", add(mul(pow(num(a), HALF), X), pow(e.base, HALF)))),
    );
    return mk(
      e,
      x,
      value,
      "Bentuk logaritma (substitusi hiperbolik)",
      {
        id: "asinh-form",
        name: "Integral bentuk 1/√(x²±a²)",
        formula:
          "\\int \\frac{dx}{\\sqrt{x^2 \\pm a^2}} = \\ln\\left|x + \\sqrt{x^2 \\pm a^2}\\right| + C",
      },
      "Substitusi x = a sinh t / a cosh t.",
    );
  }
  if (k.equals(HALF.value) && a.isNegative() && c.isPositive()) {
    // sqrt(c - b x^2), b = -a: (x/2) sqrt(c - b x^2) + c/(2 sqrt(b)) asin(x sqrt(b/c))
    const b = a.neg();
    const value = add(
      mul(HALF, X, e),
      mul(
        num(c.div(Rational.TWO)),
        pow(num(b), num(Rational.of(-1, 2))),
        fn("asin", mul(X, pow(num(b.div(c)), HALF))),
      ),
    );
    return mk(
      e,
      x,
      value,
      "Substitusi trigonometri",
      {
        id: "sqrt-a2-x2",
        name: "Integral √(a²−x²)",
        formula:
          "\\int \\sqrt{a^2 - x^2}\\,dx = \\frac{x}{2}\\sqrt{a^2 - x^2} + \\frac{a^2}{2}\\arcsin\\frac{x}{a} + C",
      },
      "Substitusi x = a sin θ mengubah akar menjadi a cos θ.",
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rational functions: partial fractions
// ---------------------------------------------------------------------------

interface PFTerm {
  kind: "linear" | "quadratic";
  root?: Rational;
  power: number;
  quad?: Poly;
  A?: Rational;
  B?: Rational;
  C?: Rational;
}

function partialFractions(P: Poly, Q: Poly): { terms: PFTerm[]; quadError: boolean } | null {
  const lead = Q.lead();
  const Qm = Q.scale(lead.inv());
  const Pm = P.scale(lead.inv());
  const { roots, rest } = Qm.rationalRoots();
  const factors: Array<{
    poly: Poly;
    power: number;
    kind: "linear" | "quadratic";
    root?: Rational;
  }> = [];
  const counts = new Map<string, { r: Rational; m: number }>();
  for (const r of roots) {
    const k = r.toString();
    const c = counts.get(k);
    if (c) c.m++;
    else counts.set(k, { r, m: 1 });
  }
  for (const { r, m } of counts.values())
    factors.push({
      poly: Poly.fromNumbers([r.neg(), Rational.ONE]),
      power: m,
      kind: "linear",
      root: r,
    });
  if (rest.degree > 0) {
    const restMonic = rest.monic();
    if (restMonic.degree === 2) factors.push({ poly: restMonic, power: 1, kind: "quadratic" });
    else if (restMonic.degree === 4) {
      // try (x^2 + a)^2 or product of two quadratics with a square-free check
      const sf = restMonic.squareFree();
      if (sf.length === 1 && sf[0].multiplicity === 2 && sf[0].factor.degree === 2)
        factors.push({ poly: sf[0].factor, power: 2, kind: "quadratic" });
      else return null;
    } else return null;
  }
  // unknowns
  const basis: Poly[] = [];
  const terms: PFTerm[] = [];
  for (const f of factors) {
    for (let k = 1; k <= f.power; k++) {
      const others = Qm.divmod(f.poly.pow(k)).q;
      if (f.kind === "linear") {
        basis.push(others);
        terms.push({ kind: "linear", root: f.root, power: k });
      } else {
        basis.push(others.mul(Poly.fromNumbers([0, 1])));
        basis.push(others);
        terms.push({ kind: "quadratic", quad: f.poly, power: k });
      }
    }
  }
  const n = Qm.degree;
  if (basis.length !== n) return null;
  const rows: Rational[][] = [];
  for (let d = 0; d < n; d++) rows.push([...basis.map((b) => b.coeff(d)), Pm.coeff(d)]);
  const aug = new RMatrix(rows);
  const res = aug.rref({ pivotCols: n });
  if (res.rank < n) return null;
  const sol = res.matrix.data.map((r) => r[n]);
  let idx = 0;
  for (const t of terms) {
    if (t.kind === "linear") t.A = sol[idx++];
    else {
      t.B = sol[idx++];
      t.C = sol[idx++];
    }
  }
  return { terms, quadError: false };
}

function integratePartialTerm(t: PFTerm, x: string): Expr {
  const X = rawSym(x);
  if (t.kind === "linear") {
    const lin = sub(X, num(t.root!));
    if (t.power === 1) return mul(num(t.A!), fn("ln", fn("abs", lin)));
    return mul(num(t.A!.div(Rational.of(1 - t.power))), pow(lin, num(1 - t.power)));
  }
  const q = t.quad!;
  const p = q.coeff(1);
  const qq = q.coeff(0);
  const B = t.B!;
  const C = t.C!;
  const quadExpr = q.toExpr(x);
  const disc = Rational.of(4).mul(qq).sub(p.mul(p)); // 4q - p^2
  const linearPart = C.sub(B.mul(p).div(Rational.TWO));
  if (t.power !== 1) {
    throw new MathError(
      "unsupported",
      "Pecahan parsial dengan faktor kuadrat berulang belum didukung.",
      { module: "integral" },
    );
  }
  const logPart = mul(num(B.div(Rational.TWO)), fn("ln", fn("abs", quadExpr)));
  if (linearPart.isZero()) return logPart;
  if (disc.isPositive()) {
    const s = pow(num(disc), HALF);
    return add(
      logPart,
      mul(
        num(linearPart),
        num(Rational.TWO),
        pow(s, MINUS_ONE),
        fn("atan", div(add(mul(num(2), X), num(p)), s)),
      ),
    );
  }
  // real distinct irrational roots: D' = p^2 - 4q > 0
  const s = pow(num(disc.neg()), HALF);
  const twoXp = add(mul(num(2), X), num(p));
  return add(
    logPart,
    mul(num(linearPart), pow(s, MINUS_ONE), fn("ln", fn("abs", div(sub(twoXp, s), add(twoXp, s))))),
  );
}

function rationalFunction(e: Expr, x: string): IntResult | null {
  const { numer, denom } = together(e);
  const Q = toPoly(expand(denom), x);
  const P = toPoly(expand(numer), x);
  if (!P || !Q || Q.degree < 1) return null;
  const steps: Step[] = [];
  const X = rawSym(x);
  let polyPart = Poly.ZERO;
  let R = P;
  if (P.degree >= Q.degree) {
    const d = P.divmod(Q);
    polyPart = d.q;
    R = d.r;
    steps.push({
      title: "Pembagian polinomial (derajat pembilang ≥ derajat penyebut)",
      after: `${toLatex(polyPart.toExpr(x))} + \\frac{${toLatex(R.toExpr(x))}}{${toLatex(Q.toExpr(x))}}`,
      operation: "long-division",
      rule: { id: "long-division", name: "Pembagian bersusun polinomial" },
      reason:
        "Pecahan rasional sejati (derajat pembilang < derajat penyebut) diperlukan untuk pecahan parsial.",
    });
  }
  let restValue: Expr = ZERO;
  if (!R.isZero()) {
    if (Q.degree === 1) {
      const a = Q.coeff(1);
      const b = Q.coeff(0);
      restValue = mul(num(R.coeff(0).div(a)), fn("ln", fn("abs", add(X, num(b.div(a))))));
      steps.push({
        title: "Integral bentuk c/(ax + b)",
        after: toLatex(restValue),
        operation: "linear-denominator",
        rule: {
          id: "reciprocal-linear",
          name: "Integral 1/(ax+b)",
          formula: "\\int \\frac{c}{ax + b}dx = \\frac{c}{a}\\ln|ax + b| + C",
        },
        reason: "Substitusi u = ax + b.",
      });
    } else {
      const pf = partialFractions(R, Q);
      if (!pf) return null;
      const decomp = pf.terms.map((t) => {
        if (t.kind === "linear")
          return `\\frac{${toLatex(num(t.A!))}}{${t.power === 1 ? toLatex(sub(X, num(t.root!))) : `\\left(${toLatex(sub(X, num(t.root!)))}\\right)^{${t.power}}`}}`;
        return `\\frac{${toLatex(add(mul(num(t.B!), X), num(t.C!)))}}{${toLatex(t.quad!.toExpr(x))}}`;
      });
      steps.push({
        title: "Uraikan menjadi pecahan parsial",
        before: `\\frac{${toLatex(R.toExpr(x))}}{${toLatex(Q.toExpr(x))}}`,
        after: decomp.join(" + ").replace(/\+ \\frac\{-/g, "- \\frac{"),
        operation: "partial-fractions",
        rule: {
          id: "partial-fractions",
          name: "Dekomposisi pecahan parsial",
          formula: "\\frac{P(x)}{(x-a)(x-b)} = \\frac{A}{x-a} + \\frac{B}{x-b}",
        },
        reason:
          "Koefisien A, B, … diperoleh dengan menyamakan koefisien kedua ruas (sistem persamaan linear diselesaikan secara eksak).",
      });
      const parts = pf.terms.map((t) => integratePartialTerm(t, x));
      restValue = add(...parts);
      steps.push({
        title: "Integralkan setiap pecahan parsial",
        after: toLatex(restValue),
        operation: "integrate-partials",
        rule: {
          id: "partial-integrals",
          name: "Integral pecahan parsial",
          formula:
            "\\int \\frac{A}{x-a}dx = A\\ln|x-a|,\\quad \\int \\frac{Bx + C}{x^2 + px + q}dx = \\frac{B}{2}\\ln|x^2+px+q| + \\ldots\\arctan\\ldots",
        },
        reason: "Setiap suku memiliki antiturunan standar (logaritma, pangkat, atau arctan).",
      });
    }
  }
  const polyInt = new Poly([
    Rational.ZERO,
    ...polyPart.coeffs.map((c, k) => c.div(Rational.of(k + 1))),
  ]).toExpr(x);
  if (!polyPart.isZero())
    steps.push({
      title: "Integralkan bagian polinomial",
      after: toLatex(polyInt),
      operation: "integrate-polynomial",
      rule: { id: "power", name: "Aturan pangkat integral" },
      reason: "Gunakan aturan pangkat pada setiap suku.",
    });
  const value = add(polyInt, restValue);
  return {
    value,
    step: {
      title: "Integral fungsi rasional",
      before: intL(e, x),
      after: toLatex(value),
      operation: "int-rational",
      rule: {
        id: "rational",
        name: "Integral fungsi rasional",
        formula: "\\int \\frac{P(x)}{Q(x)}dx",
      },
      reason: "Fungsi rasional diintegralkan melalui pembagian polinomial dan pecahan parsial.",
      substeps: steps,
    },
  };
}

// ---------------------------------------------------------------------------
// Trigonometric identities
// ---------------------------------------------------------------------------

function trigRewrite(
  e: Expr,
  x: string,
): { rewritten: Expr; title: string; rule: Step["rule"] } | null {
  // sin^2(u), cos^2(u), tan^2(u), sin(u)cos(u), odd powers
  if (
    e.type === "pow" &&
    e.exp.type === "num" &&
    e.exp.value.isInteger() &&
    e.base.type === "fn" &&
    containsSymbol(e.base, x)
  ) {
    const n = Number(e.exp.value.num);
    const u = e.base.args[0];
    if (n === 2 && e.base.name === "sin")
      return {
        rewritten: mul(HALF, sub(ONE, fn("cos", mul(num(2), u)))),
        title: "Gunakan identitas penurunan pangkat",
        rule: {
          id: "power-reduction",
          name: "Identitas penurunan pangkat",
          formula: "\\sin^2 u = \\frac{1 - \\cos 2u}{2}",
        },
      };
    if (n === 2 && e.base.name === "cos")
      return {
        rewritten: mul(HALF, add(ONE, fn("cos", mul(num(2), u)))),
        title: "Gunakan identitas penurunan pangkat",
        rule: {
          id: "power-reduction",
          name: "Identitas penurunan pangkat",
          formula: "\\cos^2 u = \\frac{1 + \\cos 2u}{2}",
        },
      };
    if (n === 2 && e.base.name === "tan")
      return {
        rewritten: sub(pow(fn("sec", u), num(2)), ONE),
        title: "Gunakan identitas Pythagoras",
        rule: {
          id: "pythagoras",
          name: "Identitas Pythagoras",
          formula: "\\tan^2 u = \\sec^2 u - 1",
        },
      };
    if (n === 2 && e.base.name === "cot")
      return {
        rewritten: sub(pow(fn("csc", u), num(2)), ONE),
        title: "Gunakan identitas Pythagoras",
        rule: {
          id: "pythagoras",
          name: "Identitas Pythagoras",
          formula: "\\cot^2 u = \\csc^2 u - 1",
        },
      };
    if (n >= 3 && n % 2 === 1 && (e.base.name === "sin" || e.base.name === "cos")) {
      const other = e.base.name === "sin" ? "cos" : "sin";
      const k = (n - 1) / 2;
      return {
        rewritten: expand(mul(e.base, pow(sub(ONE, pow(fn(other, u), num(2))), num(k)))),
        title: "Pisahkan satu faktor dan gunakan identitas Pythagoras",
        rule: {
          id: "odd-power",
          name: "Pangkat ganjil sinus/kosinus",
          formula: "\\sin^{2k+1}u = \\sin u\\,(1 - \\cos^2 u)^k",
        },
      };
    }
    if (n >= 4 && n % 2 === 0 && (e.base.name === "sin" || e.base.name === "cos")) {
      const half = pow(fn(e.base.name, u), num(2));
      const red =
        e.base.name === "sin"
          ? mul(HALF, sub(ONE, fn("cos", mul(num(2), u))))
          : mul(HALF, add(ONE, fn("cos", mul(num(2), u))));
      return {
        rewritten: expand(pow(red, num(n / 2))),
        title: "Gunakan identitas penurunan pangkat berulang",
        rule: {
          id: "power-reduction",
          name: "Identitas penurunan pangkat",
          formula: "\\sin^2 u = \\frac{1 - \\cos 2u}{2},\\ \\cos^2 u = \\frac{1 + \\cos 2u}{2}",
        },
      };
      void half;
    }
  }
  if (e.type === "mul") {
    const trig = e.factors.filter(
      (f) => f.type === "fn" && (f.name === "sin" || f.name === "cos") && containsSymbol(f, x),
    );
    const rest = e.factors.filter((f) => !trig.includes(f));
    if (trig.length === 2 && rest.every((f) => !containsSymbol(f, x))) {
      const [a, b] = trig as Array<Expr & { type: "fn" }>;
      const s = a.name === "sin" ? a : b;
      const c = a.name === "sin" ? b : a;
      if (s.name === "sin" && c.name === "cos") {
        const A = s.args[0];
        const B = c.args[0];
        if (exprKey(A) !== exprKey(B)) {
          // sin A cos B = 1/2 [sin(A+B) + sin(A-B)]
          return {
            rewritten: mul(...rest, HALF, add(fn("sin", add(A, B)), fn("sin", sub(A, B)))),
            title: "Gunakan rumus perkalian ke penjumlahan",
            rule: {
              id: "product-to-sum",
              name: "Rumus perkalian ke jumlah",
              formula: "\\sin A \\cos B = \\tfrac{1}{2}[\\sin(A+B) + \\sin(A-B)]",
            },
          };
        }
      }
      if (a.name === b.name && exprKey(a.args[0]) !== exprKey(b.args[0])) {
        const A = a.args[0];
        const B = b.args[0];
        if (a.name === "sin")
          return {
            rewritten: mul(...rest, HALF, sub(fn("cos", sub(A, B)), fn("cos", add(A, B)))),
            title: "Gunakan rumus perkalian ke penjumlahan",
            rule: {
              id: "product-to-sum",
              name: "Rumus perkalian ke jumlah",
              formula: "\\sin A \\sin B = \\tfrac{1}{2}[\\cos(A-B) - \\cos(A+B)]",
            },
          };
        return {
          rewritten: mul(...rest, HALF, add(fn("cos", sub(A, B)), fn("cos", add(A, B)))),
          title: "Gunakan rumus perkalian ke penjumlahan",
          rule: {
            id: "product-to-sum",
            name: "Rumus perkalian ke jumlah",
            formula: "\\cos A \\cos B = \\tfrac{1}{2}[\\cos(A-B) + \\cos(A+B)]",
          },
        };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// u-substitution (derivative-divides)
// ---------------------------------------------------------------------------

function substitutionCandidates(e: Expr, x: string): Expr[] {
  const out: Expr[] = [];
  const seen = new Set<string>();
  const push = (c: Expr) => {
    if (!containsSymbol(c, x) || isX(c, x) || c.type === "num") return;
    const k = exprKey(c);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  };
  const visit = (t: Expr) => {
    if (t.type === "fn") {
      t.args.forEach(push);
      push(t);
    }
    if (t.type === "pow") {
      push(t.base);
      push(t.exp);
      if (t.exp.type === "num" && t.exp.value.isInteger() && t.exp.value.isPositive()) push(t);
    }
    const kids =
      t.type === "add"
        ? t.terms
        : t.type === "mul"
          ? t.factors
          : t.type === "pow"
            ? [t.base, t.exp]
            : t.type === "fn"
              ? t.args
              : [];
    kids.forEach(visit);
  };
  visit(e);
  return out.sort((a, b) => exprSize(b) - exprSize(a));
}

function uSubstitution(e: Expr, x: string, depth: number): IntResult | null {
  const U = rawSym(x === "u" ? "w" : "u");
  for (const u of substitutionCandidates(e, x)) {
    tick("u-substitution");
    let du: Expr;
    try {
      du = differentiate(u, x).value;
    } catch {
      continue;
    }
    if (du.type === "num" && du.value.isZero()) continue;
    let q: Expr;
    try {
      q = div(e, du);
      q = substitute(q, u, U);
      if (containsSymbol(q, x)) {
        // try with expanded / combined forms
        const q2 = substitute(expand(div(e, du)), u, U);
        if (containsSymbol(q2, x)) continue;
        q = q2;
      }
    } catch {
      continue;
    }
    const inner = integrate(q, U.name, depth + 1);
    if (!inner) continue;
    const value = substitute(inner.value, U, u);
    const isLinear = du.type === "num";
    return {
      value,
      step: {
        title: isLinear
          ? `Substitusi linear $u = ${toLatex(u)}$`
          : `Substitusi $u = ${toLatex(u)}$`,
        before: intL(e, x),
        after: toLatex(value),
        operation: "int-u-substitution",
        rule: {
          id: "u-substitution",
          name: "Integral substitusi",
          formula: "\\int f(g(x))\\,g'(x)\\,dx = \\int f(u)\\,du,\\ u = g(x)",
        },
        reason: isLinear
          ? `$du = ${toLatex(du)}\\,dx$ sehingga $dx = du / ${toLatex(du)}$.`
          : `$du = ${toLatex(du)}\\,dx$ muncul (sebagai faktor) di integran.`,
        substeps: [
          {
            title: "Tentukan u dan du",
            after: `u = ${toLatex(u)},\\quad du = ${toLatex(du)}\\,d${toLatex(rawSym(x))}`,
            operation: "define-u",
            reason: "Pilih u sehingga turunannya muncul di integran.",
          },
          {
            title: "Tulis ulang integral dalam u",
            after: intL(q, U.name),
            operation: "rewrite-in-u",
            reason: "Semua bagian integran dinyatakan dalam u.",
          },
          inner.step,
          {
            title: "Kembalikan ke variabel semula",
            after: toLatex(value),
            operation: "back-substitute",
            reason: `Ganti u dengan $${toLatex(u)}$.`,
          },
        ],
      },
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Integration by parts
// ---------------------------------------------------------------------------

function liateRank(f: Expr, x: string): number {
  // L I A T E : lower rank = choose as u first
  if (f.type === "fn" && (f.name === "ln" || f.name === "log")) return 0;
  if (
    f.type === "fn" &&
    ["asin", "acos", "atan", "acot", "asinh", "acosh", "atanh"].includes(f.name)
  )
    return 1;
  if (isX(f, x) || (f.type === "pow" && isX(f.base, x) && f.exp.type === "num")) return 2;
  if (f.type === "fn" && ["sin", "cos", "sinh", "cosh"].includes(f.name)) return 3;
  if (f.type === "pow" && !containsSymbol(f.base, x)) return 4;
  return 5;
}

function byParts(e: Expr, x: string, depth: number): IntResult | null {
  if (depth > 8) return null;
  const X = rawSym(x);
  const factors = e.type === "mul" ? e.factors : [e];
  const c = factors.filter((f) => !containsSymbol(f, x));
  const xf = factors.filter((f) => containsSymbol(f, x));
  if (xf.length === 0 || xf.length > 2) return null;
  let u: Expr;
  let dv: Expr;
  if (xf.length === 1) {
    const f = xf[0];
    if (!(f.type === "fn" && ["ln", "log", "asin", "acos", "atan", "acot"].includes(f.name)))
      return null;
    u = f;
    dv = ONE;
  } else {
    const [a, b] = xf.sort((p, q) => liateRank(p, x) - liateRank(q, x));
    if (liateRank(a, x) > 2) return null;
    u = a;
    dv = b;
  }
  const v = integrate(dv, x, depth + 1);
  if (!v) return null;
  const du = differentiate(u, x).value;
  const remaining = mul(v.value, du);
  const inner = integrate(remaining, x, depth + 1);
  if (!inner) return null;
  const coef = c.length ? mul(...c) : ONE;
  const value = mul(coef, sub(mul(u, v.value), inner.value));
  return {
    value,
    step: {
      title: "Integral parsial",
      before: intL(e, x),
      after: toLatex(value),
      operation: "int-by-parts",
      rule: {
        id: "by-parts",
        name: "Integral parsial",
        formula: "\\int u\\,dv = uv - \\int v\\,du",
      },
      reason: `Pilih u = $${toLatex(u)}$ (urutan LIATE: Logaritma, Invers trigonometri, Aljabar, Trigonometri, Eksponensial) dan dv = $${toLatex(dv)}\\,dx$.`,
      substeps: [
        {
          title: "Tentukan u, du, dv, v",
          after: `u = ${toLatex(u)},\\ du = ${toLatex(du)}\\,d${x},\\quad dv = ${toLatex(dv)}\\,d${x},\\ v = ${toLatex(v.value)}`,
          operation: "choose-parts",
          reason: "u diturunkan, dv diintegralkan.",
        },
        v.step,
        {
          title: "Terapkan rumus integral parsial",
          after: `${toLatex(mul(u, v.value))} - ${intL(remaining, x)}`,
          operation: "apply-parts",
          reason: "uv − ∫v du.",
        },
        inner.step,
      ],
    },
  };
  void X;
}

function cyclicExpTrig(e: Expr, x: string): IntResult | null {
  // c * e^(a x) * sin(b x) or cos(b x)
  const factors = e.type === "mul" ? e.factors : [e];
  const c = factors.filter((f) => !containsSymbol(f, x));
  const xf = factors.filter((f) => containsSymbol(f, x));
  if (xf.length !== 2) return null;
  const ex = xf.find((f) => f.type === "pow" && f.base.type === "sym" && f.base.name === "e");
  const tr = xf.find((f) => f.type === "fn" && (f.name === "sin" || f.name === "cos"));
  if (!ex || !tr) return null;
  const pa = toPoly((ex as { exp: Expr }).exp, x);
  const pb = toPoly((tr as { args: readonly Expr[] }).args[0], x);
  if (
    !pa ||
    !pb ||
    pa.degree !== 1 ||
    pb.degree !== 1 ||
    !pa.coeff(0).isZero() ||
    !pb.coeff(0).isZero()
  )
    return null;
  const a = pa.coeff(1);
  const b = pb.coeff(1);
  const X = rawSym(x);
  const den = a.mul(a).add(b.mul(b));
  const sinB = fn("sin", mul(num(b), X));
  const cosB = fn("cos", mul(num(b), X));
  const isSin = (tr as { name: string }).name === "sin";
  const inner = isSin
    ? sub(mul(num(a), sinB), mul(num(b), cosB))
    : add(mul(num(a), cosB), mul(num(b), sinB));
  const value = mul(c.length ? mul(...c) : ONE, ex, inner, num(den.inv()));
  return mk(
    e,
    x,
    value,
    "Integral parsial siklik",
    {
      id: "cyclic-parts",
      name: "Integral parsial dua kali (siklik)",
      formula: isSin
        ? "\\int e^{ax}\\sin bx\\,dx = \\frac{e^{ax}(a\\sin bx - b\\cos bx)}{a^2 + b^2} + C"
        : "\\int e^{ax}\\cos bx\\,dx = \\frac{e^{ax}(a\\cos bx + b\\sin bx)}{a^2 + b^2} + C",
    },
    "Integral parsial dua kali menghasilkan integral semula; selesaikan persamaan untuk I = ∫ eᵃˣ sin/cos(bx) dx.",
  );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function integrate(e: Expr, x: string, depth = 0): IntResult | null {
  tick("integrate");
  if (depth > 14) return null;
  const X = rawSym(x);
  if (!containsSymbol(e, x)) {
    return mk(
      e,
      x,
      mul(e, X),
      "Integral konstanta",
      { id: "constant", name: "Integral konstanta", formula: "\\int c\\,dx = cx + C" },
      `${toLatex(e)} tidak bergantung pada ${x}.`,
    );
  }
  if (e.type === "add") {
    const parts: IntResult[] = [];
    for (const t of e.terms) {
      const r = integrate(t, x, depth + 1);
      if (!r) {
        // maybe the sum as a whole is a rational function
        const rf = rationalFunction(e, x);
        return rf;
      }
      parts.push(r);
    }
    const value = add(...parts.map((p) => p.value));
    return {
      value,
      step: {
        title: "Sifat linear: integral jumlah",
        before: intL(e, x),
        after: `${e.terms.map((t) => intL(t, x)).join(" + ")} = ${toLatex(value)}`,
        operation: "int-sum",
        rule: {
          id: "sum",
          name: "Linearitas integral",
          formula: "\\int (f + g)\\,dx = \\int f\\,dx + \\int g\\,dx",
        },
        reason: "Integral dari jumlah adalah jumlah integral.",
        substeps: parts.map((p) => p.step),
      },
    };
  }
  if (e.type === "mul") {
    const c = e.factors.filter((f) => !containsSymbol(f, x));
    if (c.length) {
      const rest = e.factors.filter((f) => containsSymbol(f, x));
      const inner = rest.length === 1 ? rest[0] : mul(...rest);
      const r = integrate(inner, x, depth + 1);
      if (!r) return null;
      const k = mul(...c);
      const value = mul(k, r.value);
      return {
        value,
        step: {
          title: "Keluarkan konstanta",
          before: intL(e, x),
          after: `${toLatex(k)} ${intL(inner, x)} = ${toLatex(value)}`,
          operation: "int-constant-multiple",
          rule: {
            id: "constant-multiple",
            name: "Kelipatan konstanta",
            formula: "\\int c f\\,dx = c\\int f\\,dx",
          },
          reason: `Konstanta $${toLatex(k)}$ dapat dikeluarkan dari integral.`,
          substeps: [r.step],
        },
      };
    }
  }
  const t = table(e, x);
  if (t) return t;
  const qf = quadraticRootForms(e, x);
  if (qf) return qf;
  // polynomial expansion (e.g. (x+1)^3, x(x+2)) when it is a polynomial product
  if (
    e.type === "mul" ||
    (e.type === "pow" &&
      e.base.type === "add" &&
      e.exp.type === "num" &&
      e.exp.value.isInteger() &&
      e.exp.value.isPositive())
  ) {
    const p = toPoly(e, x);
    if (p && (e.type === "mul" || p.degree <= 6)) {
      const ex = expand(e);
      if (ex.type === "add") {
        const r = integrate(ex, x, depth + 1);
        if (r)
          return {
            value: r.value,
            step: {
              title: "Jabarkan integran terlebih dahulu",
              before: intL(e, x),
              after: toLatex(r.value),
              operation: "int-expand",
              rule: { id: "expand", name: "Penjabaran polinomial" },
              reason:
                "Integran berupa polinomial; setelah dijabarkan, gunakan aturan pangkat per suku.",
              substeps: [
                {
                  title: "Bentuk jabaran",
                  after: toLatex(ex),
                  operation: "expand",
                  reason: "Sifat distributif.",
                },
                r.step,
              ],
            },
          };
      }
    }
  }
  const cyc = cyclicExpTrig(e, x);
  if (cyc) return cyc;
  const tr = trigRewrite(e, x);
  if (tr) {
    const r = integrate(tr.rewritten, x, depth + 1);
    if (r)
      return {
        value: r.value,
        step: {
          title: tr.title,
          before: intL(e, x),
          after: toLatex(r.value),
          operation: "int-trig-identity",
          rule: tr.rule,
          reason:
            "Identitas trigonometri mengubah integran menjadi bentuk yang dapat diintegralkan.",
          substeps: [
            {
              title: "Tulis ulang integran",
              after: toLatex(tr.rewritten),
              operation: "rewrite",
              reason: tr.rule?.name ?? "",
            },
            r.step,
          ],
        },
      };
  }
  // rational functions
  const hasDenominator =
    e.type === "pow"
      ? e.exp.type === "num" && e.exp.value.isNegative()
      : e.type === "mul" &&
        e.factors.some(
          (f) =>
            f.type === "pow" &&
            f.exp.type === "num" &&
            f.exp.value.isNegative() &&
            containsSymbol(f.base, x),
        );
  if (hasDenominator) {
    const { numer, denom } = together(e);
    if (toPoly(expand(numer), x) && toPoly(expand(denom), x)) {
      // prefer substitution when the numerator is (a multiple of) the derivative of the denominator
      const us = uSubstitution(e, x, depth);
      if (us && exprSize(us.value) <= 40) return us;
      const rf = rationalFunction(e, x);
      if (rf) return rf;
    }
  }
  const us = uSubstitution(e, x, depth);
  if (us) return us;
  const bp = byParts(e, x, depth);
  if (bp) return bp;
  // last resort: expand products of sums
  if (e.type === "mul" || e.type === "pow") {
    try {
      const ex = expand(e);
      if (ex.type === "add" && exprKey(ex) !== exprKey(e)) {
        const r = integrate(ex, x, depth + 1);
        if (r)
          return {
            value: r.value,
            step: {
              title: "Jabarkan integran",
              before: intL(e, x),
              after: toLatex(r.value),
              operation: "int-expand",
              reason: "Setelah dijabarkan, setiap suku dapat diintegralkan.",
              substeps: [r.step],
            },
          };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export { E, frac, sqrt };
