/**
 * Unit conversion with steps, dimensional check and round-trip verification.
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { evalReal } from "../expr/evaluate";
import { toLatex, toText } from "../expr/print";
import { add, div, mul, num, sub } from "../expr/simplify";
import { isSymbolicallyZero } from "../expr/equivalence";
import type { Expr } from "../expr/types";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification, formatNumber, numberLatex } from "../steps/format";
import type { Solution, Step, VerificationCheck } from "../steps/types";
import { dimEquals, dimToLatex, dimToString, parseUnit, type CompoundUnit } from "./units";

export function parseQuantity(value: string): Rational {
  const v = Rational.parseDecimal(value.trim().replace(",", "."));
  if (!v)
    throw new MathError("invalid-input", `Nilai '${value}' bukan angka yang valid.`, {
      module: "units",
      hint: "Gunakan angka seperti 12.5 atau 1.5e-3.",
    });
  return v;
}

/** Convert an exact value between compound units. Returns exact Expr. */
export function convertValue(value: Expr, from: CompoundUnit, to: CompoundUnit): Expr {
  if (!dimEquals(from.dim, to.dim)) {
    throw new MathError(
      "dimension-mismatch",
      `Tidak dapat mengonversi ${from.text || "(tak berdimensi)"} ke ${to.text || "(tak berdimensi)"}.`,
      {
        module: "units",
        cause: `Dimensi berbeda: ${dimToString(from.dim)} vs ${dimToString(to.dim)}.`,
        hint: "Konversi hanya mungkin antara satuan dengan dimensi yang sama (misalnya panjang ke panjang).",
      },
    );
  }
  const si = add(mul(value, from.factor), from.offset ?? num(0));
  return div(sub(si, to.offset ?? num(0)), to.factor);
}

export function toSI(value: Expr, unit: CompoundUnit): Expr {
  return add(mul(value, unit.factor), unit.offset ?? num(0));
}

export function fromSI(value: Expr, unit: CompoundUnit): Expr {
  return div(sub(value, unit.offset ?? num(0)), unit.factor);
}

function valueText(e: Expr): { latex: string; text: string; approx?: string } {
  if (e.type === "num" && e.value.hasTerminatingDecimal() && e.value.den <= 10n ** 12n) {
    const s = e.value.toFixedString(16);
    return { latex: numberLatex(s), text: s };
  }
  const v = evalReal(e);
  return { latex: toLatex(e), text: toText(e), approx: formatNumber(v, 12) };
}

/** Terminating decimals as decimals (273.15, not 5463/20); other values as exact LaTeX. */
function decLatex(e: Expr): string {
  if (e.type === "num" && e.value.hasTerminatingDecimal()) {
    const t = e.value.toFixedString(20);
    return t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, "") : t;
  }
  return toLatex(e);
}

export function solveUnitConversion(
  valueText_: string,
  fromText: string,
  toText_: string,
): Solution {
  const value = num(parseQuantity(valueText_));
  const from = parseUnit(fromText);
  const to = parseUnit(toText_);
  const result = convertValue(value, from, to);
  const steps: Step[] = [];
  steps.push({
    title: "Periksa dimensi",
    after: `[${from.latex || "1"}] = ${dimToLatex(from.dim)},\\quad [${to.latex || "1"}] = ${dimToLatex(to.dim)}`,
    operation: "dimension-check",
    rule: {
      id: "dimensional-homogeneity",
      name: "Homogenitas dimensi",
      formula: "\\text{konversi hanya antar satuan berdimensi sama}",
    },
    reason: `Keduanya berdimensi ${dimToString(from.dim)}, sehingga konversi valid.`,
  });
  const si = toSI(value, from);
  const siUnit = dimToString(from.dim);
  if (from.offset || to.offset) {
    steps.push({
      title: "Ubah ke kelvin (skala mutlak)",
      after: `T_{\\mathrm{K}} = ${decLatex(value)} \\times ${decLatex(from.factor)} + ${decLatex(from.offset ?? num(0))} = ${valueText(si).latex}\\ \\mathrm{K}`,
      operation: "to-si",
      rule: {
        id: "affine-temperature",
        name: "Konversi suhu (afin)",
        formula:
          "T_{\\mathrm{K}} = T_{^{\\circ}\\mathrm{C}} + 273.15,\\quad T_{\\mathrm{K}} = (T_{^{\\circ}\\mathrm{F}} + 459.67)\\cdot\\tfrac{5}{9}",
      },
      reason:
        "Skala suhu berbeda titik nolnya, sehingga ada penambahan (offset), bukan hanya perkalian.",
    });
    steps.push({
      title: "Ubah ke satuan tujuan",
      after: `\\frac{${valueText(si).latex} - ${decLatex(to.offset ?? num(0))}}{${decLatex(to.factor)}} = ${valueText(result).latex}`,
      operation: "from-si",
      reason: "Kebalikan dari rumus konversi satuan tujuan.",
    });
  } else {
    steps.push({
      title: "Kalikan dengan faktor konversi ke satuan SI",
      after: `${toLatex(value)}\\ ${from.latex} \\times ${toLatex(from.factor)} = ${valueText(si).latex}\\ (\\text{SI: ${siUnit}})`,
      operation: "to-si",
      rule: {
        id: "conversion-factor",
        name: "Faktor konversi",
        formula: "x_{\\mathrm{SI}} = x \\cdot f_{\\text{asal}}",
      },
      reason: `1 ${from.text} = ${valueText(from.factor).approx ?? valueText(from.factor).text} satuan SI.`,
    });
    steps.push({
      title: "Bagi dengan faktor konversi satuan tujuan",
      after: `\\frac{${valueText(si).latex}}{${toLatex(to.factor)}} = ${valueText(result).latex}\\ ${to.latex}`,
      operation: "from-si",
      rule: {
        id: "conversion-factor",
        name: "Faktor konversi",
        formula: "x_{\\text{tujuan}} = \\frac{x_{\\mathrm{SI}}}{f_{\\text{tujuan}}}",
      },
      reason: `1 ${to.text} = ${valueText(to.factor).approx ?? valueText(to.factor).text} satuan SI.`,
    });
    const ratio = div(from.factor, to.factor);
    steps.push({
      title: "Faktor gabungan",
      after: `1\\ ${from.latex} = ${valueText(ratio).latex}\\ ${to.latex}`,
      operation: "combined-factor",
      reason: "Faktor langsung dari satuan asal ke satuan tujuan.",
    });
  }
  const back = convertValue(result, to, from);
  const checks: VerificationCheck[] = [
    {
      description: "Konversi balik menghasilkan nilai semula",
      latex: `${valueText(result).latex}\\ ${to.latex} \\to ${valueText(back).latex}\\ ${from.latex}`,
      passed: isSymbolicallyZero(sub(back, value)),
      method: "Konversi balik eksak",
    },
    {
      description: "Dimensi satuan asal dan tujuan identik",
      passed: dimEquals(from.dim, to.dim),
      method: "Analisis dimensi",
    },
  ];
  const r = valueText(result);
  const notes: string[] = [];
  if (!from.exact || !to.exact)
    notes.push(
      "Salah satu satuan didefinisikan dari nilai terukur (bukan eksak); hasil membawa ketidakpastian pengukuran tersebut.",
    );
  for (const a of [...from.atoms, ...to.atoms])
    if (a.unit.note) notes.push(`${a.unit.symbol}: ${a.unit.note}`);
  return makeSolution({
    kind: "units",
    title: "Konversi satuan",
    input: `${valueText_} ${fromText} -> ${toText_}`,
    inputLatex: `${toLatex(value)}\\ ${from.latex} \\to ${to.latex}`,
    answers: [
      {
        label: "Hasil",
        latex: `${r.latex}\\ ${to.latex}`,
        text: `${r.text} ${to.text}`,
        approx: r.approx ? `${r.approx} ${to.text}` : undefined,
        exact: from.exact && to.exact,
        unit: to.latex,
      },
    ],
    method: {
      name: "Faktor konversi melalui satuan SI",
      description:
        "Nilai diubah ke satuan SI koheren lalu ke satuan tujuan; faktor eksak digunakan bila definisinya eksak.",
    },
    steps,
    verification: aggregateVerification(checks),
    module: "units",
    notes: [...new Set(notes)],
    references: [REFERENCES.siBrochure, REFERENCES.nistSp811],
  });
}
