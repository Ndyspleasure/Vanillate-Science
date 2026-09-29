/**
 * Formatting helpers for answers: exact LaTeX/text plus decimal approximations with
 * explicit precision (CLAUDE.md §18: never hide rounding).
 */
import { Rational } from "../core/rational";
import { evalComplex, evalReal } from "../expr/evaluate";
import { toLatex, toText, type PrintOptions } from "../expr/print";
import { freeSymbols, type Expr } from "../expr/types";
import type { Answer, Verification, VerificationCheck, VerificationStatus } from "./types";

export const DEFAULT_DIGITS = 10;

/** Format a finite number with `digits` significant digits, trimming trailing zeros. */
export function formatNumber(x: number, digits = DEFAULT_DIGITS): string {
  if (Number.isNaN(x)) return "tidak terdefinisi";
  if (!Number.isFinite(x)) return x > 0 ? "∞" : "-∞";
  if (x === 0) return "0";
  const abs = Math.abs(x);
  if (abs >= 1e15 || abs < 1e-6) {
    const [m, e] = x.toExponential(digits - 1).split("e");
    return `${trimZeros(m)}e${e.replace("+", "")}`;
  }
  const s = x.toPrecision(digits);
  if (s.includes("e")) return formatNumber(Number(s), digits);
  return trimZeros(s);
}

function trimZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

/** LaTeX for a formatted decimal ("1.5e-7" -> "1.5 \times 10^{-7}"). */
export function numberLatex(s: string): string {
  const m = /^(-?[\d.]+)e(-?\d+)$/.exec(s);
  if (m) return `${m[1]} \\times 10^{${m[2]}}`;
  return s;
}

export function formatComplex(re: number, im: number, digits = DEFAULT_DIGITS): string {
  if (Math.abs(im) < 1e-14 * Math.max(1, Math.abs(re))) return formatNumber(re, digits);
  if (Math.abs(re) < 1e-14 * Math.max(1, Math.abs(im))) return `${formatNumber(im, digits)}i`;
  return `${formatNumber(re, digits)} ${im < 0 ? "-" : "+"} ${formatNumber(Math.abs(im), digits)}i`;
}

/** True when the exact expression is a plain terminating decimal (no approximation needed). */
function isPlainDecimal(e: Expr): boolean {
  return e.type === "num" && e.value.hasTerminatingDecimal() && e.value.den < 10n ** 6n;
}

/** Build an Answer from an exact expression, adding a decimal approximation when useful. */
export function exactAnswer(e: Expr, label?: string, options: PrintOptions & { digits?: number } = {}): Answer {
  const latex = toLatex(e, options);
  const text = toText(e, options);
  let approx: string | undefined;
  if (freeSymbols(e).size === 0 && !isPlainDecimal(e)) {
    const v = evalComplex(e);
    if (Number.isFinite(v.re) && Number.isFinite(v.im)) approx = formatComplex(v.re, v.im, options.digits ?? DEFAULT_DIGITS);
  } else if (e.type === "num" && !e.value.isInteger()) {
    approx = e.value.toFixedString(12);
  }
  if (approx === text) approx = undefined;
  return { label, latex, text, approx, exact: true };
}

export function approxAnswer(value: number, label?: string, digits = DEFAULT_DIGITS, unit?: string): Answer {
  const s = formatNumber(value, digits);
  return { label, latex: numberLatex(s), text: s, exact: false, unit };
}

export function rationalLatex(r: Rational): string {
  if (r.isInteger()) return r.num.toString();
  const n = r.num < 0n ? -r.num : r.num;
  return `${r.isNegative() ? "-" : ""}\\frac{${n}}{${r.den}}`;
}

export function aggregateVerification(checks: VerificationCheck[], emptySummary = "Tidak ada verifikasi otomatis untuk soal ini."): Verification {
  if (checks.length === 0) return { status: "unverified", summary: emptySummary, checks };
  const failed = checks.filter((c) => !c.passed);
  if (failed.length === checks.length) {
    return { status: "failed", summary: "Verifikasi gagal: hasil tidak dapat dikonfirmasi. Jangan gunakan hasil ini sebagai jawaban final.", checks };
  }
  if (failed.length > 0) {
    return { status: "partial", summary: `${checks.length - failed.length} dari ${checks.length} pemeriksaan lulus.`, checks };
  }
  const numericOnly = checks.every((c) => /numerik|numeric/i.test(c.method));
  const status: VerificationStatus = numericOnly ? "verified-numeric" : "verified";
  return {
    status,
    summary: numericOnly ? "Terverifikasi secara numerik (dengan toleransi)." : "Terverifikasi.",
    checks,
  };
}

export function evalToString(e: Expr, digits = DEFAULT_DIGITS): string {
  const v = evalReal(e);
  return formatNumber(v, digits);
}
