/**
 * Complex number arithmetic with steps: bring an expression containing i into the
 * form a + bi (conjugate multiplication for division, i² = −1), then compute modulus,
 * argument, conjugate and polar/exponential forms.
 */
import { MathError } from "../core/errors";
import { evalComplex, complexApproxEqual } from "../expr/evaluate";
import { expand, numerDenom } from "../expr/expand";
import { toLatex, toText } from "../expr/print";
import { add, div, fn, mul, neg, num, pow, sub, substitute, I, PI, ZERO } from "../expr/simplify";
import { containsSymbol, freeSymbols, type Expr } from "../expr/types";
import { syntaxToLatex } from "../parse/print-syntax";
import type { SNode } from "../parse/syntax";
import { toExpr } from "../parse/convert";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification, exactAnswer, formatComplex, formatNumber } from "../steps/format";
import type { Answer, Solution, Step } from "../steps/types";

/** Split an expanded expression into real and imaginary parts (coefficients of i). */
export function realImag(e: Expr): { re: Expr; im: Expr } {
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

export function solveComplex(input: string, node: SNode, warnings: string[] = []): Solution {
  const e = toExpr(node);
  if (freeSymbols(e).size > 0) throw new MathError("unsupported", "Kalkulator bilangan kompleks hanya untuk ekspresi numerik.", { module: "complex" });
  const steps: Step[] = [];
  let work = e;
  const { numer, denom } = numerDenom(e);
  if (containsSymbol(denom, "i")) {
    const conj = conjugate(denom);
    const newNum = expand(mul(numer, conj));
    const newDen = expand(mul(denom, conj));
    steps.push({ title: "Kalikan pembilang dan penyebut dengan sekawan penyebut", before: `\\frac{${toLatex(numer)}}{${toLatex(denom)}}`, after: `\\frac{${toLatex(numer)}}{${toLatex(denom)}} \\cdot \\frac{${toLatex(conj)}}{${toLatex(conj)}} = \\frac{${toLatex(newNum)}}{${toLatex(newDen)}}`, operation: "conjugate", rule: { id: "complex-division", name: "Pembagian bilangan kompleks", formula: "\\frac{a + bi}{c + di} = \\frac{(a + bi)(c - di)}{c^2 + d^2}" }, reason: "(c + di)(c − di) = c² + d² adalah bilangan real, sehingga i hilang dari penyebut." });
    work = div(newNum, newDen);
  }
  const { re, im } = realImag(work);
  const z = add(re, mul(im, I));
  steps.push({ title: "Jabarkan dan gunakan i² = −1, lalu kelompokkan bagian real dan imajiner", after: toLatex(z), operation: "collect", rule: { id: "i-squared", name: "Satuan imajiner", formula: "i^2 = -1" }, reason: "Suku tanpa i membentuk bagian real; koefisien i membentuk bagian imajiner." });
  const mod = pow(add(pow(re, num(2)), pow(im, num(2))), num(0.5));
  const rv = evalComplex(re).re;
  const iv = evalComplex(im).re;
  let arg: Expr;
  if (rv === 0 && iv === 0) arg = ZERO;
  else if (rv > 0) arg = fn("atan", div(im, re));
  else if (rv < 0) arg = iv >= 0 ? add(fn("atan", div(im, re)), PI) : sub(fn("atan", div(im, re)), PI);
  else arg = iv > 0 ? div(PI, num(2)) : neg(div(PI, num(2)));
  const sq = (q: Expr) => (q.type === "num" && !q.value.isNegative() ? `${toLatex(q)}^{2}` : `\\left(${toLatex(q)}\\right)^{2}`);
  steps.push({ title: "Hitung modulus", after: `|z| = \\sqrt{${sq(re)} + ${sq(im)}} = ${toLatex(mod)}`, operation: "modulus", rule: { id: "modulus", name: "Modulus", formula: "|a + bi| = \\sqrt{a^2 + b^2}" }, reason: "Jarak z ke titik asal pada bidang kompleks." });
  steps.push({ title: "Hitung argumen (sudut)", after: `\\arg z = ${toLatex(arg)} \\approx ${formatNumber(Math.atan2(iv, rv), 8)}\\ \\text{rad}`, operation: "argument", rule: { id: "argument", name: "Argumen utama", formula: "\\arg z = \\operatorname{atan2}(b, a) \\in (-\\pi, \\pi]" }, reason: "Sudut diukur dari sumbu real positif; kuadran ditentukan dari tanda a dan b." });
  const answers: Answer[] = [
    { ...exactAnswer(z), label: "Bentuk a + bi" },
    { ...exactAnswer(re), label: "Re(z)" },
    { ...exactAnswer(im), label: "Im(z)" },
    { ...exactAnswer(mod), label: "|z|" },
    { ...exactAnswer(arg), label: "arg(z)" },
    { ...exactAnswer(conjugate(z)), label: "Sekawan z̄" },
    { label: "Bentuk polar", latex: `${toLatex(mod)}\\left(\\cos\\left(${toLatex(arg)}\\right) + i\\sin\\left(${toLatex(arg)}\\right)\\right) = ${toLatex(mod)}\\,e^{i\\,${toLatex(arg)}}`, text: `${toText(mod)}·(cos(${toText(arg)}) + i·sin(${toText(arg)}))`, exact: true },
  ];
  const orig = evalComplex(e);
  const res = evalComplex(z);
  const checks = [
    { description: "Evaluasi numerik kompleks independen dari soal asli", latex: `${formatComplex(orig.re, orig.im, 12)} \\approx ${formatComplex(res.re, res.im, 12)}`, passed: complexApproxEqual(orig, res, 1e-9, 1e-12), method: "Aritmetika kompleks floating-point" },
    { description: "Bentuk polar kembali ke a + bi", passed: complexApproxEqual({ re: evalComplex(mod).re * Math.cos(evalComplex(arg).re), im: evalComplex(mod).re * Math.sin(evalComplex(arg).re) }, res, 1e-9, 1e-12), method: "Evaluasi numerik" },
  ];
  return makeSolution({
    kind: "complex",
    title: "Bilangan kompleks",
    input,
    inputLatex: syntaxToLatex(node),
    answers,
    method: { name: "Aljabar bilangan kompleks", description: "Operasikan seperti aljabar biasa dengan i² = −1; bagi dengan mengalikan sekawan penyebut." },
    steps,
    verification: aggregateVerification(checks),
    module: "complex",
    notes: warnings,
    plot: { kind: "scatter", variable: "x", functions: [], points: [{ x: rv, y: iv, label: "z" }], xRange: [Math.min(-1, rv) - 1, Math.max(1, rv) + 1], yRange: [Math.min(-1, iv) - 1, Math.max(1, iv) + 1] },
    references: [REFERENCES.openstaxAlgebra],
  });
}
