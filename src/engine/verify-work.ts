/**
 * "Verifikasi Pekerjaan Saya": check a user's own solution line by line.
 *
 * - Expressions (simplify/expand/factor/arithmetic): every line must be equivalent to the
 *   original expression (symbolic check, then deterministic numeric sampling).
 * - Equations: every line must have the same solution set as the original equation;
 *   lost solutions (e.g. dividing by an expression that can be zero) and extraneous
 *   solutions (e.g. squaring both sides) are diagnosed.
 * - Derivatives: every line after the problem must equal the true derivative.
 * - Indefinite integrals: every line must be an antiderivative (its derivative equals the
 *   integrand); "+ C" is allowed.
 */
import { withBudget } from "./core/budget";
import { isMathError, toSerializedError } from "./core/errors";
import { checkEquivalent } from "./expr/equivalence";
import { evalComplex, evalReal } from "./expr/evaluate";
import { toLatex } from "./expr/print";
import { containsSymbol, freeSymbols } from "./expr/types";
import { parse } from "./parse/parser";
import { toExpr } from "./parse/convert";
import { syntaxToLatex } from "./parse/print-syntax";
import type { SNode } from "./parse/syntax";
import { differentiate } from "./calculus/derivative";
import { chooseVariable, solveCore, type EqRoot } from "./solvers/equation";
import { PERIOD_SYMBOL } from "./solvers/isolate";
import { formatNumber } from "./steps/format";

export type LineStatus = "ok" | "error" | "unparseable" | "unchecked";

export interface LineCheck {
  index: number;
  input: string;
  latex?: string;
  status: LineStatus;
  message: string;
  detail?: string;
}

export interface WorkCheckResult {
  mode: "expression" | "equation" | "derivative" | "integral";
  problemLatex: string;
  lines: LineCheck[];
  firstError: number | null;
  summary: string;
  finalCorrect: boolean;
}

interface SolutionSet {
  all: boolean;
  values: number[];
  periodic: boolean;
}

function rootValue(r: EqRoot): number | null {
  if (r.periodic) return null;
  if (r.expr) {
    if (containsSymbol(r.expr, "i")) return null;
    const v = evalReal(r.expr);
    return Number.isFinite(v) ? v : null;
  }
  if (r.approx && Math.abs(r.approx.im) < 1e-12) return r.approx.re;
  return null;
}

function solutionSet(nodes: SNode[], x: string): SolutionSet {
  const values: number[] = [];
  let all = false;
  let periodic = false;
  for (const n of nodes) {
    if (n.k !== "rel" || n.ops.length !== 1 || n.ops[0] !== "=") throw new Error("not-equation");
    const att = solveCore(toExpr(n.operands[0]), toExpr(n.operands[1]), x);
    if (att.status === "all") all = true;
    for (const r of att.roots) {
      if (r.periodic) periodic = true;
      const v = rootValue(r);
      if (v !== null && !values.some((w) => Math.abs(w - v) <= 1e-9 * Math.max(1, Math.abs(v)))) values.push(v);
    }
  }
  return { all, values: values.sort((a, b) => a - b), periodic };
}

function compareSets(ref: SolutionSet, got: SolutionSet): { same: boolean; missing: number[]; extra: number[] } {
  if (ref.all || got.all) return { same: ref.all === got.all, missing: [], extra: [] };
  const has = (arr: number[], v: number) => arr.some((w) => Math.abs(w - v) <= 1e-7 * Math.max(1, Math.abs(v)));
  const missing = ref.values.filter((v) => !has(got.values, v));
  const extra = got.values.filter((v) => !has(ref.values, v));
  return { same: missing.length === 0 && extra.length === 0, missing, extra };
}

/** Split a line like "x = 2 atau x = 3" into separate statements. */
function splitAlternatives(line: string): string {
  return line.replace(/\s+(atau|or|∨|v)\s+/gi, "; ");
}

export function checkWork(problem: string, lines: string[]): WorkCheckResult {
  return withBudget({ timeMs: 8000 }, () => checkWorkInner(problem, lines));
}

function checkWorkInner(problem: string, rawLines: string[]): WorkCheckResult {
  const p = parse(problem);
  const first = p.statements[0];
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  const result: LineCheck[] = [];
  let mode: WorkCheckResult["mode"];
  const problemLatex = p.statements.map((s) => syntaxToLatex(s)).join(",\\ ");

  if (first.k === "deriv") {
    mode = "derivative";
    const f = toExpr(first.expr);
    const x = first.variable || chooseVariable(freeSymbols(f));
    let ref = f;
    for (let k = 0; k < first.order; k++) ref = differentiate(ref, x).value;
    lines.forEach((line, i) => {
      try {
        const n = parse(line).statements[0];
        const e = n.k === "rel" ? toExpr(n.operands[1]) : toExpr(n);
        const eq = checkEquivalent(e, ref);
        result.push({ index: i, input: line, latex: syntaxToLatex(n), status: eq.equivalent ? "ok" : "error", message: eq.equivalent ? "Setara dengan turunan yang benar." : "Tidak sama dengan turunan yang benar.", detail: eq.equivalent ? eq.detail : `${eq.detail} Turunan yang benar: ${toLatex(ref)}.` });
      } catch (e) {
        result.push({ index: i, input: line, status: "unparseable", message: "Baris tidak dapat dibaca.", detail: isMathError(e) ? e.message : String(e) });
      }
    });
  } else if (first.k === "integral" && !first.lower) {
    mode = "integral";
    const f = toExpr(first.expr);
    const x = first.variable || chooseVariable(freeSymbols(f));
    lines.forEach((line, i) => {
      try {
        const n = parse(line.replace(/\+\s*C\s*$/i, "").replace(/\+\s*c\s*$/, "")).statements[0];
        if (n.k === "integral") {
          if (n.variable && n.variable !== x) {
            result.push({ index: i, input: line, latex: syntaxToLatex(n), status: "unchecked", message: `Integral dalam variabel ${n.variable} (langkah substitusi).`, detail: "Langkah substitusi tidak dapat dibandingkan langsung; periksa hasil akhirnya dalam variabel semula." });
            return;
          }
          const eq = checkEquivalent(toExpr(n.expr), f);
          result.push({ index: i, input: line, latex: syntaxToLatex(n), status: eq.equivalent ? "ok" : "error", message: eq.equivalent ? "Integran ditulis ulang secara setara." : "Integran berubah nilainya.", detail: eq.detail });
          return;
        }
        const F = n.k === "rel" ? toExpr(n.operands[1]) : toExpr(n);
        const dF = differentiate(F, x).value;
        const eq = checkEquivalent(dF, f);
        result.push({ index: i, input: line, latex: syntaxToLatex(n), status: eq.equivalent ? "ok" : "error", message: eq.equivalent ? "Turunan baris ini sama dengan integran: antiturunan benar." : "Turunan baris ini tidak sama dengan integran.", detail: eq.equivalent ? eq.detail : `d/d${x} baris ini = ${toLatex(dF)}; seharusnya ${toLatex(f)}.` });
      } catch (e) {
        result.push({ index: i, input: line, status: "unparseable", message: "Baris tidak dapat dibaca.", detail: isMathError(e) ? e.message : String(e) });
      }
    });
  } else if (first.k === "rel" && p.statements.length === 1 && first.ops.length === 1 && first.ops[0] === "=") {
    mode = "equation";
    const vars = new Set([...freeSymbols(toExpr(first.operands[0])), ...freeSymbols(toExpr(first.operands[1]))]);
    const x = chooseVariable(vars);
    const ref = solutionSet([first], x);
    lines.forEach((line, i) => {
      try {
        const statements = parse(splitAlternatives(line)).statements;
        const got = solutionSet(statements, x);
        const cmp = compareSets(ref, got);
        const latex = statements.map((s) => syntaxToLatex(s)).join(" \\lor ");
        if (cmp.same) {
          result.push({ index: i, input: line, latex, status: "ok", message: "Himpunan penyelesaian tetap sama.", detail: ref.periodic ? "Solusi periodik dibandingkan pada nilai-nilai utama." : `HP = {${ref.values.map((v) => formatNumber(v, 8)).join(", ")}}` });
        } else {
          const parts: string[] = [];
          if (cmp.missing.length) parts.push(`kehilangan solusi ${cmp.missing.map((v) => `${x} = ${formatNumber(v, 8)}`).join(", ")} (misalnya karena membagi dengan ekspresi yang bisa bernilai nol, atau lupa tanda ± saat menarik akar)`);
          if (cmp.extra.length) parts.push(`muncul solusi baru ${cmp.extra.map((v) => `${x} = ${formatNumber(v, 8)}`).join(", ")} yang tidak memenuhi persamaan awal (misalnya akibat mengkuadratkan kedua ruas atau salah operasi)`);
          if (!parts.length) parts.push("kedua persamaan tidak setara");
          result.push({ index: i, input: line, latex, status: "error", message: "Langkah ini mengubah himpunan penyelesaian.", detail: `Baris ini ${parts.join("; ")}.` });
        }
      } catch (e) {
        if (e instanceof Error && e.message === "not-equation") {
          result.push({ index: i, input: line, status: "unchecked", message: "Baris bukan persamaan; tidak dapat dibandingkan.", detail: "Tulis setiap langkah dalam bentuk persamaan (… = …)." });
        } else result.push({ index: i, input: line, status: "unparseable", message: "Baris tidak dapat dibaca atau diselesaikan.", detail: isMathError(e) ? e.message : String(e) });
      }
    });
  } else {
    mode = "expression";
    const ref = toExpr(first.k === "rel" ? first.operands[0] : first);
    lines.forEach((line, i) => {
      try {
        const n = parse(line).statements[0];
        const e = n.k === "rel" ? toExpr(n.operands[n.operands.length - 1]) : toExpr(n);
        const eq = checkEquivalent(e, ref);
        let detail = eq.detail;
        if (!eq.equivalent && eq.counterexample) {
          const env = eq.counterexample;
          const a = evalComplex(e, env);
          const b = evalComplex(ref, env);
          detail = `Pada ${Object.entries(env).map(([k, v]) => `${k} = ${v.toPrecision(4)}`).join(", ") || "evaluasi"}: baris ini bernilai ${formatNumber(a.re, 8)}, sedangkan soal bernilai ${formatNumber(b.re, 8)}.`;
        }
        result.push({ index: i, input: line, latex: syntaxToLatex(n), status: eq.equivalent ? "ok" : eq.method === "inconclusive" ? "unchecked" : "error", message: eq.equivalent ? (eq.method === "symbolic" ? "Setara (terbukti simbolik)." : "Setara (diuji numerik).") : eq.method === "inconclusive" ? "Tidak dapat dipastikan." : "Tidak setara dengan soal.", detail });
      } catch (e) {
        result.push({ index: i, input: line, status: "unparseable", message: "Baris tidak dapat dibaca.", detail: isMathError(e) ? e.message : String(e) });
      }
    });
  }
  const firstErrorLine = result.find((r) => r.status === "error");
  const finalCorrect = result.length > 0 && result[result.length - 1].status === "ok";
  const okCount = result.filter((r) => r.status === "ok").length;
  const summary = firstErrorLine
    ? `Kesalahan pertama ada di langkah ${firstErrorLine.index + 1}. ${okCount} dari ${result.length} langkah benar.`
    : result.length === 0
      ? "Belum ada langkah untuk diperiksa."
      : result.every((r) => r.status === "ok")
        ? `Semua ${result.length} langkah benar.`
        : `${okCount} dari ${result.length} langkah terverifikasi; sebagian tidak dapat diperiksa.`;
  return { mode, problemLatex, lines: result, firstError: firstErrorLine ? firstErrorLine.index : null, summary, finalCorrect };
}

export function safeCheckWork(problem: string, lines: string[]): { ok: true; result: WorkCheckResult } | { ok: false; error: ReturnType<typeof toSerializedError> } {
  try {
    return { ok: true, result: checkWork(problem, lines) };
  } catch (e) {
    return { ok: false, error: toSerializedError(e, "verify-work") };
  }
}

export { PERIOD_SYMBOL };
