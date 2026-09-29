/**
 * Solve any registered formula for any of its variables, with units.
 *
 * Pipeline: dimensional check of the formula → symbolic rearrangement (isolation, when the
 * unknown occurs once) → conversion of inputs to SI (exact) → substitution → exact solving
 * (equation engine) → filtering by physical constraints → conversion to the output unit →
 * verification (substitution back, dimensions, constraints) → significant figures.
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { evalReal } from "../expr/evaluate";
import { toLatex, toText } from "../expr/print";
import { mul, num, substitute, substituteSymbols, sub, ZERO } from "../expr/simplify";
import { containsSymbol, countSymbol, rawSym, type Expr } from "../expr/types";
import { parse } from "../parse/parser";
import { toExpr } from "../parse/convert";
import { makeSolution } from "../steps/builder";
import { aggregateVerification, formatNumber, numberLatex } from "../steps/format";
import type { Answer, Solution, Step, VerificationCheck } from "../steps/types";
import { solveCore } from "../solvers/equation";
import { isolate, PERIOD_SYMBOL } from "../solvers/isolate";
import { fromSI, parseQuantity, toSI } from "../units/convert";
import { dimEquals, dimMul, dimPow, dimToLatex, dimToString, DIMLESS, isDimensionless, parseUnit, type Dim } from "../units/units";
import { CONSTANTS } from "./constants";
import { FORMULA_BY_ID, type Constraint, type FormulaDef, type FormulaVariable } from "./formulas";

export interface QuantityInput {
  value: string;
  unit?: string;
}

export interface FormulaSolveInput {
  formulaId: string;
  solveFor: string;
  values: Record<string, QuantityInput>;
  outputUnit?: string;
}

/** Dimension of an expression given variable dimensions; throws on inconsistency. */
export function dimensionOf(e: Expr, dims: Record<string, Dim>): Dim {
  switch (e.type) {
    case "num":
      return DIMLESS;
    case "sym":
      if (e.name === "pi" || e.name === "e") return DIMLESS;
      if (!(e.name in dims)) throw new MathError("internal", `Dimensi variabel ${e.name} tidak diketahui.`, { module: "formula" });
      return dims[e.name];
    case "add": {
      const ds = e.terms.map((t) => dimensionOf(t, dims));
      for (const d of ds.slice(1)) {
        if (!dimEquals(d, ds[0])) {
          throw new MathError("dimension-mismatch", "Penjumlahan besaran dengan dimensi berbeda.", {
            module: "formula",
            cause: `${dimToString(ds[0])} tidak dapat dijumlahkan dengan ${dimToString(d)}.`,
          });
        }
      }
      return ds[0];
    }
    case "mul":
      return e.factors.reduce((acc, f) => dimMul(acc, dimensionOf(f, dims)), DIMLESS);
    case "pow": {
      const bd = dimensionOf(e.base, dims);
      const ed = dimensionOf(e.exp, dims);
      if (!isDimensionless(ed)) throw new MathError("dimension-mismatch", "Eksponen harus tak berdimensi.", { module: "formula" });
      if (isDimensionless(bd)) return DIMLESS;
      const k = evalReal(e.exp);
      if (!Number.isFinite(k)) throw new MathError("dimension-mismatch", "Besaran berdimensi dipangkatkan dengan eksponen variabel.", { module: "formula" });
      return dimPow(bd, k);
    }
    case "fn": {
      if (e.name === "abs") return dimensionOf(e.args[0], dims);
      for (const a of e.args) {
        if (!isDimensionless(dimensionOf(a, dims))) {
          throw new MathError("dimension-mismatch", `Argumen fungsi ${e.name} harus tak berdimensi.`, { module: "formula" });
        }
      }
      return DIMLESS;
    }
  }
}

/** Count significant figures of a decimal string (trailing zeros of integers are not counted). */
export function significantFigures(value: string): number {
  const s = value.trim().replace(/^[+-]/, "").toLowerCase();
  const mantissa = s.split("e")[0];
  if (mantissa.includes(".")) {
    const digits = mantissa.replace(".", "").replace(/^0+/, "");
    return Math.max(1, digits.length);
  }
  const trimmed = mantissa.replace(/^0+/, "").replace(/0+$/, "");
  return Math.max(1, trimmed.length);
}

export function roundToSigFigs(x: number, n: number): string {
  if (x === 0 || !Number.isFinite(x)) return String(x);
  const s = x.toPrecision(Math.max(1, Math.min(21, n)));
  if (s.includes("e") && Math.abs(x) >= 1 && Math.abs(x) < 1e15) {
    // 1e1 → 10, 1.2e5 → 120000: plain notation reads better for moderate magnitudes.
    return String(Number(s));
  }
  if (s.includes("e")) {
    const [m, e] = s.split("e");
    return `${m}e${e.replace("+", "")}`;
  }
  return s;
}

function constraintOk(c: Constraint | undefined, v: number): { ok: boolean; reason?: string } {
  switch (c) {
    case "positive":
      return v > 0 ? { ok: true } : { ok: false, reason: "besaran ini harus positif" };
    case "nonnegative":
      return v >= -1e-15 ? { ok: true } : { ok: false, reason: "besaran ini tidak boleh negatif" };
    case "unit-interval":
      return v >= -1e-15 && v <= 1 + 1e-12 ? { ok: true } : { ok: false, reason: "nilai harus di antara 0 dan 1 (0–100%); nilai di luar rentang tidak mungkin secara fisis" };
    case "angle":
      return v >= -1e-12 && v <= Math.PI + 1e-12 ? { ok: true } : { ok: false, reason: "sudut di luar rentang 0°–180°" };
    case "below-c":
      return Math.abs(v) < 299792458 ? { ok: true } : { ok: false, reason: "kelajuan tidak boleh ≥ kecepatan cahaya" };
    default:
      return { ok: true };
  }
}

function varLatex(fv: FormulaVariable): string {
  if (fv.latex) return fv.latex;
  return toLatex(rawSym(fv.s));
}

function quantityLatex(e: Expr): string {
  if (e.type === "num" && e.value.hasTerminatingDecimal()) {
    const v = e.value.toNumber();
    const s = Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? formatNumber(v, 12) : e.value.toFixedString(12);
    return numberLatex(s);
  }
  const v = evalReal(e);
  return numberLatex(formatNumber(v, 10));
}

export function formulaVariablesLatex(def: FormulaDef): Record<string, string> {
  return Object.fromEntries(def.variables.map((fv) => [fv.s, varLatex(fv)]));
}

export function formulaLatex(def: FormulaDef): string {
  const r = parse(def.equation).statements[0];
  if (r.k !== "rel") return def.equation;
  const opts = { symbolLatex: formulaVariablesLatex(def) };
  return `${toLatex(toExpr(r.operands[0]), opts)} = ${toLatex(toExpr(r.operands[1]), opts)}`;
}

export function solveFormula(input: FormulaSolveInput): Solution {
  const def = FORMULA_BY_ID[input.formulaId];
  if (!def) throw new MathError("invalid-input", `Rumus '${input.formulaId}' tidak ditemukan.`, { module: "formula" });
  const target = def.variables.find((fv) => fv.s === input.solveFor);
  if (!target) throw new MathError("invalid-input", `Variabel '${input.solveFor}' tidak ada dalam rumus ${def.name}.`, { module: "formula" });
  if (target.constant) throw new MathError("invalid-input", `${target.name} adalah konstanta dan tidak dapat dicari.`, { module: "formula" });
  const parsed = parse(def.equation).statements[0];
  if (parsed.k !== "rel") throw new MathError("internal", "Rumus tidak valid.", { module: "formula" });
  const L = toExpr(parsed.operands[0]);
  const R = toExpr(parsed.operands[1]);
  const symLatex = formulaVariablesLatex(def);
  const opts = { symbolLatex: symLatex };
  const eqL = (a: Expr, b: Expr) => `${toLatex(a, opts)} = ${toLatex(b, opts)}`;

  // Dimensions (from default units, or constant units)
  const dims: Record<string, Dim> = {};
  const unitOf = (fv: FormulaVariable) => (fv.constant ? CONSTANTS[fv.constant].unit : fv.unit);
  for (const fv of def.variables) dims[fv.s] = parseUnit(unitOf(fv)).dim;
  const steps: Step[] = [];
  const checks: VerificationCheck[] = [];
  let dimOk = true;
  try {
    const dl = dimensionOf(L, dims);
    const dr = dimensionOf(R, dims);
    dimOk = dimEquals(dl, dr);
    checks.push({ description: "Analisis dimensi rumus: dimensi ruas kiri = dimensi ruas kanan", latex: `${dimToLatex(dl)} = ${dimToLatex(dr)}`, passed: dimOk, method: "Analisis dimensi" });
  } catch (e) {
    dimOk = false;
    checks.push({ description: "Analisis dimensi rumus", passed: false, method: "Analisis dimensi", detail: e instanceof Error ? e.message : String(e) });
  }
  steps.push({ title: "Tulis rumus", after: eqL(L, R), operation: "formula", rule: { id: def.id, name: def.name, formula: eqL(L, R) }, reason: def.description, assumptions: def.assumptions });

  // Symbolic rearrangement
  let rearranged: Expr | null = null;
  if (countSymbol(L, target.s) + countSymbol(R, target.s) === 1) {
    const iso = isolate(L, R, target.s);
    if (iso && iso.branches.length) {
      const branch = iso.branches.find((b) => !b.periodic) ?? iso.branches[0];
      rearranged = branch.value;
      steps.push({ title: `Susun ulang rumus untuk ${target.name}`, after: `${varLatex(target)} = ${toLatex(rearranged, opts)}${branch.periodic ? ",\\ k \\in \\mathbb{Z}" : ""}`, operation: "rearrange", reason: iso.branches.length > 1 ? "Operasi invers diterapkan pada kedua ruas; ada lebih dari satu cabang solusi, dipilih berdasarkan batasan fisis setelah substitusi." : "Operasi invers diterapkan pada kedua ruas hingga variabel yang dicari terisolasi.", substeps: branch.steps.map((s) => ({ ...s, before: s.before, after: s.after })) });
      try {
        const dRe = dimensionOf(rearranged, dims);
        checks.push({ description: `Dimensi rumus hasil penyusunan ulang cocok dengan dimensi ${target.name}`, latex: `${dimToLatex(dRe)} = ${dimToLatex(dims[target.s])}`, passed: dimEquals(dRe, dims[target.s]), method: "Analisis dimensi" });
      } catch {
        // periodic parameter etc.
      }
    }
  } else {
    steps.push({ title: "Variabel muncul lebih dari sekali", after: eqL(L, R), operation: "no-rearrange", reason: "Rumus tidak disusun ulang secara umum; persamaan diselesaikan setelah nilai-nilai disubstitusikan." });
  }

  // Inputs to SI
  const values: Record<string, Expr> = {};
  const conversions: string[] = [];
  const sigs: number[] = [];
  for (const fv of def.variables) {
    if (fv.s === target.s) continue;
    if (fv.constant) {
      const c = CONSTANTS[fv.constant];
      const u = parseUnit(c.unit);
      values[fv.s] = toSI(num(parseQuantity(c.value)), u);
      conversions.push(`${varLatex(fv)} = ${numberLatex(formatNumber(Number(c.value), 11))}\\ ${u.latex}\\ \\text{(${c.name}; ${c.source})}`);
      continue;
    }
    const given = input.values[fv.s] ?? (fv.defaultValue !== undefined ? { value: fv.defaultValue, unit: fv.unit } : undefined);
    if (!given || given.value.trim() === "") {
      throw new MathError("invalid-input", `Nilai ${fv.name} (${fv.s}) belum diisi.`, { module: "formula", hint: `Masukkan semua besaran kecuali ${target.name}.` });
    }
    const q = parseQuantity(given.value);
    const u = parseUnit(given.unit ?? fv.unit);
    if (!dimEquals(u.dim, dims[fv.s])) {
      throw new MathError("dimension-mismatch", `Satuan '${given.unit}' tidak sesuai untuk ${fv.name}.`, { module: "formula", cause: `${fv.name} berdimensi ${dimToString(dims[fv.s])}, tetapi satuan yang diberikan berdimensi ${dimToString(u.dim)}.` });
    }
    const si = toSI(num(q), u);
    values[fv.s] = si;
    if (input.values[fv.s]) sigs.push(significantFigures(given.value));
    const siUnit = parseUnit(fv.unit);
    const sameAsSI = u.atoms.length === siUnit.atoms.length && evalReal(u.factor) === 1 && !u.offset;
    conversions.push(`${varLatex(fv)} = ${numberLatex(given.value)}${u.latex ? `\\ ${u.latex}` : ""}${sameAsSI ? "" : ` = ${quantityLatex(si)}\\ \\text{(SI)}`}`);
  }
  steps.push({ title: "Nilai yang diketahui (dalam satuan SI)", after: conversions.join(" \\\\ "), operation: "given", rule: { id: "si", name: "Konversi ke SI", formula: "x_{\\mathrm{SI}} = x \\cdot f" }, reason: "Semua besaran dikonversi ke satuan SI koheren agar rumus berlaku tanpa faktor tambahan." });

  // Substitute and solve
  const Ls = substituteSymbols(L, values);
  const Rs = substituteSymbols(R, values);
  steps.push({ title: "Substitusikan nilai", after: `${toLatex(Ls, opts)} = ${toLatex(Rs, opts)}`, operation: "substitute", reason: "Ganti setiap besaran yang diketahui dengan nilainya." });
  const att = solveCore(Ls, Rs, target.s);
  steps.push({ title: `Selesaikan untuk ${target.name}`, after: att.roots.length ? att.roots.map((r) => `${varLatex(target)} = ${r.expr ? toLatex(r.expr, opts) : formatNumber(r.approx!.re)}`).join(",\\ ") : "\\varnothing", operation: "solve", reason: att.method.name, substeps: att.steps });

  // candidate values (expand periodic families)
  type Cand = { expr?: Expr; value: number };
  const cands: Cand[] = [];
  for (const r of att.roots) {
    if (r.periodic && r.expr) {
      for (let k = -3; k <= 3; k++) {
        const inst = substituteSymbols(r.expr, { [PERIOD_SYMBOL]: num(k) });
        const val = evalReal(inst);
        if (Number.isFinite(val)) cands.push({ expr: inst, value: val });
      }
    } else if (r.expr) {
      if (containsSymbol(r.expr, "i")) continue;
      const val = evalReal(r.expr);
      if (Number.isFinite(val)) cands.push({ expr: r.expr, value: val });
    } else if (r.approx && Math.abs(r.approx.im) < 1e-12) cands.push({ value: r.approx.re });
  }
  const accepted: Cand[] = [];
  const rejected: string[] = [];
  for (const c of cands) {
    const ok = constraintOk(target.constraint, c.value);
    if (ok.ok && !accepted.some((a) => Math.abs(a.value - c.value) <= 1e-12 * Math.max(1, Math.abs(c.value)))) accepted.push(c);
    else if (!ok.ok && target.constraint !== "angle") rejected.push(`${formatNumber(c.value, 8)} (${ok.reason})`);
  }
  if (rejected.length) {
    steps.push({ title: "Saring berdasarkan batasan fisis", after: accepted.map((a) => `${varLatex(target)} = ${a.expr ? toLatex(a.expr, opts) : formatNumber(a.value)}`).join(",\\ ") || "\\varnothing", operation: "filter-constraints", reason: `Ditolak: ${rejected.join("; ")}.` });
  }
  if (accepted.length === 0) {
    throw new MathError("no-solution", `Tidak ada nilai ${target.name} yang memenuhi rumus dan batasan fisis.`, {
      module: "formula",
      cause: rejected.length ? `Kandidat ditolak: ${rejected.join("; ")}.` : "Persamaan tidak memiliki solusi real untuk data ini.",
      hint: "Periksa kembali nilai masukan dan satuannya.",
    });
  }

  const outUnit = parseUnit(input.outputUnit ?? target.unit);
  if (!dimEquals(outUnit.dim, dims[target.s])) {
    throw new MathError("dimension-mismatch", `Satuan keluaran '${input.outputUnit}' tidak sesuai untuk ${target.name}.`, { module: "formula" });
  }
  const minSig = sigs.length ? Math.min(...sigs) : 4;
  const answers: Answer[] = [];
  accepted.forEach((c, idx) => {
    const outExpr = c.expr ? fromSI(c.expr, outUnit) : null;
    const outVal = outExpr ? evalReal(outExpr) : (c.value - evalReal(outUnit.offset ?? ZERO)) / evalReal(outUnit.factor);
    const isAngle = target.constraint === "angle" && outUnit.atoms[0]?.unit.symbol === "°";
    const label = `${target.name}${accepted.length > 1 ? ` (${idx + 1})` : ""}`;
    answers.push({
      label,
      latex: `${varLatex(target)} = ${outExpr && outExpr.type === "num" && outExpr.value.hasTerminatingDecimal() ? numberLatex(outExpr.value.toFixedString(12)) : numberLatex(formatNumber(outVal, 10))}${outUnit.latex ? `\\ ${outUnit.latex}` : ""}`,
      text: `${formatNumber(outVal, 10)}${outUnit.text ? ` ${outUnit.text}` : ""}`,
      approx: `${roundToSigFigs(outVal, minSig)}${outUnit.text ? ` ${outUnit.text}` : ""} (${minSig} angka penting)`,
      exact: !!outExpr && outExpr.type === "num",
      unit: outUnit.latex,
    });
    if (outExpr && outExpr.type !== "num") {
      answers.push({ label: `${label} — bentuk eksak`, latex: `${toLatex(outExpr, opts)}${outUnit.latex ? `\\ ${outUnit.latex}` : ""}`, text: `${toText(outExpr)}${outUnit.text ? ` ${outUnit.text}` : ""}`, exact: true });
    }
    // verification: substitute back
    const env: Record<string, number> = {};
    for (const [k, e] of Object.entries(values)) env[k] = evalReal(e);
    env[target.s] = c.value;
    const lv = evalReal(L, env);
    const rv = evalReal(R, env);
    const rel = Math.abs(lv - rv) / Math.max(1e-300, Math.abs(lv), Math.abs(rv));
    checks.push({ description: `Substitusi ${target.name} = ${formatNumber(c.value, 8)} (SI) kembali ke rumus`, latex: `${formatNumber(lv, 10)} \\approx ${formatNumber(rv, 10)}`, passed: rel < 1e-9 || (Math.abs(lv) < 1e-300 && Math.abs(rv) < 1e-300), method: "Substitusi numerik", detail: `Selisih relatif ${rel.toExponential(2)}` });
    const cOk = constraintOk(target.constraint, c.value);
    if (target.constraint && target.constraint !== "any") checks.push({ description: `Batasan fisis ${target.name}`, passed: cOk.ok, method: "Pemeriksaan batasan fisis" });
    if (isAngle) void 0;
  });
  if (!dimOk) {
    throw new MathError("verification-failure", "Rumus tidak konsisten secara dimensi (kesalahan data rumus).", { module: "formula", details: { formula: def.id } });
  }
  const notes: string[] = [];
  if (sigs.length) notes.push(`Hasil juga dibulatkan ke ${minSig} angka penting sesuai data masukan paling sedikit angka pentingnya.`);
  const inexact = def.variables.filter((fv) => fv.constant && !CONSTANTS[fv.constant].exact);
  if (inexact.length) notes.push(`Konstanta terukur digunakan (${inexact.map((fv) => CONSTANTS[fv.constant!].name).join(", ")}); hasil membawa ketidakpastiannya.`);
  if (accepted.length > 1) notes.push("Ada lebih dari satu nilai yang memenuhi; pilih sesuai konteks soal.");
  return makeSolution({
    kind: "formula",
    title: def.name,
    input: JSON.stringify(input),
    inputLatex: eqL(L, R),
    answers,
    method: { name: rearranged ? "Penyusunan ulang rumus dan substitusi" : "Substitusi lalu penyelesaian persamaan", description: def.description, formula: eqL(L, R) },
    steps,
    verification: aggregateVerification(checks),
    module: "formula",
    assumptions: def.assumptions ?? [],
    notes,
    references: [def.reference],
  });
}

export function variableDimension(def: FormulaDef, s: string): Dim {
  const fv = def.variables.find((x) => x.s === s)!;
  return parseUnit(fv.constant ? CONSTANTS[fv.constant].unit : fv.unit).dim;
}

export { mul, sub, substitute, Rational };
