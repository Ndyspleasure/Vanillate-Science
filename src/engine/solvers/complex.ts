/**
 * Complex number arithmetic with steps: bring an expression containing i into the
 * form a + bi (conjugate multiplication for division, i² = −1), then compute modulus,
 * argument, conjugate and polar/exponential forms.
 */
import { MathError } from "../core/errors";
import { evalComplex, complexApproxEqual } from "../expr/evaluate";
import { expand, numerDenom } from "../expr/expand";
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
  E,
  I,
  PI,
  ZERO,
} from "../expr/simplify";
import { containsSymbol, freeSymbols, type Expr } from "../expr/types";
import { syntaxToLatex } from "../parse/print-syntax";
import type { SNode } from "../parse/syntax";
import { toExpr } from "../parse/convert";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification, exactAnswer, formatComplex, formatNumber } from "../steps/format";
import type { Answer, Solution, Step } from "../steps/types";

/** Split an expanded expression into real and imaginary parts (coefficients of i). */
export function realImag(e: Expr): { re: Expr; im: Expr } {
  const r = rectangular(e);
  if (r) return r;
  // Fallback for callers that only pass polynomial-in-i expressions.
  const ex = expand(e);
  const terms = ex.type === "add" ? ex.terms : [ex];
  const re: Expr[] = [];
  const im: Expr[] = [];
  for (const t of terms) {
    if (containsSymbol(t, "i")) im.push(substitute(t, I, num(1)));
    else re.push(t);
  }
  return { re: add(...re), im: add(...im) };
}

interface Rect {
  re: Expr;
  im: Expr;
}

const isZero = (e: Expr) => e.type === "num" && e.value.isZero();

function rMul(a: Rect, b: Rect): Rect {
  return { re: sub(mul(a.re, b.re), mul(a.im, b.im)), im: add(mul(a.re, b.im), mul(a.im, b.re)) };
}

function rInv(a: Rect): Rect {
  const d = add(pow(a.re, num(2)), pow(a.im, num(2)));
  return { re: div(a.re, d), im: neg(div(a.im, d)) };
}

/** Principal argument atan2(b, a) as an exact expression (a, b real constants). */
function argExpr(re: Expr, im: Expr): Expr {
  const rv = evalComplex(re).re;
  const iv = evalComplex(im).re;
  if (rv === 0 && iv === 0) return ZERO;
  if (rv > 0) return fn("atan", div(im, re));
  if (rv < 0) return iv >= 0 ? add(fn("atan", div(im, re)), PI) : sub(fn("atan", div(im, re)), PI);
  return iv > 0 ? div(PI, num(2)) : neg(div(PI, num(2)));
}

/** e^(a + bi) = e^a (cos b + i sin b). */
function rExp(w: Rect): Rect {
  const m = pow(E, w.re);
  return { re: mul(m, fn("cos", w.im)), im: mul(m, fn("sin", w.im)) };
}

/**
 * Rectangular form a + bi of a constant expression, following principal branches:
 * Euler's formula for complex exponents, z^w = e^(w·Log z), sin/cos/sinh/cosh/ln/abs of
 * complex arguments. Returns null when the expression contains i in an unsupported place.
 */
export function rectangular(e: Expr): Rect | null {
  if (!containsSymbol(e, "i")) return { re: e, im: ZERO };
  switch (e.type) {
    case "sym":
      return e.name === "i" ? { re: ZERO, im: num(1) } : { re: e, im: ZERO };
    case "add": {
      const parts = e.terms.map(rectangular);
      if (parts.some((p) => p === null)) return null;
      return { re: add(...parts.map((p) => p!.re)), im: add(...parts.map((p) => p!.im)) };
    }
    case "mul": {
      let acc: Rect = { re: num(1), im: ZERO };
      for (const f of e.factors) {
        const r = rectangular(f);
        if (!r) return null;
        acc = rMul(acc, r);
      }
      return acc;
    }
    case "pow": {
      const base = rectangular(e.base);
      const w = rectangular(e.exp);
      if (!base || !w) return null;
      if (isZero(w.im) && e.exp.type === "num" && e.exp.value.isInteger()) {
        const n = Number(e.exp.value.num);
        if (Math.abs(n) > 256) return null;
        let acc: Rect = { re: num(1), im: ZERO };
        let b = n < 0 ? rInv(base) : base;
        let k = Math.abs(n);
        while (k > 0) {
          if (k & 1) acc = rMul(acc, b);
          b = rMul(b, b);
          k >>= 1;
        }
        return { re: expand(acc.re), im: expand(acc.im) };
      }
      // z^w = e^(w · Log z), Log z = ln|z| + i·Arg z (principal branch)
      let log: Rect;
      if (e.base.type === "sym" && e.base.name === "e") log = { re: num(1), im: ZERO };
      else if (isZero(base.im) && evalComplex(base.re).re > 0)
        log = { re: fn("ln", base.re), im: ZERO };
      else
        log = {
          re: fn("ln", pow(add(pow(base.re, num(2)), pow(base.im, num(2))), num(0.5))),
          im: argExpr(base.re, base.im),
        };
      return rExp(rMul(w, log));
    }
    case "fn": {
      if (e.args.length !== 1) return null;
      const z = rectangular(e.args[0]);
      if (!z) return null;
      const { re: a, im: b } = z;
      switch (e.name) {
        case "sin":
          return { re: mul(fn("sin", a), fn("cosh", b)), im: mul(fn("cos", a), fn("sinh", b)) };
        case "cos":
          return {
            re: mul(fn("cos", a), fn("cosh", b)),
            im: neg(mul(fn("sin", a), fn("sinh", b))),
          };
        case "sinh":
          return { re: mul(fn("sinh", a), fn("cos", b)), im: mul(fn("cosh", a), fn("sin", b)) };
        case "cosh":
          return { re: mul(fn("cosh", a), fn("cos", b)), im: mul(fn("sinh", a), fn("sin", b)) };
        case "ln":
          return {
            re: fn("ln", pow(add(pow(a, num(2)), pow(b, num(2))), num(0.5))),
            im: argExpr(a, b),
          };
        case "abs":
          return { re: pow(add(pow(a, num(2)), pow(b, num(2))), num(0.5)), im: ZERO };
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

export function conjugate(e: Expr): Expr {
  return substitute(e, I, neg(I));
}

export function isComplexExpression(n: SNode): boolean {
  try {
    const e = toExpr(n);
    return containsSymbol(e, "i") && freeSymbols(e).size === 0;
  } catch {
    return false;
  }
}

/** True when i appears inside an exponent or a function argument (needs Euler's formula). */
function hasComplexTranscendental(e: Expr): boolean {
  if (e.type === "pow")
    return (
      (containsSymbol(e.exp, "i") && !(e.exp.type === "num")) || hasComplexTranscendental(e.base)
    );
  if (e.type === "fn") return e.args.some((a) => containsSymbol(a, "i"));
  if (e.type === "add") return e.terms.some(hasComplexTranscendental);
  if (e.type === "mul") return e.factors.some(hasComplexTranscendental);
  return false;
}

export function solveComplex(input: string, node: SNode, warnings: string[] = []): Solution {
  const e = toExpr(node);
  if (freeSymbols(e).size > 0)
    throw new MathError(
      "unsupported",
      "Kalkulator bilangan kompleks hanya untuk ekspresi numerik.",
      { module: "complex" },
    );
  const steps: Step[] = [];
  let work = e;
  const { numer, denom } = numerDenom(e);
  if (containsSymbol(denom, "i")) {
    const conj = conjugate(denom);
    const newNum = expand(mul(numer, conj));
    const newDen = expand(mul(denom, conj));
    steps.push({
      title: "Kalikan pembilang dan penyebut dengan sekawan penyebut",
      before: `\\frac{${toLatex(numer)}}{${toLatex(denom)}}`,
      after: `\\frac{${toLatex(numer)}}{${toLatex(denom)}} \\cdot \\frac{${toLatex(conj)}}{${toLatex(conj)}} = \\frac{${toLatex(newNum)}}{${toLatex(newDen)}}`,
      operation: "conjugate",
      rule: {
        id: "complex-division",
        name: "Pembagian bilangan kompleks",
        formula: "\\frac{a + bi}{c + di} = \\frac{(a + bi)(c - di)}{c^2 + d^2}",
      },
      reason: "(c + di)(c − di) = c² + d² adalah bilangan real, sehingga i hilang dari penyebut.",
    });
    work = div(newNum, newDen);
  }
  const orig = evalComplex(e);
  let rect = rectangular(work);
  const usesEuler = hasComplexTranscendental(work);
  // Exact form must agree with an independent numeric evaluation; otherwise fall back to numbers.
  if (rect) {
    const v = evalComplex(add(rect.re, mul(rect.im, I)));
    if (!complexApproxEqual(v, orig, 1e-9, 1e-12)) rect = null;
  }
  const numericOnly = rect === null;
  if (numericOnly) {
    if (!Number.isFinite(orig.re) || !Number.isFinite(orig.im))
      throw new MathError(
        "unsupported",
        "Bentuk ini belum dapat dihitung sebagai bilangan kompleks.",
        { module: "complex" },
      );
    rect = { re: num(Number(orig.re.toPrecision(15))), im: num(Number(orig.im.toPrecision(15))) };
    warnings = [
      ...warnings,
      "Bentuk eksak a + bi tidak dapat diturunkan secara simbolik untuk soal ini; hasil dihitung numerik (15 angka penting).",
    ];
  }
  const { re, im } = rect!;
  const z = add(re, mul(im, I));
  if (usesEuler) {
    steps.push({
      title: "Gunakan rumus Euler dan nilai utama logaritma kompleks",
      after: toLatex(z),
      operation: "euler",
      rule: {
        id: "euler",
        name: "Rumus Euler",
        formula: "e^{a + bi} = e^{a}(\\cos b + i\\sin b),\\quad z^{w} = e^{w\\,\\mathrm{Log}\\,z}",
        conditions:
          "Pangkat kompleks memakai cabang utama Log z = ln|z| + i·Arg z, dengan Arg z ∈ (−π, π].",
      },
      reason:
        "Eksponen imajiner diubah menjadi cos dan sin sehingga bagian real dan imajiner terpisah.",
    });
  } else {
    steps.push({
      title: "Jabarkan dan gunakan i² = −1, lalu kelompokkan bagian real dan imajiner",
      after: toLatex(z),
      operation: "collect",
      rule: { id: "i-squared", name: "Satuan imajiner", formula: "i^2 = -1" },
      reason: "Suku tanpa i membentuk bagian real; koefisien i membentuk bagian imajiner.",
    });
  }
  const mod = pow(add(pow(re, num(2)), pow(im, num(2))), num(0.5));
  const rv = evalComplex(re).re;
  const iv = evalComplex(im).re;
  let arg: Expr;
  if (rv === 0 && iv === 0) arg = ZERO;
  else if (rv > 0) arg = fn("atan", div(im, re));
  else if (rv < 0)
    arg = iv >= 0 ? add(fn("atan", div(im, re)), PI) : sub(fn("atan", div(im, re)), PI);
  else arg = iv > 0 ? div(PI, num(2)) : neg(div(PI, num(2)));
  const sq = (q: Expr) =>
    q.type === "num" && !q.value.isNegative()
      ? `${toLatex(q)}^{2}`
      : `\\left(${toLatex(q)}\\right)^{2}`;
  steps.push({
    title: "Hitung modulus",
    after: `|z| = \\sqrt{${sq(re)} + ${sq(im)}} = ${toLatex(mod)}`,
    operation: "modulus",
    rule: { id: "modulus", name: "Modulus", formula: "|a + bi| = \\sqrt{a^2 + b^2}" },
    reason: "Jarak z ke titik asal pada bidang kompleks.",
  });
  steps.push({
    title: "Hitung argumen (sudut)",
    after: `\\arg z = ${toLatex(arg)} \\approx ${formatNumber(Math.atan2(iv, rv), 8)}\\ \\text{rad}`,
    operation: "argument",
    rule: {
      id: "argument",
      name: "Argumen utama",
      formula: "\\arg z = \\operatorname{atan2}(b, a) \\in (-\\pi, \\pi]",
    },
    reason: "Sudut diukur dari sumbu real positif; kuadran ditentukan dari tanda a dan b.",
  });
  const answers: Answer[] = [
    { ...exactAnswer(z), label: "Bentuk a + bi" },
    { ...exactAnswer(re), label: "Re(z)" },
    { ...exactAnswer(im), label: "Im(z)" },
    { ...exactAnswer(mod), label: "|z|" },
    { ...exactAnswer(arg), label: "arg(z)" },
    { ...exactAnswer(conjugate(z)), label: "Sekawan z̄" },
    {
      label: "Bentuk polar",
      latex: `${toLatex(mod)}\\left(\\cos\\left(${toLatex(arg)}\\right) + i\\sin\\left(${toLatex(arg)}\\right)\\right) = ${toLatex(mod)}\\,e^{i\\,${toLatex(arg)}}`,
      text: `${toText(mod)}·(cos(${toText(arg)}) + i·sin(${toText(arg)}))`,
      exact: true,
    },
  ];
  if (numericOnly) for (const a of answers) a.exact = false;
  const res = evalComplex(z);
  const checks = [
    {
      description: numericOnly
        ? "Evaluasi numerik kompleks (satu-satunya metode yang tersedia)"
        : "Evaluasi numerik kompleks independen dari soal asli",
      latex: `${formatComplex(orig.re, orig.im, 12)} \\approx ${formatComplex(res.re, res.im, 12)}`,
      passed: complexApproxEqual(orig, res, 1e-9, 1e-12),
      method: "Aritmetika kompleks floating-point",
    },
    {
      description: "Bentuk polar kembali ke a + bi",
      passed: complexApproxEqual(
        {
          re: evalComplex(mod).re * Math.cos(evalComplex(arg).re),
          im: evalComplex(mod).re * Math.sin(evalComplex(arg).re),
        },
        res,
        1e-9,
        1e-12,
      ),
      method: "Evaluasi numerik",
    },
  ];
  return makeSolution({
    kind: "complex",
    title: "Bilangan kompleks",
    input,
    inputLatex: syntaxToLatex(node),
    answers,
    method: {
      name: "Aljabar bilangan kompleks",
      description:
        "Operasikan seperti aljabar biasa dengan i² = −1; bagi dengan mengalikan sekawan penyebut.",
    },
    steps,
    verification: aggregateVerification(checks),
    module: "complex",
    notes: warnings,
    plot: {
      kind: "scatter",
      variable: "x",
      functions: [],
      points: [{ x: rv, y: iv, label: "z" }],
      xRange: [Math.min(-1, rv) - 1, Math.max(1, rv) + 1],
      yRange: [Math.min(-1, iv) - 1, Math.max(1, iv) + 1],
    },
    references: [REFERENCES.openstaxAlgebra],
  });
}
