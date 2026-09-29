/**
 * Systems of equations.
 *
 * Linear systems: Gauss–Jordan elimination on the augmented matrix (exact), with
 * detection of inconsistent systems and parametric solutions; alternative methods:
 * substitution/elimination (2×2) and Cramer's rule (square, det ≠ 0).
 * Nonlinear 2×2 systems: substitution when one equation is linear in some variable.
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { expand } from "../expr/expand";
import { polyCoefficients } from "../expr/polynomial";
import { toLatex, toText } from "../expr/print";
import { add, div, mul, num, sub, substituteSymbols, substitute, ZERO } from "../expr/simplify";
import { containsSymbol, freeSymbols, rawSym, type Expr } from "../expr/types";
import { isSymbolicallyZero } from "../expr/equivalence";
import { evalComplex } from "../expr/evaluate";
import { toExpr } from "../parse/convert";
import { syntaxToLatex } from "../parse/print-syntax";
import type { SNode } from "../parse/syntax";
import { RMatrix } from "../linalg/matrix";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification, exactAnswer, rationalLatex } from "../steps/format";
import type { Alternative, Answer, Solution, Step, VerificationCheck } from "../steps/types";
import { solveCore } from "./equation";

function orderVars(vars: Set<string>): string[] {
  const pref = ["x", "y", "z", "w", "t", "u", "v"];
  return [...vars].sort((a, b) => {
    const ia = pref.indexOf(a);
    const ib = pref.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a < b ? -1 : 1;
  });
}

/** Coefficients of a linear expression in the given variables, or null if not linear. */
function linearCoefficients(e: Expr, vars: string[]): { coefs: Rational[]; constant: Rational } | null {
  const ex = expand(e);
  const coefs = vars.map(() => Rational.ZERO);
  let constant = Rational.ZERO;
  const terms = ex.type === "add" ? ex.terms : [ex];
  for (const t of terms) {
    if (t.type === "num") {
      constant = constant.add(t.value);
      continue;
    }
    const factors = t.type === "mul" ? t.factors : [t];
    let c = Rational.ONE;
    let v: string | null = null;
    for (const f of factors) {
      if (f.type === "num") c = c.mul(f.value);
      else if (f.type === "sym" && vars.includes(f.name) && v === null) v = f.name;
      else return null;
    }
    if (v === null) return null;
    const i = vars.indexOf(v);
    coefs[i] = coefs[i].add(c);
  }
  return { coefs, constant };
}

function equationLatex(coefs: Rational[], vars: string[], rhs: Rational): string {
  const parts: Expr[] = coefs.map((c, i) => mul(num(c), rawSym(vars[i])));
  return `${toLatex(add(...parts))} = ${rationalLatex(rhs)}`;
}

function systemLatex(lines: string[]): string {
  return `\\begin{cases} ${lines.join(" \\\\ ")} \\end{cases}`;
}

function cramer(A: RMatrix, b: Rational[], vars: string[]): Alternative | null {
  if (!A.isSquare || A.rows > 4) return null;
  const D = A.determinant().value;
  if (D.isZero()) return null;
  const steps: Step[] = [{ title: "Hitung determinan matriks koefisien", after: `D = \\det ${A.toLatex()} = ${rationalLatex(D)}`, operation: "det", rule: { id: "cramer", name: "Aturan Cramer", formula: "x_i = \\frac{D_i}{D}" }, reason: "D ≠ 0 sehingga sistem memiliki tepat satu solusi." }];
  const answers: Answer[] = [];
  vars.forEach((v, i) => {
    const Ai = new RMatrix(A.data.map((row, r) => row.map((val, c) => (c === i ? b[r] : val))));
    const Di = Ai.determinant().value;
    const val = Di.div(D);
    steps.push({ title: `Ganti kolom ${i + 1} dengan konstanta`, after: `D_{${toLatex(rawSym(v))}} = \\det ${Ai.toLatex()} = ${rationalLatex(Di)},\\quad ${toLatex(rawSym(v))} = \\frac{${rationalLatex(Di)}}{${rationalLatex(D)}} = ${rationalLatex(val)}`, operation: "cramer-column", reason: `Kolom koefisien ${v} diganti ruas kanan.` });
    answers.push({ label: v, latex: rationalLatex(val), text: val.toString(), exact: true });
  });
  return { name: "Aturan Cramer", description: "Setiap variabel = determinan matriks dengan satu kolom diganti konstanta, dibagi determinan matriks koefisien.", steps, answers };
}

function eliminationAlternative(A: RMatrix, b: Rational[], vars: string[]): Alternative | null {
  if (A.rows !== 2 || A.cols !== 2) return null;
  const [[a1, b1], [a2, b2]] = A.data;
  const [c1, c2] = b;
  const det = a1.mul(b2).sub(a2.mul(b1));
  if (det.isZero() || a1.isZero()) return null;
  const [x, y] = vars;
  // eliminate x: multiply eq1 by a2, eq2 by a1 and subtract
  const yCoef = a1.mul(b2).sub(a2.mul(b1));
  const rhs = a1.mul(c2).sub(a2.mul(c1));
  const yVal = rhs.div(yCoef);
  const xVal = c1.sub(b1.mul(yVal)).div(a1);
  const X = rawSym(x);
  const Y = rawSym(y);
  const steps: Step[] = [
    { title: `Kalikan persamaan (1) dengan ${a2.toString()} dan persamaan (2) dengan ${a1.toString()}`, after: systemLatex([equationLatex([a1.mul(a2), b1.mul(a2)], vars, c1.mul(a2)), equationLatex([a2.mul(a1), b2.mul(a1)], vars, c2.mul(a1))]), operation: "scale-equations", reason: `Agar koefisien ${x} pada kedua persamaan sama.` },
    { title: `Kurangkan kedua persamaan untuk mengeliminasi ${x}`, after: `${toLatex(mul(num(yCoef), Y))} = ${rationalLatex(rhs)}`, operation: "eliminate", rule: { id: "elimination", name: "Metode eliminasi" }, reason: `Suku ${x} saling menghilangkan.` },
    { title: `Selesaikan untuk ${y}`, after: `${toLatex(Y)} = ${rationalLatex(yVal)}`, operation: "solve-y", reason: "Bagi kedua ruas dengan koefisiennya." },
    { title: `Substitusikan ${y} ke persamaan (1)`, after: `${toLatex(add(mul(num(a1), X), num(b1.mul(yVal))))} = ${rationalLatex(c1)} \\Rightarrow ${toLatex(X)} = ${rationalLatex(xVal)}`, operation: "back-substitute", rule: { id: "substitution", name: "Metode substitusi" }, reason: `Nilai ${y} digunakan untuk mencari ${x}.` },
  ];
  return { name: "Eliminasi dan substitusi", description: "Metode sekolah: samakan koefisien satu variabel, kurangkan, lalu substitusi balik.", steps, answers: [{ label: x, latex: rationalLatex(xVal), text: xVal.toString(), exact: true }, { label: y, latex: rationalLatex(yVal), text: yVal.toString(), exact: true }] };
}

export function solveLinearSystem(input: string, eqs: Array<{ L: Expr; R: Expr }>, vars: string[], inputLatex: string, warnings: string[]): Solution | null {
  const rows: Rational[][] = [];
  const b: Rational[] = [];
  for (const { L, R } of eqs) {
    const lc = linearCoefficients(sub(L, R), vars);
    if (!lc) return null;
    rows.push(lc.coefs);
    b.push(lc.constant.neg());
  }
  const A = new RMatrix(rows);
  const aug = new RMatrix(rows.map((r, i) => [...r, b[i]]));
  const n = vars.length;
  const steps: Step[] = [
    { title: "Tulis sistem dalam bentuk standar", after: systemLatex(rows.map((r, i) => equationLatex(r, vars, b[i]))), operation: "standard-form", reason: "Semua variabel di ruas kiri, konstanta di ruas kanan." },
    { title: "Bentuk matriks lengkap (augmented) [A | b]", after: aug.toLatex(n), operation: "augmented-matrix", reason: "Setiap baris mewakili satu persamaan; kolom terakhir adalah konstanta." },
  ];
  const res = aug.rref({ augmentAt: n, record: true, pivotCols: n });
  const opSteps: Step[] = res.ops.map((op) => ({ title: op.description, after: `${op.latex}:\\quad ${op.matrix}`, operation: `row-${op.kind}`, rule: { id: "row-op", name: "Operasi baris elementer", formula: "R_i \\leftrightarrow R_j,\\quad R_i \\leftarrow cR_i,\\quad R_i \\leftarrow R_i + cR_j" }, reason: "Operasi baris elementer tidak mengubah himpunan penyelesaian." }));
  steps.push({ title: "Eliminasi Gauss–Jordan", after: res.matrix.toLatex(n), operation: "gauss-jordan", reason: `${res.ops.length} operasi baris hingga bentuk eselon baris tereduksi.`, substeps: opSteps });
  const M = res.matrix;
  const inconsistent = M.data.some((r) => r.slice(0, n).every((v) => v.isZero()) && !r[n].isZero());
  const answers: Answer[] = [];
  const checks: VerificationCheck[] = [];
  let status: "unique" | "none" | "infinite";
  const freeVars = vars.filter((_, j) => !res.pivots.includes(j));
  let solutionExprs: Record<string, Expr> = {};
  if (inconsistent) {
    status = "none";
    steps.push({ title: "Baris kontradiksi ditemukan", after: "0 = c \\ne 0", operation: "inconsistent", reason: "Terdapat baris [0 … 0 | c] dengan c ≠ 0, sehingga sistem tidak konsisten." });
    answers.push({ label: "Himpunan penyelesaian", latex: "\\varnothing", text: "∅ (sistem tidak konsisten)", exact: true });
    checks.push({ description: "Rank matriks koefisien < rank matriks lengkap", passed: A.rank() < aug.rank(), method: "Teorema Rouché–Capelli" });
  } else {
    const params: Record<string, Expr> = {};
    freeVars.forEach((v, i) => {
      params[v] = rawSym(freeVars.length === 1 ? "t" : `t_${i + 1}`);
    });
    res.pivots.forEach((pc, r) => {
      let e: Expr = num(M.data[r][n]);
      for (const fv of freeVars) {
        const j = vars.indexOf(fv);
        e = sub(e, mul(num(M.data[r][j]), params[fv]));
      }
      solutionExprs[vars[pc]] = e;
    });
    for (const fv of freeVars) solutionExprs[fv] = params[fv];
    status = freeVars.length ? "infinite" : "unique";
    if (freeVars.length) {
      steps.push({ title: "Variabel bebas", after: freeVars.map((v) => `${toLatex(rawSym(v))} = ${toLatex(params[v])}`).join(",\\ "), operation: "free-variables", reason: `Kolom tanpa pivot (${freeVars.join(", ")}) menjadi parameter; sistem memiliki tak hingga banyak solusi.` });
    }
    for (const v of vars) answers.push({ ...exactAnswer(solutionExprs[v], v), label: v });
    if (freeVars.length) answers.push({ label: "Keterangan", latex: `${freeVars.map((_, i) => toLatex(rawSym(freeVars.length === 1 ? "t" : `t_${i + 1}`))).join(", ")} \\in \\mathbb{R}`, text: "parameter bebas bilangan real", exact: true });
    eqs.forEach(({ L, R }, i) => {
      const d = sub(substituteSymbols(L, solutionExprs), substituteSymbols(R, solutionExprs));
      const ok = isSymbolicallyZero(d);
      checks.push({ description: `Substitusi solusi ke persamaan (${i + 1})`, latex: `${toLatex(substituteSymbols(L, solutionExprs))} = ${toLatex(substituteSymbols(R, solutionExprs))}`, passed: ok, method: "Substitusi eksak" });
    });
  }
  const alternatives: Alternative[] = [];
  if (status === "unique") {
    const el = eliminationAlternative(A, b, vars);
    if (el) alternatives.push(el);
    const cr = cramer(A, b, vars);
    if (cr) alternatives.push(cr);
  }
  return makeSolution({
    kind: "system",
    title: `Sistem persamaan linear (${eqs.length} persamaan, ${n} variabel)`,
    input,
    inputLatex,
    answers,
    method: { name: "Eliminasi Gauss–Jordan", description: "Matriks lengkap direduksi dengan operasi baris elementer menjadi bentuk eselon baris tereduksi.", formula: "[A \\mid b] \\sim [\\,\\mathrm{RREF}\\,]" },
    steps,
    verification: aggregateVerification(checks),
    module: "system",
    notes: [...warnings, ...(status === "infinite" ? ["Sistem memiliki tak hingga banyak solusi (bergantung pada parameter)."] : [])],
    alternatives,
    references: [REFERENCES.strang, REFERENCES.openstaxAlgebra],
    plot: vars.length === 2 && eqs.length === 2
      ? {
          kind: "function",
          variable: vars[0],
          functions: eqs
            .map(({ L, R }) => {
              const lc = linearCoefficients(sub(L, R), vars)!;
              if (lc.coefs[1].isZero()) return null;
              const yExpr = div(sub(num(lc.constant.neg()), mul(num(lc.coefs[0]), rawSym(vars[0]))), num(lc.coefs[1]));
              return { expr: toText(yExpr), label: `${vars[1]} = ${toText(yExpr)}` };
            })
            .filter((f): f is { expr: string; label: string } => f !== null),
          points: status === "unique" ? [{ x: evalComplex(solutionExprs[vars[0]]).re, y: evalComplex(solutionExprs[vars[1]]).re, label: "titik potong" }] : [],
        }
      : undefined,
  });
}

function solveNonlinear2(input: string, eqs: Array<{ L: Expr; R: Expr }>, vars: string[], inputLatex: string, warnings: string[]): Solution {
  if (eqs.length !== 2 || vars.length !== 2) {
    throw new MathError("unsupported", "Sistem persamaan nonlinear hanya didukung untuk 2 persamaan dengan 2 variabel.", { module: "system" });
  }
  // find an equation linear in some variable
  for (let i = 0; i < 2; i++) {
    for (const v of vars) {
      const f = sub(eqs[i].L, eqs[i].R);
      const cs = polyCoefficients(f, v);
      if (!cs || cs.length !== 2) continue;
      const other = vars.find((w) => w !== v)!;
      if (containsSymbol(cs[1], other) && !(cs[1].type === "num")) continue;
      if (cs[1].type === "num" && cs[1].value.isZero()) continue;
      const expr = div(sub(ZERO, cs[0]), cs[1]);
      const j = 1 - i;
      const Lsub = substitute(eqs[j].L, rawSym(v), expr);
      const Rsub = substitute(eqs[j].R, rawSym(v), expr);
      const inner = solveCore(Lsub, Rsub, other);
      const steps: Step[] = [
        { title: `Nyatakan ${v} dari persamaan (${i + 1})`, after: `${toLatex(rawSym(v))} = ${toLatex(expr)}`, operation: "isolate", rule: { id: "substitution", name: "Metode substitusi" }, reason: `Persamaan (${i + 1}) linear dalam ${v}.` },
        { title: `Substitusikan ke persamaan (${j + 1})`, after: `${toLatex(Lsub)} = ${toLatex(Rsub)}`, operation: "substitute", reason: `Diperoleh persamaan satu variabel dalam ${other}.` },
        { title: `Selesaikan untuk ${other}`, after: inner.roots.map((r) => `${other} = ${r.expr ? toLatex(r.expr) : r.approx?.re}`).join(",\\ ") || "\\varnothing", operation: "solve", reason: inner.method.name, substeps: inner.steps },
      ];
      const answers: Answer[] = [];
      const checks: VerificationCheck[] = [];
      const pairs: Array<Record<string, Expr>> = [];
      for (const r of inner.roots) {
        if (!r.expr || containsSymbol(r.expr, "i")) continue;
        const vVal = substitute(expr, rawSym(other), r.expr);
        pairs.push({ [v]: vVal, [other]: r.expr });
      }
      steps.push({ title: `Hitung ${v} untuk setiap nilai ${other}`, after: pairs.map((p) => `(${vars.map((w) => toLatex(p[w])).join(", ")})`).join(",\\ ") || "\\varnothing", operation: "back-substitute", reason: `Gunakan ${v} = ${toText(expr)}.` });
      pairs.forEach((p, k) => {
        answers.push({ label: `(${vars.join(", ")})${pairs.length > 1 ? `₍${k + 1}₎` : ""}`, latex: `\\left(${vars.map((w) => toLatex(p[w])).join(", ")}\\right)`, text: `(${vars.map((w) => toText(p[w])).join(", ")})`, exact: true });
        eqs.forEach((e, m) => {
          const d = sub(substituteSymbols(e.L, p), substituteSymbols(e.R, p));
          checks.push({ description: `Pasangan ${k + 1} pada persamaan (${m + 1})`, passed: isSymbolicallyZero(d) || Math.abs(evalComplex(d).re) < 1e-9, method: "Substitusi" });
        });
      });
      if (!pairs.length) answers.push({ label: "Himpunan penyelesaian", latex: "\\varnothing", text: "∅", exact: true });
      return makeSolution({
        kind: "system",
        title: "Sistem persamaan nonlinear (substitusi)",
        input,
        inputLatex,
        answers,
        method: { name: "Metode substitusi", description: "Nyatakan satu variabel dari persamaan yang linear, substitusikan ke persamaan lain, selesaikan, lalu substitusi balik." },
        steps,
        verification: aggregateVerification(checks),
        module: "system",
        notes: warnings,
        references: [REFERENCES.openstaxAlgebra],
      });
    }
  }
  throw new MathError("unsupported", "Sistem nonlinear ini belum dapat diselesaikan oleh engine.", {
    module: "system",
    cause: "Tidak ada persamaan yang linear terhadap salah satu variabel.",
  });
}

export function solveSystem(input: string, nodes: SNode[], warnings: string[] = []): Solution {
  const eqs = nodes.map((n) => {
    if (n.k !== "rel" || n.ops.length !== 1 || n.ops[0] !== "=") {
      throw new MathError("invalid-input", "Setiap bagian sistem harus berupa persamaan dengan satu tanda '='.", { module: "system" });
    }
    return { L: toExpr(n.operands[0]), R: toExpr(n.operands[1]) };
  });
  const vars = orderVars(new Set(eqs.flatMap((e) => [...freeSymbols(e.L), ...freeSymbols(e.R)])));
  if (vars.length === 0) throw new MathError("invalid-input", "Sistem tidak memuat variabel.", { module: "system" });
  const inputLatex = `\\begin{cases} ${nodes.map((n) => syntaxToLatex(n)).join(" \\\\ ")} \\end{cases}`;
  const linear = solveLinearSystem(input, eqs, vars, inputLatex, warnings);
  if (linear) return linear;
  return solveNonlinear2(input, eqs, vars, inputLatex, warnings);
}
