/**
 * Algebraic manipulation with steps: simplify, expand, factor, rational expressions,
 * and evaluation at a point.
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { expand, expandPower, numerDenom, together } from "../expr/expand";
import { Poly, toPoly } from "../expr/polynomial";
import { toLatex } from "../expr/print";
import { add, mul, num, pow, substituteSymbols, MINUS_ONE } from "../expr/simplify";
import { exprKey, freeSymbols, rawAdd, rawMul, rawSym, type Expr } from "../expr/types";
import { checkEquivalent } from "../expr/equivalence";
import { toExpr } from "../parse/convert";
import { syntaxToLatex } from "../parse/print-syntax";
import type { SNode } from "../parse/syntax";
import { checkRewrite, makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification, exactAnswer } from "../steps/format";
import type { Alternative, Solution, Step, VerificationCheck } from "../steps/types";
import { verifyAgainstInput } from "../steps/verify";
import { evalReal } from "../expr/evaluate";
import { floatEvalSyntax } from "./arithmetic";
import { factorExpression, buildFactoredForm } from "./factor";

/** Flatten a syntax sum into signed terms. */
function signedTerms(n: SNode, sign = 1, out: Array<{ node: SNode; sign: number }> = []) {
  if (n.k === "bin" && (n.op === "+" || n.op === "-")) {
    signedTerms(n.left, sign, out);
    signedTerms(n.right, n.op === "-" ? -sign : sign, out);
  } else if (n.k === "group") {
    signedTerms(n.arg, sign, out);
  } else if (n.k === "neg") {
    signedTerms(n.arg, -sign, out);
  } else out.push({ node: n, sign });
  return out;
}

function likeTermStep(node: SNode): Step | null {
  const terms = signedTerms(node);
  if (terms.length < 3 && !terms.some((t, i) => terms.findIndex((u) => u !== t) !== i)) {
    // fall through: small sums still checked below
  }
  const groups = new Map<string, Array<{ expr: Expr; sign: number; node: SNode }>>();
  for (const t of terms) {
    let e: Expr;
    try {
      e = toExpr(t.node);
    } catch {
      return null;
    }
    const factors = e.type === "mul" ? e.factors : [e];
    const rest = factors.filter((f) => f.type !== "num");
    const key = rest.length === 0 ? "#const" : exprKey(rest.length === 1 ? rest[0] : rawMul(rest));
    groups.set(key, [...(groups.get(key) ?? []), { expr: e, sign: t.sign, node: t.node }]);
  }
  if (![...groups.values()].some((g) => g.length > 1)) return null;
  const parts = [...groups.values()].map((g) => {
    const inner = g.map((t, i) => {
      const s = syntaxToLatex(t.node);
      if (i === 0) return t.sign < 0 ? `-${s}` : s;
      return t.sign < 0 ? ` - ${s}` : ` + ${s}`;
    });
    return g.length > 1 ? `\\left(${inner.join("")}\\right)` : inner.join("");
  });
  const combined = parts.map((p, i) => (i === 0 || p.startsWith("-") ? p : `+ ${p}`)).join(" ");
  return {
    title: "Kelompokkan suku-suku sejenis",
    after: combined.replace(/\+ -/g, "- "),
    operation: "group-like-terms",
    rule: {
      id: "like-terms",
      name: "Sifat komutatif dan asosiatif penjumlahan",
      formula: "ax + bx = (a + b)x",
    },
    reason:
      "Suku sejenis memiliki bagian variabel yang sama sehingga koefisiennya dapat dijumlahkan.",
  };
}

interface RationalSimplification {
  steps: Step[];
  result: Expr;
  restrictions: string[];
}

/** Cancel common polynomial factors of a univariate rational expression. */
export function simplifyRational(e: Expr): RationalSimplification | null {
  const vars = [...freeSymbols(e)];
  if (vars.length !== 1) return null;
  const x = vars[0];
  const { numer, denom } = together(e);
  const P = toPoly(numer, x);
  const Q = toPoly(expand(denom), x);
  if (!P || !Q || Q.degree < 1) return null;
  const G = Poly.gcd(P, Q);
  const steps: Step[] = [];
  const X = rawSym(x);
  const fracLatex = (a: Expr, b: Expr) => `\\frac{${toLatex(a)}}{${toLatex(b)}}`;
  if (e.type === "add") {
    steps.push({
      title: "Samakan penyebut dan gabungkan menjadi satu pecahan",
      before: toLatex(e),
      after: fracLatex(P.toExpr(x), Q.toExpr(x)),
      operation: "combine-fractions",
      rule: {
        id: "fraction-add",
        name: "Penjumlahan pecahan aljabar",
        formula: "\\frac{a}{b} + \\frac{c}{d} = \\frac{ad + bc}{bd}",
      },
      reason: "Pecahan dijumlahkan setelah penyebutnya disamakan.",
      check: checkRewrite(e, mul(P.toExpr(x), pow(Q.toExpr(x), MINUS_ONE))),
    });
  }
  // domain restrictions: zeros of the ORIGINAL denominator
  const restrictions: string[] = [];
  const { roots, rest } = Q.rationalRoots();
  const uniq = [...new Map(roots.map((r) => [r.toString(), r])).values()];
  for (const r of uniq) restrictions.push(`${toLatex(X)} \\ne ${toLatex(num(r))}`);
  if (rest.degree >= 1) restrictions.push(`${toLatex(rest.toExpr(x))} \\ne 0`);

  if (G.degree < 1) {
    return { steps, result: mul(P.toExpr(x), pow(Q.toExpr(x), MINUS_ONE)), restrictions };
  }
  const fp = factorExpression(P.toExpr(x));
  const fq = factorExpression(Q.toExpr(x));
  if (fp && fq) {
    steps.push({
      title: "Faktorkan pembilang dan penyebut",
      after: `\\frac{${toLatex(fp.factored)}}{${toLatex(fq.factored)}}`,
      operation: "factor-numerator-denominator",
      reason: "Faktor yang sama pada pembilang dan penyebut dapat dicoret.",
      substeps: [...fp.steps.slice(0, -1), ...fq.steps.slice(0, -1)],
    });
  }
  const Pn = P.divmod(G).q;
  const Qn = Q.divmod(G).q;
  // normalize sign/leading coefficient
  const result =
    Qn.degree === 0
      ? Pn.scale(Qn.coeff(0).inv()).toExpr(x)
      : mul(Pn.toExpr(x), pow(Qn.toExpr(x), MINUS_ONE));
  steps.push({
    title: "Coret faktor persekutuan",
    before: fracLatex(P.toExpr(x), Q.toExpr(x)),
    after: toLatex(result),
    operation: "cancel-common-factor",
    rule: {
      id: "cancel",
      name: "Pembatalan faktor persekutuan",
      formula: "\\frac{a \\cdot c}{b \\cdot c} = \\frac{a}{b},\\ c \\ne 0",
    },
    reason: `Faktor persekutuan $${toLatex(G.toExpr(x))}$ dicoret dari pembilang dan penyebut.`,
    assumptions: [`${toLatex(G.toExpr(x))} \\ne 0`],
    check: checkRewrite(mul(P.toExpr(x), pow(Q.toExpr(x), MINUS_ONE)), result),
  });
  return { steps, result, restrictions };
}

function allVars(e: Expr): string[] {
  return [...freeSymbols(e)].sort();
}

export function solveSimplify(input: string, node: SNode, warnings: string[] = []): Solution {
  const canonical = toExpr(node);
  const inputLatex = syntaxToLatex(node);
  const steps: Step[] = [];
  const like = likeTermStep(node);
  if (like) steps.push(like);
  const canonLatex = toLatex(canonical);
  if (canonLatex !== inputLatex) {
    steps.push({
      title: "Sederhanakan: operasikan konstanta, gabungkan suku sejenis dan pangkat",
      before: inputLatex,
      after: canonLatex,
      operation: "auto-simplify",
      rule: {
        id: "auto-simplify",
        name: "Penyederhanaan otomatis",
        formula: "a x^m \\cdot b x^n = ab\\,x^{m+n},\\quad ax + bx = (a+b)x",
        conditions: "Variabel diasumsikan bilangan real; x^0 = 1 untuk x ≠ 0.",
      },
      reason:
        "Suku sejenis dijumlahkan, faktor sejenis digabung dengan menjumlahkan pangkat, dan bilangan dihitung secara eksak.",
    });
  }
  let result = canonical;
  const assumptions: string[] = [];
  const hasDenominator = numerDenom(canonical).denom;
  const rational =
    freeSymbols(hasDenominator).size > 0 || canonical.type === "add"
      ? simplifyRational(canonical)
      : null;
  if (rational && rational.steps.length && freeSymbols(numerDenom(canonical).denom).size > 0) {
    steps.push(...rational.steps);
    result = rational.result;
    if (rational.restrictions.length)
      assumptions.push(`Syarat (domain): ${rational.restrictions.map((r) => `$${r}$`).join(", ")}`);
  }
  if (steps.length === 0) {
    steps.push({
      title: "Ekspresi sudah dalam bentuk paling sederhana",
      after: canonLatex,
      operation: "identity",
      reason: "Tidak ada suku sejenis, faktor sejenis, atau konstanta yang dapat digabung lagi.",
    });
  }
  const vars = allVars(canonical);
  const checks: VerificationCheck[] = [verifyAgainstInput(node, result, vars)];
  const alternatives: Alternative[] = [];
  try {
    const ex = expand(result);
    if (exprKey(ex) !== exprKey(result)) {
      alternatives.push({
        name: "Bentuk dijabarkan",
        description: "Semua perkalian didistribusikan.",
        steps: [
          {
            title: "Jabarkan",
            after: toLatex(ex),
            operation: "expand",
            reason: "Sifat distributif diterapkan pada setiap perkalian.",
            check: checkRewrite(result, ex),
          },
        ],
        answers: [exactAnswer(ex)],
      });
    }
    const f = factorExpression(result);
    if (f && exprKey(f.factored) !== exprKey(result)) {
      alternatives.push({
        name: "Bentuk faktor",
        description: "Ekspresi ditulis sebagai hasil kali faktor-faktornya.",
        steps: f.steps,
        answers: [exactAnswer(f.factored)],
      });
    }
  } catch {
    // alternatives are optional
  }
  return makeSolution({
    kind: "simplify",
    title: "Penyederhanaan ekspresi",
    input,
    inputLatex,
    answers: [exactAnswer(result, "Bentuk sederhana")],
    method: {
      name: "Penyederhanaan aljabar",
      description:
        "Menggabungkan suku sejenis, menyederhanakan pangkat dan akar, serta mencoret faktor persekutuan.",
    },
    steps,
    verification: aggregateVerification(checks),
    module: "algebra",
    assumptions: ["Semua variabel diasumsikan bilangan real.", ...assumptions],
    notes: warnings,
    alternatives,
    references: [REFERENCES.cohen, REFERENCES.openstaxAlgebra],
    plot:
      vars.length === 1
        ? {
            kind: "function",
            variable: vars[0],
            functions: [{ expr: exactAnswer(result).text, label: exactAnswer(result).text }],
          }
        : undefined,
  });
}

function distributionStep(e: Expr): Step | null {
  // (a + b)(c + d) -> ac + ad + bc + bd (unsimplified)
  if (e.type === "mul") {
    const sums = e.factors.filter(
      (f) =>
        f.type === "add" ||
        (f.type === "pow" &&
          f.base.type === "add" &&
          f.exp.type === "num" &&
          f.exp.value.isInteger() &&
          f.exp.value.isPositive()),
    );
    if (sums.length >= 1) {
      const others = e.factors.filter((f) => !sums.includes(f));
      const first = sums[0];
      if (first.type === "add" && (sums.length >= 2 || others.length >= 1)) {
        const second =
          sums.length >= 2 ? sums[1] : others.length === 1 ? others[0] : rawMul(others);
        const secondTerms = second.type === "add" ? second.terms : [second];
        const products: Expr[] = [];
        for (const a of first.terms) for (const b of secondTerms) products.push(rawMul([a, b]));
        const shown = rawAdd(products);
        return {
          title:
            sums.length >= 2
              ? "Kalikan setiap suku pada kurung pertama dengan setiap suku pada kurung kedua"
              : "Distribusikan perkalian",
          before: toLatex(e),
          after: toLatex(shown),
          operation: "distribute",
          rule: {
            id: "distributive",
            name: "Sifat distributif",
            formula: "(a + b)(c + d) = ac + ad + bc + bd",
          },
          reason: "Setiap suku dikalikan dengan setiap suku lainnya (sifat distributif).",
        };
      }
    }
  }
  if (
    e.type === "pow" &&
    e.base.type === "add" &&
    e.base.terms.length === 2 &&
    e.exp.type === "num" &&
    e.exp.value.isInteger()
  ) {
    const n = Number(e.exp.value.num);
    if (n >= 2 && n <= 12) {
      const [a, b] = e.base.terms;
      const terms: string[] = [];
      for (let k = 0; k <= n; k++)
        terms.push(
          `\\binom{${n}}{${k}}\\left(${toLatex(a)}\\right)^{${n - k}}\\left(${toLatex(b)}\\right)^{${k}}`,
        );
      return {
        title: `Gunakan teorema binomial untuk pangkat ${n}`,
        before: toLatex(e),
        after: terms.join(" + "),
        operation: "binomial-theorem",
        rule: {
          id: "binomial",
          name: "Teorema binomial",
          formula: "(a + b)^n = \\sum_{k=0}^{n} \\binom{n}{k} a^{n-k} b^{k}",
        },
        reason: "Koefisien setiap suku diambil dari segitiga Pascal / kombinasi C(n, k).",
      };
    }
  }
  return null;
}

export function solveExpand(input: string, node: SNode, warnings: string[] = []): Solution {
  const e = toExpr(node);
  const inputLatex = syntaxToLatex(node);
  const steps: Step[] = [];
  const dist = distributionStep(e.type === "add" ? e : e);
  if (dist) steps.push(dist);
  if (e.type === "add") {
    for (const t of e.terms) {
      const s = distributionStep(t);
      if (s) steps.push(s);
    }
  }
  const expanded = expand(e);
  steps.push({
    title: "Kalikan dan gabungkan suku-suku sejenis",
    before: steps.length ? undefined : toLatex(e),
    after: toLatex(expanded),
    operation: "collect-like-terms",
    rule: {
      id: "like-terms",
      name: "Menggabungkan suku sejenis",
      formula: "ax^n + bx^n = (a + b)x^n",
    },
    reason:
      "Hasil perkalian disederhanakan lalu suku-suku dengan variabel dan pangkat yang sama dijumlahkan.",
    check: checkRewrite(e, expanded),
  });
  const vars = allVars(e);
  const checks: VerificationCheck[] = [
    verifyAgainstInput(node, expanded, vars, "Bandingkan bentuk jabaran dengan soal asli"),
  ];
  const eq = checkEquivalent(e, expanded);
  checks.push({
    description: "Selisih bentuk awal dan bentuk jabaran sama dengan nol",
    passed: eq.equivalent,
    method: eq.method === "symbolic" ? "Kesetaraan simbolik" : "Kesetaraan numerik",
    detail: eq.detail,
  });
  return makeSolution({
    kind: "expand",
    title: "Menjabarkan ekspresi",
    input,
    inputLatex,
    answers: [exactAnswer(expanded, "Bentuk jabaran")],
    method: {
      name: "Sifat distributif",
      description:
        "Setiap perkalian terhadap penjumlahan didistribusikan, pangkat dijabarkan dengan teorema binomial, lalu suku sejenis digabung.",
      formula: "a(b + c) = ab + ac",
    },
    steps,
    verification: aggregateVerification(checks),
    module: "algebra",
    notes: warnings,
    references: [REFERENCES.openstaxAlgebra],
  });
}

export function solveFactor(input: string, node: SNode, warnings: string[] = []): Solution {
  const e = toExpr(node);
  const inputLatex = syntaxToLatex(node);
  const f = factorExpression(e);
  if (!f) {
    throw new MathError("unsupported", "Ekspresi ini tidak dapat difaktorkan oleh engine.", {
      module: "algebra",
      operation: "factor",
      cause: "Tidak ditemukan faktor persekutuan, pola khusus, atau akar rasional.",
      hint: "Faktorisasi otomatis mendukung polinomial satu variabel dengan koefisien rasional dan pola umum (FPB, selisih kuadrat).",
    });
  }
  const checks: VerificationCheck[] = [];
  const back = expand(f.factored);
  const eq = checkEquivalent(expand(e), back);
  checks.push({
    description: "Kalikan kembali faktor-faktornya dan bandingkan dengan soal asli",
    latex: `${toLatex(f.factored)} = ${toLatex(back)}`,
    passed: eq.equivalent,
    method: eq.method === "symbolic" ? "Ekspansi simbolik" : "Kesetaraan numerik",
    detail: eq.detail,
  });
  const notes = [...warnings];
  if (f.irreducibleRemainder)
    notes.push("Sebagian faktor tidak dapat difaktorkan lebih lanjut atas bilangan rasional.");
  return makeSolution({
    kind: "factor",
    title: "Faktorisasi",
    input,
    inputLatex,
    answers: [exactAnswer(f.factored, "Bentuk faktor")],
    method: {
      name: "Faktorisasi polinomial",
      description:
        "FPB, pola khusus (selisih kuadrat, pangkat tiga), metode AC untuk kuadrat, dan teorema akar rasional dengan pembagian sintetik.",
    },
    steps: f.steps,
    verification: aggregateVerification(checks),
    module: "algebra",
    notes,
    references: [REFERENCES.openstaxAlgebra],
  });
}

/** Replace symbols without simplifying, for displaying a substitution. */
function substituteRaw(e: Expr, values: Record<string, Expr>): Expr {
  switch (e.type) {
    case "num":
      return e;
    case "sym":
      return values[e.name] ?? e;
    case "add":
      return rawAdd(e.terms.map((t) => substituteRaw(t, values)));
    case "mul":
      return rawMul(e.factors.map((f) => substituteRaw(f, values)));
    case "pow":
      return {
        type: "pow",
        base: substituteRaw(e.base, values),
        exp: substituteRaw(e.exp, values),
      };
    case "fn":
      return { type: "fn", name: e.name, args: e.args.map((a) => substituteRaw(a, values)) };
  }
}

/** Evaluate an expression at given values of its variables. */
export function solveEvaluateAt(
  input: string,
  node: SNode,
  values: Record<string, Expr>,
  warnings: string[] = [],
): Solution {
  const e = toExpr(node);
  const inputLatex = syntaxToLatex(node);
  const subLatex = Object.entries(values)
    .map(([k, v]) => `${toLatex(rawSym(k))} = ${toLatex(v)}`)
    .join(",\\ ");
  const result = substituteSymbols(e, values);
  const steps: Step[] = [
    {
      title: "Substitusikan nilai variabel",
      before: toLatex(e),
      after: toLatex(substituteRaw(e, values)),
      operation: "substitute",
      rule: { id: "substitution", name: "Substitusi" },
      reason: `Setiap kemunculan variabel diganti: $${subLatex}$.`,
    },
    {
      title: "Hitung nilainya",
      after: toLatex(result),
      operation: "evaluate",
      reason: "Operasi dikerjakan sesuai urutan operasi secara eksak.",
    },
  ];
  const env: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) env[k] = evalReal(v);
  const checks: VerificationCheck[] = [];
  const independent = floatEvalSyntax(node, env);
  const exactValue = evalReal(result);
  if (Number.isFinite(independent) && Number.isFinite(exactValue)) {
    const ok = Math.abs(independent - exactValue) <= 1e-9 * Math.max(1, Math.abs(exactValue));
    checks.push({
      description: "Evaluasi numerik independen dari soal asli pada nilai yang diberikan",
      passed: ok,
      method: "Evaluasi numerik independen",
      detail: `${independent.toPrecision(12)} vs ${exactValue.toPrecision(12)}`,
    });
  }
  return makeSolution({
    kind: "simplify",
    title: "Nilai ekspresi",
    input,
    inputLatex: `${inputLatex}\\quad\\text{untuk}\\ ${subLatex}`,
    answers: [exactAnswer(result, "Nilai")],
    method: {
      name: "Substitusi",
      description: "Ganti variabel dengan nilainya lalu hitung secara eksak.",
    },
    steps,
    verification: aggregateVerification(checks),
    module: "algebra",
    notes: warnings,
  });
}

export { add, num, Rational, expandPower, buildFactoredForm };
