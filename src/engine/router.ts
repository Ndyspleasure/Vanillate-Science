/**
 * Problem analyzer and top-level method selector.
 *
 * Maps free-form input (ASCII/Unicode math, optional Indonesian/English command words)
 * to the appropriate solver. Deterministic: the same input always takes the same path.
 */
import { withBudget } from "./core/budget";
import { invalidInput, MathError, toSerializedError, type SerializedMathError } from "./core/errors";
import { Rational } from "./core/rational";
import { freeSymbols, containsSymbol, type Expr } from "./expr/types";
import { parse } from "./parse/parser";
import { toExpr } from "./parse/convert";
import { syntaxToLatex } from "./parse/print-syntax";
import type { SNode } from "./parse/syntax";
import type { Solution } from "./steps/types";
import { isArithmetic, solveArithmetic } from "./solvers/arithmetic";
import { solveEvaluateAt, solveExpand, solveFactor, solveSimplify } from "./solvers/algebra";
import { solveEquation } from "./solvers/equation";
import { solveInequality } from "./solvers/inequality";
import { solveSystem } from "./solvers/system";
import { solveComplex } from "./solvers/complex";
import { solveDivisors, solveGcdLcm, solveIsPrime, solveModInverse, solveModPow, solvePrimeFactorization } from "./solvers/numbertheory";
import { solveDerivative, solveExtrema, solveImplicit, solveIntegral, solveLimit, solveTaylor } from "./calculus/solvers";
import { containsList, solveMatrixProblem } from "./linalg/solver";
import { solveDescriptive, solveRegression } from "./stats/descriptive";

export type Mode = "auto" | "simplify" | "expand" | "factor" | "derivative" | "integral" | "extrema" | "taylor" | "isprime" | "divisors" | "statistics";

export interface SolveOptions {
  mode?: Mode;
  variable?: string;
  /** Time budget in milliseconds. */
  timeMs?: number;
}

export type SolveOutcome = { ok: true; solution: Solution } | { ok: false; error: SerializedMathError; input: string };

const PREFIXES: Array<[RegExp, Mode]> = [
  [/^(sederhanakan|simplify|simplifikasi|sederhana)\b[:\s]*/i, "simplify"],
  [/^(jabarkan|expand|uraikan|ekspansi|kalikan)\b[:\s]*/i, "expand"],
  [/^(faktorkan|factor|faktorisasi|factorize|faktor)\b[:\s]*/i, "factor"],
  [/^(turunan|turunkan|derivative|derive|diferensialkan|differentiate)\b(\s+(dari|of))?[:\s]*/i, "derivative"],
  [/^(integralkan|integrate|antiturunan|integral\s+dari|integral\s+of)\b[:\s]*/i, "integral"],
  [/^(titik\s+kritis|titik\s+stasioner|nilai\s+ekstrem|ekstrem|extrema|maksimum\s+dan\s+minimum)\b(\s+(dari|of))?[:\s]*/i, "extrema"],
  [/^(deret\s+taylor|deret\s+maclaurin|taylor|maclaurin)\b(\s+(dari|of))?[:\s]*/i, "taylor"],
  [/^(apakah\s+prima|uji\s+prima|is\s+prime|prima\??)\b[:\s]*/i, "isprime"],
  [/^(pembagi|faktor\s+dari|divisors)\b[:\s]*/i, "divisors"],
  [/^(statistik|statistika|data|rata-rata|mean)\b[:\s]*/i, "statistics"],
  [/^(selesaikan|solve|hitung|tentukan|cari|berapa|evaluate|compute|calculate)\b[:\s]*/i, "auto"],
];

function preprocess(input: string, options: SolveOptions): { text: string; mode: Mode; variable?: string } {
  let text = input.trim();
  let mode: Mode = options.mode ?? "auto";
  let variable = options.variable;
  for (let pass = 0; pass < 2; pass++) {
    for (const [re, m] of PREFIXES) {
      const match = re.exec(text);
      const usedAsCall = match !== null && text.slice(match[1].length).startsWith("(");
      if (match && !usedAsCall && match[0].length < text.length) {
        text = text.slice(match[0].length).trim();
        if (m !== "auto") mode = m;
        break;
      }
    }
  }
  const suffix = /\s+(for|untuk|terhadap|wrt|dalam)\s+([A-Za-z](?:_?[A-Za-z0-9]+)?)\s*\.?$/i.exec(text);
  if (suffix) {
    variable = variable ?? suffix[2];
    text = text.slice(0, suffix.index).trim();
  }
  return { text, mode, variable };
}

function isIntegerLiteral(n: SNode): n is SNode & { k: "num" } {
  return n.k === "num" && n.value.isInteger();
}

function integerArg(n: SNode | undefined, what: string): bigint {
  if (!n) throw invalidInput(`Argumen ${what} tidak ada.`, { module: "router" });
  const e = toExpr(n);
  if (e.type !== "num" || !e.value.isInteger()) throw invalidInput(`${what} harus bilangan bulat.`, { module: "router" });
  return e.value.num;
}

function numericValue(n: SNode): Rational | null {
  try {
    const e = toExpr(n);
    return e.type === "num" ? e.value : null;
  } catch {
    return null;
  }
}

function variableOf(n: SNode | undefined): string | undefined {
  if (!n) return undefined;
  return n.k === "sym" ? n.name : undefined;
}

function dispatchCall(input: string, node: SNode & { k: "call" }, warnings: string[], variable?: string): Solution | null {
  const a = node.args;
  switch (node.name) {
    case "det":
    case "inv":
    case "inverse":
    case "invers":
    case "transpose":
    case "rank":
    case "rref":
    case "trace":
    case "eigen":
    case "eigenvalues":
    case "eigenvectors":
    case "dot":
    case "cross":
    case "norm":
      return solveMatrixProblem(input, node, warnings);
    case "diff":
    case "derivative":
    case "turunan": {
      const f = toExpr(a[0]);
      const v = variableOf(a[1]) ?? variable;
      const order = a[2] ? Number(integerArg(a[2], "Orde turunan")) : 1;
      return solveDerivative(input, f, syntaxToLatex(node), { variable: v, order, warnings });
    }
    case "integrate":
    case "integral":
    case "int": {
      const f = toExpr(a[0]);
      const v = variableOf(a[1]) ?? variable;
      const lower = a[2] ? toExpr(a[2], { allowInfinity: true }) : undefined;
      const upper = a[3] ? toExpr(a[3], { allowInfinity: true }) : undefined;
      return solveIntegral(input, f, syntaxToLatex(node), { variable: v, lower, upper, warnings });
    }
    case "limit":
    case "lim": {
      const f = toExpr(a[0]);
      const v = variableOf(a[1]) ?? "x";
      const to = toExpr(a[2] ?? { k: "num", value: Rational.ZERO, text: "0", span: node.span }, { allowInfinity: true });
      return solveLimit(input, f, v, to, undefined, syntaxToLatex(node), warnings);
    }
    case "taylor":
    case "series": {
      const f = toExpr(a[0]);
      const v = variableOf(a[1]) ?? variable;
      const center = a[2] ? toExpr(a[2]) : toExpr({ k: "num", value: Rational.ZERO, text: "0", span: node.span });
      const order = a[3] ? Number(integerArg(a[3], "Orde")) : 5;
      return solveTaylor(input, f, v, center, order, warnings);
    }
    case "solve": {
      const target = a[0];
      const v = variableOf(a[1]) ?? variable;
      if (target.k === "rel") return target.ops.length === 1 && target.ops[0] === "=" ? solveEquation(input, target, { variable: v, warnings }) : solveInequality(input, target, { variable: v, warnings });
      if (target.k === "list") return solveSystem(input, target.items, warnings);
      return solveEquation(input, { k: "rel", ops: ["="], operands: [target, { k: "num", value: Rational.ZERO, text: "0", span: node.span }], span: node.span }, { variable: v, warnings });
    }
    case "simplify":
      return solveSimplify(input, a[0], warnings);
    case "expand":
      return solveExpand(input, a[0], warnings);
    case "factor":
      if (a[0] && isIntegerLiteral(a[0])) return solvePrimeFactorization(input, a[0].value.num);
      return solveFactor(input, a[0], warnings);
    case "gcd":
    case "lcm":
    case "fpb":
    case "kpk":
      if (a.length >= 2 && a.every(isIntegerLiteralOrNeg)) return solveGcdLcm(input, node.name === "gcd" || node.name === "fpb" ? "gcd" : "lcm", a.map((x) => integerArg(x, "Argumen")));
      return null;
    case "isprime":
      return solveIsPrime(input, integerArg(a[0], "Bilangan"));
    case "primefactors":
      return solvePrimeFactorization(input, integerArg(a[0], "Bilangan"));
    case "divisors":
      return solveDivisors(input, integerArg(a[0], "Bilangan"));
    case "modinv":
      return solveModInverse(input, integerArg(a[0], "a"), integerArg(a[1], "m"));
    case "modpow":
      return solveModPow(input, integerArg(a[0], "a"), integerArg(a[1], "eksponen"), integerArg(a[2], "m"));
    case "mean":
    case "median":
    case "mode":
    case "variance":
    case "stdev": {
      const vals = a.flatMap((x) => (x.k === "list" ? x.items : [x])).map(numericValue);
      if (vals.some((v) => v === null)) throw invalidInput("Data statistik harus berupa angka.", { module: "router" });
      return solveDescriptive(input, vals as Rational[], warnings);
    }
    case "extrema":
      return solveExtrema(input, toExpr(a[0]), variableOf(a[1]) ?? variable, warnings);
    case "implicit": {
      const r = a[0];
      if (r.k !== "rel" || r.ops[0] !== "=") throw invalidInput("implicit() membutuhkan persamaan, misalnya implicit(x^2 + y^2 = 25).", { module: "router" });
      return solveImplicit(input, toExpr(r.operands[0]), toExpr(r.operands[1]), variableOf(a[1]) ?? "x", variableOf(a[2]) ?? "y", warnings);
    }
  }
  return null;
}

function isIntegerLiteralOrNeg(n: SNode): boolean {
  if (isIntegerLiteral(n)) return true;
  return n.k === "neg" && isIntegerLiteral(n.arg);
}

function tupleNumbers(n: SNode): Rational[] | null {
  if (n.k !== "list" || n.bracket !== "(" || n.items.length !== 2) return null;
  const vals = n.items.map(numericValue);
  return vals.every((v) => v !== null) ? (vals as Rational[]) : null;
}

function route(input: string, options: SolveOptions): Solution {
  const { text, mode, variable } = preprocess(input, options);
  if (!text) throw invalidInput("Input kosong.", { module: "router", hint: "Masukkan soal, misalnya 2x + 5 = 15." });
  const parsed = parse(text);
  const warnings = parsed.warnings;
  const st = parsed.statements;

  if (st.length > 1) {
    // regression: list of (x, y) pairs
    const pairs = st.map(tupleNumbers);
    if (pairs.every((p) => p !== null)) {
      return solveRegression(input, pairs.map((p) => p![0]), pairs.map((p) => p![1]), warnings);
    }
    // statistics: list of numbers
    const nums = st.map(numericValue);
    if (nums.every((v) => v !== null)) return solveDescriptive(input, nums as Rational[], warnings);
    // expression evaluated at given values: "x^2 + 1, x = 3"
    const [first, ...rest] = st;
    if (first.k !== "rel" && rest.every((r) => r.k === "rel" && r.ops.length === 1 && r.ops[0] === "=" && r.operands[0].k === "sym")) {
      const values: Record<string, Expr> = {};
      for (const r of rest as Array<SNode & { k: "rel" }>) values[(r.operands[0] as { name: string }).name] = toExpr(r.operands[1]);
      if (Object.values(values).every((v) => freeSymbols(v).size === 0)) return solveEvaluateAt(input, first, values, warnings);
    }
    if (st.every((s) => s.k === "rel")) return solveSystem(input, st, warnings);
    throw invalidInput("Input berisi beberapa bagian yang tidak dapat ditafsirkan bersama.", {
      module: "router",
      hint: "Untuk sistem persamaan, pisahkan persamaan dengan koma atau titik koma. Untuk data statistik, masukkan angka yang dipisahkan koma.",
    });
  }

  const node = st[0];
  if (mode === "statistics" && node.k === "list") {
    const vals = node.items.map(numericValue);
    if (vals.every((v) => v !== null)) return solveDescriptive(input, vals as Rational[], warnings);
  }
  switch (node.k) {
    case "deriv": {
      const f = toExpr(node.expr);
      return solveDerivative(input, f, syntaxToLatex(node), { variable: node.variable || variable, order: node.order, warnings });
    }
    case "integral": {
      const f = toExpr(node.expr);
      const lower = node.lower ? toExpr(node.lower, { allowInfinity: true }) : undefined;
      const upper = node.upper ? toExpr(node.upper, { allowInfinity: true }) : undefined;
      return solveIntegral(input, f, syntaxToLatex(node), { variable: node.variable || variable, lower, upper, warnings });
    }
    case "limit": {
      const f = toExpr(node.expr);
      const to = toExpr(node.to, { allowInfinity: true });
      return solveLimit(input, f, node.variable, to, node.direction, syntaxToLatex(node), warnings);
    }
    case "rel":
      if (node.ops.length === 1 && node.ops[0] === "=") return solveEquation(input, node, { variable, warnings });
      return solveInequality(input, node, { variable, warnings });
    case "call": {
      const r = dispatchCall(input, node, warnings, variable);
      if (r) return r;
      break;
    }
    case "list": {
      const nums = node.items.map(numericValue);
      if (nums.length > 1 && nums.every((v) => v !== null) && node.bracket !== "(" && mode === "statistics") return solveDescriptive(input, nums as Rational[], warnings);
      return solveMatrixProblem(input, node, warnings);
    }
  }
  if (containsList(node)) return solveMatrixProblem(input, node, warnings);

  // Expression
  let e: Expr;
  try {
    e = toExpr(node);
  } catch (err) {
    throw err;
  }
  const vars = freeSymbols(e);
  switch (mode) {
    case "derivative":
      return solveDerivative(input, e, "", { variable, warnings });
    case "integral":
      return solveIntegral(input, e, "", { variable, warnings });
    case "extrema":
      return solveExtrema(input, e, variable, warnings);
    case "taylor":
      return solveTaylor(input, e, variable, toExpr({ k: "num", value: Rational.ZERO, text: "0", span: node.span }), 5, warnings);
    case "isprime":
      if (e.type === "num" && e.value.isInteger()) return solveIsPrime(input, e.value.num);
      break;
    case "divisors":
      if (e.type === "num" && e.value.isInteger()) return solveDivisors(input, e.value.num);
      break;
    case "factor":
      if (isIntegerLiteral(node) || (e.type === "num" && e.value.isInteger() && vars.size === 0 && isArithmetic(node))) {
        if (e.type === "num") return solvePrimeFactorization(input, e.value.num);
      }
      return solveFactor(input, node, warnings);
    case "expand":
      return solveExpand(input, node, warnings);
    case "simplify":
      return solveSimplify(input, node, warnings);
  }
  if (vars.size === 0) {
    if (containsSymbol(e, "i")) return solveComplex(input, node, warnings);
    if (isArithmetic(node)) return solveArithmetic(input, node, warnings);
    return solveSimplify(input, node, warnings);
  }
  return solveSimplify(input, node, warnings);
}

/** Solve a problem. Never throws: failures are returned as structured errors. */
export function solve(input: string, options: SolveOptions = {}): SolveOutcome {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const solution = withBudget({ timeMs: options.timeMs ?? 6000 }, () => route(input, options));
    solution.meta.durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - start);
    return { ok: true, solution };
  } catch (e) {
    return { ok: false, error: toSerializedError(e, "router"), input };
  }
}

export { MathError };
