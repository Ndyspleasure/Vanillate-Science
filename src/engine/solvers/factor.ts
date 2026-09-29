/**
 * Factorization of polynomials with steps.
 *
 * Univariate over Q: greatest common factor, rational roots (rational root theorem +
 * synthetic division), AC method for quadratics, difference of squares, sums/differences
 * of cubes. Multivariate: greatest common monomial factor and difference of squares.
 */
import { tick } from "../core/budget";
import { bigGcd, bigLcm, Rational, exactIntRoot } from "../core/rational";
import { expand } from "../expr/expand";
import { Poly, toPoly, polyCoefficients } from "../expr/polynomial";
import { toLatex } from "../expr/print";
import { add, mul, pow, num, neg, sub, ONE, sqrt } from "../expr/simplify";
import { freeSymbols, rawMul, rawNum, rawSym, rawPow, type Expr } from "../expr/types";
import type { Step } from "../steps/types";

export interface FactorResult {
  /** Factored expression built with raw nodes so it is not re-expanded. */
  factored: Expr;
  /** Factors with multiplicities (constant first when not 1). */
  factors: Array<{ factor: Expr; multiplicity: number }>;
  constant: Rational;
  steps: Step[];
  /** True if a factor could not be decomposed further over Q. */
  irreducibleRemainder: boolean;
}

/** Build a displayable product that the automatic simplifier would not distribute. */
export function buildFactoredForm(
  constant: Rational,
  factors: Array<{ factor: Expr; multiplicity: number }>,
): Expr {
  const parts: Expr[] = [];
  for (const { factor, multiplicity } of factors) {
    parts.push(multiplicity === 1 ? factor : rawPow(factor, rawNum(Rational.of(multiplicity))));
  }
  if (parts.length === 0) return rawNum(constant);
  if (constant.isOne() && parts.length === 1) return parts[0];
  return rawMul(constant.isOne() ? parts : [rawNum(constant), ...parts]);
}

function linearFactor(x: string, r: Rational): Expr {
  // (q x - p) for root p/q, integer coefficients
  return add(mul(num(Rational.of(r.den)), rawSym(x)), num(Rational.of(-r.num)));
}

function describeSynthetic(p: Poly, r: Rational, x: string): Step {
  const q = p.divmod(Poly.fromNumbers([r.neg(), Rational.ONE])).q;
  return {
    title: `Bagi dengan (${x} ${r.isNegative() ? "+" : "-"} ${r.abs().toString()}) menggunakan pembagian sintetik`,
    after: `${toLatex(p.toExpr(x))} = \\left(${toLatex(sub(rawSym(x), num(r)))}\\right)\\left(${toLatex(q.toExpr(x))}\\right)`,
    operation: "synthetic-division",
    rule: {
      id: "factor-theorem",
      name: "Teorema faktor",
      formula: "P(r) = 0 \\iff (x - r) \\text{ adalah faktor dari } P(x)",
    },
    reason: `P(${r.toString()}) = 0, sehingga (${x} ${r.isNegative() ? "+" : "-"} ${r.abs().toString()}) adalah faktor. Koefisien sisa pembagian: ${q.coeffs
      .slice()
      .reverse()
      .map((c) => c.toString())
      .join(", ")}.`,
  };
}

/** Factor a univariate polynomial with rational coefficients. */
export function factorUnivariate(p: Poly, x: string): FactorResult {
  const steps: Step[] = [];
  if (p.degree < 1)
    return {
      factored: p.toExpr(x),
      factors: [],
      constant: p.coeff(0),
      steps,
      irreducibleRemainder: false,
    };
  const { content, poly } = p.primitive();
  const X = rawSym(x);
  const factors: Array<{ factor: Expr; multiplicity: number }> = [];

  // 1. Greatest common factor (content and power of x)
  let lowest = 0;
  while (poly.coeff(lowest).isZero()) lowest++;
  const work = new Poly(poly.coeffs.slice(lowest));
  if (!content.isOne() || lowest > 0) {
    const gcf = mul(num(content), pow(X, num(lowest)));
    const inner = work.toExpr(x);
    steps.push({
      title: "Keluarkan faktor persekutuan terbesar (FPB)",
      before: toLatex(p.toExpr(x)),
      after: `${toLatex(gcf)}\\left(${toLatex(inner)}\\right)`,
      operation: "factor-gcf",
      rule: { id: "distributive", name: "Sifat distributif", formula: "ab + ac = a(b + c)" },
      reason: `Setiap suku habis dibagi $${toLatex(gcf)}$.`,
    });
  }
  if (lowest > 0) factors.push({ factor: X, multiplicity: lowest });

  // 2. Special forms for binomials
  if (work.degree >= 2 && work.coeffs.filter((c) => !c.isZero()).length === 2) {
    const n = work.degree;
    const a = work.lead();
    const b = work.coeff(0);
    if (n % 2 === 0 && a.isPositive() && b.isNegative()) {
      const ra = exactIntRoot(a.num, 2);
      const rb = exactIntRoot(-b.num, 2);
      if (ra !== null && rb !== null && a.isInteger() && b.isInteger()) {
        const half = n / 2;
        const A = mul(num(ra), pow(X, num(half)));
        const B = num(rb);
        steps.push({
          title: "Gunakan selisih dua kuadrat",
          before: toLatex(work.toExpr(x)),
          after: `\\left(${toLatex(sub(A, B))}\\right)\\left(${toLatex(add(A, B))}\\right)`,
          operation: "difference-of-squares",
          rule: {
            id: "diff-squares",
            name: "Selisih dua kuadrat",
            formula: "a^2 - b^2 = (a - b)(a + b)",
          },
          reason: `$${toLatex(work.toExpr(x))} = (${toLatex(A)})^2 - ${rb}^2$.`,
        });
      }
    }
    if (n % 3 === 0 && a.isInteger() && b.isInteger()) {
      const ra = exactIntRoot(a.num, 3);
      const rb = exactIntRoot(b.num, 3);
      if (ra !== null && rb !== null) {
        const third = n / 3;
        const A = mul(num(ra), pow(X, num(third)));
        const B = num(rb);
        steps.push({
          title: b.isNegative()
            ? "Gunakan selisih dua pangkat tiga"
            : "Gunakan jumlah dua pangkat tiga",
          before: toLatex(work.toExpr(x)),
          after: `\\left(${toLatex(add(A, B))}\\right)\\left(${toLatex(add(pow(A, num(2)), neg(mul(A, B)), pow(B, num(2))))}\\right)`,
          operation: "sum-difference-cubes",
          rule: {
            id: "cubes",
            name: "Jumlah/selisih pangkat tiga",
            formula: "a^3 \\pm b^3 = (a \\pm b)(a^2 \\mp ab + b^2)",
          },
          reason: `Bentuk $${toLatex(work.toExpr(x))} = (${toLatex(A)})^3 ${b.isNegative() ? "-" : "+"} ${rb < 0n ? -rb : rb}^3$.`,
        });
      }
    }
  }

  // 3. Rational roots
  const { roots, rest } = work.rationalRoots();
  const rootCounts = new Map<string, { r: Rational; m: number }>();
  let deflate = work;
  for (const r of roots) {
    tick("factor");
    const key = r.toString();
    const cur = rootCounts.get(key);
    if (cur) cur.m++;
    else rootCounts.set(key, { r, m: 1 });
  }
  if (roots.length > 0 && work.degree > 2) {
    steps.push({
      title: "Cari akar rasional dengan teorema akar rasional",
      after: `\\text{akar rasional: } ${[...rootCounts.values()].map(({ r }) => (r.isInteger() ? r.toString() : `\\frac{${r.num}}{${r.den}}`)).join(",\\ ")}`,
      operation: "rational-root-theorem",
      rule: {
        id: "rational-root",
        name: "Teorema akar rasional",
        formula: "P\\left(\\tfrac{p}{q}\\right) = 0 \\Rightarrow p \\mid a_0,\\ q \\mid a_n",
      },
      reason:
        "Kandidat akar rasional adalah ±(pembagi suku konstan)/(pembagi koefisien utama); setiap kandidat diuji dengan substitusi.",
    });
    for (const r of roots) {
      if (deflate.degree <= 2) break;
      steps.push(describeSynthetic(deflate, r, x));
      deflate = deflate.divmod(Poly.fromNumbers([r.neg(), Rational.ONE])).q;
    }
  } else if (roots.length > 0 && work.degree === 2) {
    // AC method explanation for quadratics with rational roots
    const a = work.coeff(2);
    const b = work.coeff(1);
    const c = work.coeff(0);
    const ac = a.mul(c);
    const [r1, r2] = roots;
    // numbers m, n with m + n = b, m n = ac: m = -a r1, n = -a r2
    const m = a.mul(r1).neg();
    const nn = a.mul(r2).neg();
    if (a.isOne()) {
      steps.push({
        title: "Cari dua bilangan yang hasil kalinya c dan jumlahnya b",
        after: `${m.toString()} \\times ${nn.toString()} = ${c.toString()},\\quad ${m.toString()} + ${nn.toString()} = ${b.toString()}`,
        operation: "find-pair",
        rule: {
          id: "trinomial",
          name: "Faktorisasi trinomial x² + bx + c",
          formula: "x^2 + bx + c = (x + m)(x + n),\\ mn = c,\\ m + n = b",
        },
        reason: "Jika x² + bx + c = (x + m)(x + n), maka m + n = b dan m·n = c.",
      });
    } else {
      steps.push({
        title: "Metode AC: cari dua bilangan dengan hasil kali a·c dan jumlah b",
        after: `a c = ${ac.toString()},\\quad ${m.toString()} \\times ${nn.toString()} = ${ac.toString()},\\quad ${m.toString()} + ${nn.toString()} = ${b.toString()}`,
        operation: "ac-method",
        rule: {
          id: "ac-method",
          name: "Metode AC (pemisahan suku tengah)",
          formula: "ax^2 + bx + c = ax^2 + mx + nx + c,\\ mn = ac,\\ m + n = b",
        },
        reason:
          "Suku tengah dipecah menjadi dua suku sehingga dapat difaktorkan dengan pengelompokan.",
      });
    }
  }
  for (const { r, m } of rootCounts.values())
    factors.push({ factor: linearFactor(x, r), multiplicity: m });

  // Leading coefficient bookkeeping: product of (q x - p) has leading coeff prod q^m
  let leadFromFactors = Rational.ONE;
  for (const { r, m } of rootCounts.values())
    leadFromFactors = leadFromFactors.mul(Rational.of(r.den).pow(m));
  let restPoly = rest;
  let irreducible = false;
  if (restPoly.degree >= 1) {
    // make rest primitive with integer coefficients
    const pr = restPoly.primitive();
    restPoly = pr.poly;
    leadFromFactors = leadFromFactors.mul(Rational.ONE);
    const restExpr = restPoly.toExpr(x);
    factors.push({ factor: restExpr, multiplicity: 1 });
    irreducible = true;
    if (restPoly.degree === 2) {
      const a = restPoly.coeff(2);
      const b = restPoly.coeff(1);
      const c = restPoly.coeff(0);
      const disc = b.mul(b).sub(Rational.of(4).mul(a).mul(c));
      steps.push({
        title: "Periksa faktor kuadrat yang tersisa",
        after: `D = b^2 - 4ac = ${disc.toString()}`,
        operation: "check-irreducible-quadratic",
        rule: { id: "discriminant", name: "Diskriminan", formula: "D = b^2 - 4ac" },
        reason: disc.isNegative()
          ? "D < 0 sehingga faktor ini tidak memiliki akar real dan tidak dapat difaktorkan atas bilangan real."
          : "D bukan kuadrat sempurna sehingga faktor ini tidak dapat difaktorkan atas bilangan rasional (akarnya irasional).",
      });
    } else {
      steps.push({
        title: "Faktor sisa tidak memiliki akar rasional",
        after: toLatex(restExpr),
        operation: "irreducible",
        reason:
          "Tidak ada kandidat akar rasional yang memenuhi; faktor ini tidak dapat difaktorkan lebih lanjut menjadi faktor linear rasional oleh engine.",
      });
    }
  }
  // overall constant: p = content * (leading of work) ...
  const constant = computeConstant(p, factors, x);
  const factored = buildFactoredForm(constant, factors);
  steps.push({
    title: "Bentuk faktor akhir",
    after: toLatex(factored),
    operation: "factored-form",
    reason: "Semua faktor dikalikan kembali untuk menyusun bentuk faktor.",
  });
  return { factored, factors, constant, steps, irreducibleRemainder: irreducible };
}

function computeConstant(
  p: Poly,
  factors: Array<{ factor: Expr; multiplicity: number }>,
  x: string,
): Rational {
  let prod: Poly = Poly.ONE;
  for (const { factor, multiplicity } of factors) {
    const fp = toPoly(factor, x)!;
    prod = prod.mul(fp.pow(multiplicity));
  }
  return p.lead().div(prod.lead());
}

/** Greatest common monomial factor of a multivariate polynomial expression. */
export function commonMonomialFactor(e: Expr): { gcf: Expr; rest: Expr } | null {
  const ex = expand(e);
  if (ex.type !== "add") return null;
  let g = 0n;
  let den = 1n;
  const varPowers: Map<string, number>[] = [];
  for (const t of ex.terms) {
    const factors = t.type === "mul" ? t.factors : [t];
    const vp = new Map<string, number>();
    let coef = Rational.ONE;
    for (const f of factors) {
      if (f.type === "num") coef = f.value;
      else if (f.type === "sym") vp.set(f.name, (vp.get(f.name) ?? 0) + 1);
      else if (
        f.type === "pow" &&
        f.base.type === "sym" &&
        f.exp.type === "num" &&
        f.exp.value.isInteger() &&
        f.exp.value.isPositive()
      ) {
        vp.set(f.base.name, (vp.get(f.base.name) ?? 0) + Number(f.exp.value.num));
      } else vp.set(`#${f.type}`, -1e9);
    }
    g = bigGcd(g, coef.num);
    den = bigLcm(den, coef.den);
    varPowers.push(vp);
  }
  const common = new Map<string, number>();
  for (const [v, k] of varPowers[0]) {
    if (v.startsWith("#")) continue;
    let m = k;
    for (const vp of varPowers.slice(1)) m = Math.min(m, vp.get(v) ?? 0);
    if (m > 0) common.set(v, m);
  }
  let coefG = Rational.of(g, den);
  const leading = ex.terms[0];
  const leadCoef =
    leading.type === "mul" && leading.factors[0].type === "num"
      ? leading.factors[0].value
      : leading.type === "num"
        ? leading.value
        : Rational.ONE;
  if (
    leadCoef.isNegative() &&
    ex.terms.every((t) =>
      t.type === "mul" && t.factors[0].type === "num"
        ? t.factors[0].value.isNegative()
        : t.type === "num"
          ? t.value.isNegative()
          : false,
    )
  ) {
    coefG = coefG.neg();
  }
  if (coefG.isOne() && common.size === 0) return null;
  const gcf = mul(num(coefG), ...[...common].map(([v, k]) => pow(rawSym(v), num(k))));
  const rest = expand(mul(ex, pow(gcf, num(-1))));
  return { gcf, rest };
}

/** Factor a general expression: univariate polynomials fully, multivariate partially. */
export function factorExpression(e: Expr): FactorResult | null {
  const vars = [...freeSymbols(e)];
  if (vars.length === 1) {
    const p = toPoly(e, vars[0]);
    if (p && p.degree >= 1) return factorUnivariate(p, vars[0]);
  }
  const steps: Step[] = [];
  const cm = commonMonomialFactor(e);
  let current = e;
  const factors: Array<{ factor: Expr; multiplicity: number }> = [];
  let constant = Rational.ONE;
  if (cm) {
    steps.push({
      title: "Keluarkan faktor persekutuan terbesar",
      before: toLatex(expand(e)),
      after: `${toLatex(cm.gcf)}\\left(${toLatex(cm.rest)}\\right)`,
      operation: "factor-gcf",
      rule: { id: "distributive", name: "Sifat distributif", formula: "ab + ac = a(b + c)" },
      reason: "Faktor yang muncul di setiap suku dikeluarkan.",
    });
    const g = cm.gcf;
    const gf = g.type === "mul" ? g.factors : [g];
    for (const f of gf) {
      if (f.type === "num") constant = constant.mul(f.value);
      else if (f.type === "pow" && f.exp.type === "num")
        factors.push({ factor: f.base, multiplicity: Number(f.exp.value.num) });
      else factors.push({ factor: f, multiplicity: 1 });
    }
    current = cm.rest;
  }
  // difference of squares in several variables: A^2 - B^2
  const ds = differenceOfSquares(current);
  if (ds) {
    steps.push({
      title: "Gunakan selisih dua kuadrat",
      before: toLatex(current),
      after: `\\left(${toLatex(ds[0])}\\right)\\left(${toLatex(ds[1])}\\right)`,
      operation: "difference-of-squares",
      rule: {
        id: "diff-squares",
        name: "Selisih dua kuadrat",
        formula: "a^2 - b^2 = (a - b)(a + b)",
      },
      reason: "Ekspresi berbentuk selisih dua bentuk kuadrat.",
    });
    factors.push({ factor: ds[0], multiplicity: 1 }, { factor: ds[1], multiplicity: 1 });
  } else if (cm) {
    factors.push({ factor: current, multiplicity: 1 });
  } else {
    // try univariate factoring w.r.t. each variable with symbolic coefficients (quadratic trinomials)
    return null;
  }
  const factored = buildFactoredForm(constant, factors);
  steps.push({
    title: "Bentuk faktor akhir",
    after: toLatex(factored),
    operation: "factored-form",
    reason: "Semua faktor disusun menjadi hasil kali.",
  });
  return { factored, factors, constant, steps, irreducibleRemainder: false };
}

function differenceOfSquares(e: Expr): [Expr, Expr] | null {
  const ex = expand(e);
  if (ex.type !== "add" || ex.terms.length !== 2) return null;
  const [t1, t2] = ex.terms;
  const neg1 =
    t1.type === "mul" && t1.factors[0].type === "num" && t1.factors[0].value.isNegative();
  const neg2 =
    t2.type === "mul" && t2.factors[0].type === "num" && t2.factors[0].value.isNegative();
  if (
    neg1 === neg2 &&
    !(t1.type === "num" && t1.value.isNegative()) &&
    !(t2.type === "num" && t2.value.isNegative())
  )
    return null;
  const pos = neg1 || (t1.type === "num" && t1.value.isNegative()) ? t2 : t1;
  const negT = pos === t1 ? t2 : t1;
  const A = squareRootOfMonomial(pos);
  const B = squareRootOfMonomial(neg(negT));
  if (!A || !B) return null;
  return [sub(A, B), add(A, B)];
}

function squareRootOfMonomial(t: Expr): Expr | null {
  const factors = t.type === "mul" ? t.factors : [t];
  const out: Expr[] = [];
  for (const f of factors) {
    if (f.type === "num") {
      if (!f.value.isPositive()) return null;
      const rn = exactIntRoot(f.value.num, 2);
      const rd = exactIntRoot(f.value.den, 2);
      if (rn === null || rd === null) return null;
      out.push(num(Rational.of(rn, rd)));
    } else if (
      f.type === "pow" &&
      f.exp.type === "num" &&
      f.exp.value.isInteger() &&
      f.exp.value.num % 2n === 0n
    ) {
      out.push(pow(f.base, num(f.exp.value.div(Rational.TWO))));
    } else return null;
  }
  return mul(...out);
}

export { polyCoefficients, sqrt, ONE };
