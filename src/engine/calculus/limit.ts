/**
 * Limits with steps.
 *
 * Core: an exact "algebra of limits" on the extended reals (limit laws for sums, products,
 * powers and continuous functions, with ±∞ arithmetic) that detects indeterminate forms
 * symbolically. Indeterminate forms are resolved by: factor-and-cancel (rational functions),
 * degree comparison at infinity, conjugate rationalization, rewriting 0·∞ and ∞−∞ into
 * quotients, L'Hôpital's rule (repeated), and the exponential–logarithmic transform for
 * 1^∞, 0^0, ∞^0. A numeric estimate is used only as a clearly labelled last resort.
 *
 * Reference: OpenStax Calculus Volume 1, chapters "Limits" and "Applications of
 * Derivatives" (L'Hôpital's rule).
 */
import { tick } from "../core/budget";
import { MathError, isMathError } from "../core/errors";
import { evalReal } from "../expr/evaluate";
import { expand, numerDenom, together } from "../expr/expand";
import { isSymbolicallyZero } from "../expr/equivalence";
import { Poly, toPoly } from "../expr/polynomial";
import { toLatex } from "../expr/print";
import { add, div, fn, mul, num, pow, sub, substitute, E, ONE, ZERO, PI, HALF, constantSign } from "../expr/simplify";
import { containsSymbol, exprKey, exprSize, hasFunction, rawSym, type Expr } from "../expr/types";
import { formatNumber } from "../steps/format";
import type { Step } from "../steps/types";
import { differentiate, tidy } from "./derivative";

export type LimitTarget = { kind: "finite"; value: Expr } | { kind: "inf"; sign: 1 | -1 };
export type LimitValue = { kind: "finite"; value: Expr } | { kind: "inf"; sign: 1 | -1 } | { kind: "dne"; reason: string } | { kind: "numeric"; value: number };

export interface LimitResult {
  value: LimitValue;
  steps: Step[];
  method: string;
}

type LV =
  | { kind: "finite"; value: Expr }
  | { kind: "inf"; sign: 1 | -1 }
  | { kind: "blowup" } // |f| → ∞ with different signs on the two sides
  | { kind: "indeterminate"; form: string }
  | { kind: "dne"; reason: string };

export function limitValueLatex(v: LimitValue): string {
  switch (v.kind) {
    case "finite":
      return toLatex(v.value);
    case "inf":
      return v.sign > 0 ? "\\infty" : "-\\infty";
    case "dne":
      return "\\text{tidak ada}";
    case "numeric":
      return `\\approx ${formatNumber(v.value, 10)}`;
  }
}

export function targetLatex(t: LimitTarget, dir?: "+" | "-"): string {
  const base = t.kind === "finite" ? toLatex(t.value) : t.sign > 0 ? "\\infty" : "-\\infty";
  return dir && t.kind === "finite" ? `${base}^{${dir}}` : base;
}

const limL = (e: Expr, x: string, t: LimitTarget, dir?: "+" | "-") =>
  `\\lim_{${toLatex(rawSym(x))} \\to ${targetLatex(t, dir)}} ${e.type === "add" ? `\\left(${toLatex(e)}\\right)` : toLatex(e)}`;

function sidesOf(t: LimitTarget, dir?: "+" | "-"): Array<1 | -1> {
  if (t.kind === "inf") return [t.sign > 0 ? -1 : 1];
  return dir === "+" ? [1] : dir === "-" ? [-1] : [1, -1];
}

/** Sample points approaching the target from one side. */
export function probe(e: Expr, x: string, t: LimitTarget, side: 1 | -1): number[] {
  const vals: number[] = [];
  for (let k = 2; k <= 8; k++) {
    let p: number;
    if (t.kind === "finite") {
      const a = evalReal(t.value);
      p = a + side * Math.pow(10, -k) * Math.max(1, Math.abs(a));
    } else p = t.sign * Math.pow(10, k);
    vals.push(evalReal(e, { [x]: p }));
  }
  return vals;
}

type Behaviour = { kind: "finite"; value: number } | { kind: "inf"; sign: 1 | -1 } | { kind: "unknown" };

export function classify(vals: number[]): Behaviour {
  const finite = vals.filter((v) => Number.isFinite(v));
  if (finite.length < 3) {
    const inf = vals.filter((v) => v === Infinity || v === -Infinity);
    if (inf.length >= 3 && inf.every((v) => v === inf[0])) return { kind: "inf", sign: inf[0] > 0 ? 1 : -1 };
    return { kind: "unknown" };
  }
  const last = finite.slice(-4);
  const growing = last.every((v, i) => i === 0 || Math.abs(v) >= Math.abs(last[i - 1]) * 1.5) && Math.abs(last[last.length - 1]) > 1e6;
  if (growing && last.every((v) => Math.sign(v) === Math.sign(last[0]))) return { kind: "inf", sign: last[0] > 0 ? 1 : -1 };
  const a = last[last.length - 1];
  const b = last[last.length - 2];
  if (Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(a))) return { kind: "finite", value: a };
  return { kind: "unknown" };
}

/** Sign of e very close to the target on the given side (numeric). */
function sideSign(e: Expr, x: string, t: LimitTarget, side: 1 | -1): number {
  const vals = probe(e, x, t, side).filter((v) => Number.isFinite(v) && v !== 0);
  if (!vals.length) return 0;
  const s = Math.sign(vals[vals.length - 1]);
  return vals.slice(-3).every((v) => Math.sign(v) === s) ? s : 0;
}

const FINITE = (value: Expr): LV => ({ kind: "finite", value });
const isZeroLV = (v: LV) => v.kind === "finite" && isSymbolicallyZero(v.value);

function safe<T>(f: () => T): T | null {
  try {
    return f();
  } catch (e) {
    if (isMathError(e)) return null;
    throw e;
  }
}

/** Exact algebra of limits. */
function lawLimit(e: Expr, x: string, t: LimitTarget, dir: "+" | "-" | undefined, depth = 0): LV {
  tick("limit-laws");
  if (depth > 200) return { kind: "indeterminate", form: "kompleks" };
  if (!containsSymbol(e, x)) return FINITE(e);
  const sides = sidesOf(t, dir);
  const rec = (s: Expr) => lawLimit(s, x, t, dir, depth + 1);
  switch (e.type) {
    case "sym":
      return t.kind === "finite" ? FINITE(t.value) : { kind: "inf", sign: t.sign };
    case "add": {
      const parts = e.terms.map(rec);
      for (const p of parts) if (p.kind === "indeterminate" || p.kind === "dne") return p;
      if (parts.some((p) => p.kind === "blowup")) return parts.filter((p) => p.kind !== "finite").length > 1 ? { kind: "indeterminate", form: "∞ − ∞" } : { kind: "blowup" };
      const infs = parts.filter((p): p is { kind: "inf"; sign: 1 | -1 } => p.kind === "inf");
      if (infs.length) {
        if (infs.some((p) => p.sign !== infs[0].sign)) return { kind: "indeterminate", form: "∞ − ∞" };
        return { kind: "inf", sign: infs[0].sign };
      }
      return FINITE(add(...parts.map((p) => (p as { value: Expr }).value)));
    }
    case "mul": {
      const parts = e.factors.map(rec);
      for (const p of parts) if (p.kind === "indeterminate" || p.kind === "dne") return p;
      const zero = parts.some(isZeroLV);
      const big = parts.some((p) => p.kind === "inf" || p.kind === "blowup");
      if (zero && big) return { kind: "indeterminate", form: "0 · ∞" };
      if (big) {
        if (parts.some((p) => p.kind === "blowup")) return { kind: "blowup" };
        let sign = 1;
        for (const p of parts) {
          if (p.kind === "inf") sign *= p.sign;
          else if (p.kind === "finite") {
            const s = constantSign(p.value);
            if (s === null || s === 0) return { kind: "indeterminate", form: "0 · ∞" };
            sign *= s;
          }
        }
        return { kind: "inf", sign: sign as 1 | -1 };
      }
      return FINITE(mul(...parts.map((p) => (p as { value: Expr }).value)));
    }
    case "pow": {
      const baseHas = containsSymbol(e.base, x);
      const expHas = containsSymbol(e.exp, x);
      if (baseHas && expHas) return { kind: "indeterminate", form: "pangkat variabel" };
      if (baseHas) {
        const b = rec(e.base);
        const k = evalReal(e.exp);
        if (b.kind === "indeterminate" || b.kind === "dne") return b;
        if (b.kind === "finite") {
          if (isZeroLV(b)) {
            if (k > 0) return FINITE(ZERO);
            // c / 0 -> ±∞ depending on sides
            const signs = sides.map((s) => sideSign(e, x, t, s));
            if (signs.every((s) => s === signs[0] && s !== 0)) return { kind: "inf", sign: signs[0] as 1 | -1 };
            return { kind: "blowup" };
          }
          const v = safe(() => pow(b.value, e.exp));
          if (v === null || containsSymbol(v, "i")) return { kind: "dne", reason: "Di luar domain real." };
          return FINITE(v);
        }
        if (b.kind === "inf") {
          if (k < 0) return FINITE(ZERO);
          if (b.sign > 0) return { kind: "inf", sign: 1 };
          const ex = e.exp.type === "num" ? e.exp.value : null;
          if (ex && ex.isInteger()) return { kind: "inf", sign: ex.num % 2n === 0n ? 1 : -1 };
          if (ex && ex.den % 2n === 1n) return { kind: "inf", sign: ex.num % 2n === 0n ? 1 : -1 };
          return { kind: "dne", reason: "Akar genap dari bilangan negatif." };
        }
        if (b.kind === "blowup") return k < 0 ? FINITE(ZERO) : e.exp.type === "num" && e.exp.value.isInteger() && e.exp.value.num % 2n === 0n ? { kind: "inf", sign: 1 } : { kind: "blowup" };
        return { kind: "indeterminate", form: "?" };
      }
      // constant base, variable exponent
      const bv = evalReal(e.base);
      const ex = rec(e.exp);
      if (ex.kind === "finite") {
        const v = safe(() => pow(e.base, ex.value));
        return v ? FINITE(v) : { kind: "dne", reason: "Di luar domain." };
      }
      if (ex.kind === "inf") {
        if (bv > 1) return ex.sign > 0 ? { kind: "inf", sign: 1 } : FINITE(ZERO);
        if (bv > 0 && bv < 1) return ex.sign > 0 ? FINITE(ZERO) : { kind: "inf", sign: 1 };
        if (bv === 1) return FINITE(ONE);
      }
      return { kind: "indeterminate", form: "eksponen" };
    }
    case "fn": {
      if (e.args.length !== 1 && !(e.name === "log" && !containsSymbol(e.args[1], x))) return { kind: "indeterminate", form: "fungsi" };
      const a = rec(e.args[0]);
      if (a.kind === "indeterminate" || a.kind === "dne") return a;
      if (["floor", "ceil", "round", "sign"].includes(e.name)) return { kind: "indeterminate", form: "fungsi tak kontinu" };
      if (a.kind === "finite") {
        const v = safe(() => fn(e.name, a.value, ...e.args.slice(1)));
        if (v !== null && Number.isFinite(evalReal(v))) return FINITE(v);
        if ((e.name === "ln" || e.name === "log") && isZeroLV(a)) {
          const argSigns = sides.map((s) => sideSign(e.args[0], x, t, s));
          if (argSigns.every((s) => s > 0)) {
            const baseSign = e.name === "log" ? Math.sign(evalReal(e.args[1] ?? num(10)) - 1) : 1;
            return { kind: "inf", sign: (baseSign > 0 ? -1 : 1) as 1 | -1 };
          }
          return { kind: "dne", reason: "Logaritma hanya terdefinisi untuk argumen positif." };
        }
        // boundary of domain: ln(0+), log(0+), tan at asymptote, ...
        const signs = sides.map((s) => sideSign(e, x, t, s));
        const beh = sides.map((s) => classify(probe(e, x, t, s)));
        if (beh.every((q) => q.kind === "inf")) {
          if (signs.every((s) => s === signs[0] && s !== 0)) return { kind: "inf", sign: signs[0] as 1 | -1 };
          return { kind: "blowup" };
        }
        return { kind: "dne", reason: `Fungsi ${e.name} tidak terdefinisi di sekitar titik limit.` };
      }
      if (a.kind === "inf") {
        const s = a.sign;
        switch (e.name) {
          case "ln":
          case "log":
            return s > 0 ? { kind: "inf", sign: 1 } : { kind: "dne", reason: "Logaritma bilangan negatif tidak terdefinisi." };
          case "atan":
            return FINITE(mul(num(s), HALF, PI));
          case "acot":
            return FINITE(s > 0 ? ZERO : PI);
          case "tanh":
            return FINITE(num(s));
          case "sinh":
          case "asinh":
            return { kind: "inf", sign: s };
          case "cosh":
          case "abs":
            return { kind: "inf", sign: 1 };
          case "acosh":
            return s > 0 ? { kind: "inf", sign: 1 } : { kind: "dne", reason: "Di luar domain." };
          case "sin":
          case "cos":
          case "tan":
          case "sec":
          case "csc":
          case "cot":
            return { kind: "dne", reason: `${e.name} berosilasi dan tidak menuju satu nilai.` };
        }
        return { kind: "indeterminate", form: "fungsi" };
      }
      if (a.kind === "blowup" && e.name === "abs") return { kind: "inf", sign: 1 };
      return { kind: "indeterminate", form: "fungsi" };
    }
    default:
      return { kind: "indeterminate", form: "?" };
  }
}

function lvToValue(v: LV, e: Expr, x: string, t: LimitTarget, dir?: "+" | "-"): LimitValue | null {
  switch (v.kind) {
    case "finite":
      return { kind: "finite", value: v.value };
    case "inf":
      return v;
    case "blowup": {
      const sides = sidesOf(t, dir);
      if (sides.length === 1) {
        const s = sideSign(e, x, t, sides[0]);
        return s !== 0 ? { kind: "inf", sign: s as 1 | -1 } : { kind: "dne", reason: "Tanda fungsi tidak stabil." };
      }
      return { kind: "dne", reason: "Limit kiri dan kanan berbeda tanda (−∞ dan +∞)." };
    }
    case "dne":
      return v;
    default:
      return null;
  }
}

function blowupSteps(e: Expr, x: string, t: LimitTarget, dir: "+" | "-" | undefined, v: LimitValue): Step[] {
  if (v.kind === "inf" || (v.kind === "dne" && /tanda/.test(v.reason))) {
    const sides = sidesOf(t, dir);
    const desc = sides.map((s) => `${s > 0 ? "kanan" : "kiri"}: ${sideSign(e, x, t, s) > 0 ? "+\\infty" : "-\\infty"}`).join(",\\ ");
    return [{ title: "Analisis tanda di sekitar titik", after: `\\text{${sides.length > 1 ? "limit kiri/kanan" : "arah"}}\\ ${desc}`, operation: "sign-analysis", rule: { id: "two-sided", name: "Limit sepihak", formula: "\\lim_{x\\to a} f = L \\iff \\lim_{x\\to a^-} f = \\lim_{x\\to a^+} f = L" }, reason: "Penyebut mendekati 0 sehingga fungsi membesar tanpa batas; tanda ditentukan dari arah pendekatan." }];
  }
  return [];
}

function describeLaws(e: Expr, x: string, t: LimitTarget, dir: "+" | "-" | undefined, v: LimitValue, direct: boolean): Step {
  return {
    title: direct ? "Substitusi langsung" : "Gunakan sifat-sifat limit",
    before: limL(e, x, t, dir),
    after: limitValueLatex(v),
    operation: direct ? "direct-substitution" : "limit-laws",
    rule: direct
      ? { id: "direct-substitution", name: "Substitusi langsung (kontinuitas)", formula: "\\lim_{x \\to a} f(x) = f(a) \\text{ jika } f \\text{ kontinu di } a" }
      : { id: "limit-laws", name: "Sifat-sifat limit", formula: "\\lim(f \\pm g) = \\lim f \\pm \\lim g,\\ \\lim fg = \\lim f \\cdot \\lim g,\\ \\lim f(g) = f(\\lim g)", conditions: "Berlaku jika limit masing-masing ada (termasuk aturan ±∞ yang bukan bentuk tak tentu)." },
    reason: direct ? "Fungsi kontinu di titik tersebut sehingga nilai limit sama dengan nilai fungsi." : "Setiap bagian ekspresi memiliki limit yang dapat ditentukan dan tidak menghasilkan bentuk tak tentu.",
  };
}

function conjugateRationalize(e: Expr): Expr | null {
  if (e.type !== "add" || e.terms.length !== 2) return null;
  const [a, b] = e.terms;
  const isRoot = (q: Expr) => (q.type === "pow" && q.exp.type === "num" && q.exp.value.equals(HALF.value)) || (q.type === "mul" && q.factors.some((f) => f.type === "pow" && f.exp.type === "num" && f.exp.value.equals(HALF.value)));
  if (!isRoot(a) && !isRoot(b)) return null;
  // (a + b) = (a^2 - b^2) / (a - b)
  return div(expand(sub(pow(a, num(2)), pow(b, num(2)))), sub(a, b));
}

export function computeLimit(e: Expr, x: string, t: LimitTarget, dir?: "+" | "-", depth = 0, seen: Set<string> = new Set()): LimitResult {
  tick("limit");
  if (depth > 40) throw new MathError("limit-exceeded", "Perhitungan limit terlalu dalam.", { module: "limit" });
  const symbolicAllowed = depth <= 8 && !seen.has(exprKey(e));
  seen.add(exprKey(e));
  const steps: Step[] = [];
  if (!containsSymbol(e, x)) {
    return { value: { kind: "finite", value: e }, steps: [{ title: "Limit konstanta", before: limL(e, x, t, dir), after: toLatex(e), operation: "limit-constant", rule: { id: "limit-constant", name: "Limit konstanta", formula: "\\lim c = c" }, reason: "Ekspresi tidak bergantung pada variabel." }], method: "Limit konstanta" };
  }

  // 1. Algebra of limits (includes direct substitution)
  const lv = lawLimit(e, x, t, dir);
  const val = lvToValue(lv, e, x, t, dir);
  if (val) {
    let direct = false;
    if (t.kind === "finite" && val.kind === "finite") {
      const s = safe(() => substitute(e, rawSym(x), t.value));
      direct = s !== null && isSymbolicallyZero(sub(s, val.value));
    }
    steps.push(describeLaws(e, x, t, dir, val, direct));
    steps.push(...blowupSteps(e, x, t, dir, val));
    return { value: val, steps, method: direct ? "Substitusi langsung" : val.kind === "dne" ? "Analisis limit sepihak" : "Sifat-sifat limit" };
  }
  const form = lv.kind === "indeterminate" ? lv.form : "?";

  // 2. Variable exponent: f^g = e^(g ln f)
  if (e.type === "pow" && containsSymbol(e.exp, x) && containsSymbol(e.base, x)) {
    const lnForm = mul(e.exp, fn("ln", e.base));
    steps.push({ title: "Tulis dalam bentuk eksponensial", before: limL(e, x, t, dir), after: `\\exp\\left(${limL(lnForm, x, t, dir)}\\right)`, operation: "exp-log", rule: { id: "exp-log", name: "Transformasi eksponensial–logaritma", formula: "f^{g} = e^{g \\ln f}" }, reason: "Bentuk pangkat dengan basis dan eksponen variabel (1^∞, 0^0, ∞^0) diubah menjadi perkalian di eksponen; eˣ kontinu sehingga limit dapat dimasukkan ke eksponen." });
    const inner = computeLimit(lnForm, x, t, dir, depth + 1, seen);
    steps.push(...inner.steps);
    let value: LimitValue;
    if (inner.value.kind === "finite") value = { kind: "finite", value: pow(E, inner.value.value) };
    else if (inner.value.kind === "inf") value = inner.value.sign > 0 ? { kind: "inf", sign: 1 } : { kind: "finite", value: ZERO };
    else if (inner.value.kind === "numeric") value = { kind: "numeric", value: Math.exp(inner.value.value) };
    else value = inner.value;
    steps.push({ title: "Kembalikan ke bentuk eksponensial", after: limitValueLatex(value), operation: "exp-back", reason: `Limit = e^(${limitValueLatex(inner.value)}).` });
    return { value, steps, method: "Transformasi eksponensial–logaritma" };
  }

  // 3. Build a quotient N/D
  let N: Expr;
  let D: Expr;
  const nd0 = numerDenom(e);
  N = nd0.numer;
  D = nd0.denom;
  if (e.type === "add") {
    const conj = form === "∞ − ∞" ? conjugateRationalize(e) : null;
    if (conj) {
      const cnd = numerDenom(conj);
      N = cnd.numer;
      D = cnd.denom;
      steps.push({ title: "Kalikan dengan bentuk sekawan", before: limL(e, x, t, dir), after: limL(conj, x, t, dir), operation: "conjugate", rule: { id: "conjugate", name: "Perkalian sekawan", formula: "a - b = \\frac{a^2 - b^2}{a + b}" }, reason: "Bentuk ∞ − ∞ dengan akar dihilangkan dengan mengalikan sekawannya." });
    } else {
      const tg = together(e);
      N = expand(tg.numer);
      D = tg.denom;
      steps.push({ title: "Gabungkan menjadi satu pecahan", before: limL(e, x, t, dir), after: limL(div(N, D), x, t, dir), operation: "combine-fractions", reason: `Bentuk tak tentu ${form} diubah menjadi satu pecahan.` });
    }
  } else if (!containsSymbol(D, x) && e.type === "mul") {
    // 0 · ∞ -> quotient
    const parts = e.factors.map((f) => ({ f, lv: lawLimit(f, x, t, dir) }));
    const zeros = parts.filter((p) => isZeroLV(p.lv)).map((p) => p.f);
    const bigs = parts.filter((p) => p.lv.kind === "inf" || p.lv.kind === "blowup").map((p) => p.f);
    const rest = parts.filter((p) => !zeros.includes(p.f) && !bigs.includes(p.f)).map((p) => p.f);
    if (zeros.length && bigs.length) {
      const Z = mul(...zeros);
      const B = mul(...bigs);
      const logInBig = hasFunction(B, (f) => ["ln", "log", "atan", "asin", "acos"].includes(f.name));
      const expZero = zeros.some((z) => z.type === "pow" && !containsSymbol(z.base, x) && containsSymbol(z.exp, x));
      if (logInBig || expZero) {
        N = mul(B, ...rest);
        D = div(ONE, Z);
      } else {
        N = mul(Z, ...rest);
        D = div(ONE, B);
      }
      steps.push({ title: "Ubah bentuk 0·∞ menjadi pecahan", before: limL(e, x, t, dir), after: limL(div(N, D), x, t, dir), operation: "rewrite-0-inf", rule: { id: "0-inf", name: "Bentuk 0·∞", formula: "f g = \\frac{f}{1/g}" }, reason: "Agar aturan L'Hôpital dapat diterapkan." });
    }
  }

  if (containsSymbol(D, x) && symbolicAllowed) {
    const nl = lawLimit(N, x, t, dir);
    const dl = lawLimit(D, x, t, dir);
    const zz = isZeroLV(nl) && isZeroLV(dl);
    const ii = (nl.kind === "inf" || nl.kind === "blowup") && (dl.kind === "inf" || dl.kind === "blowup");
    const P = toPoly(N, x);
    const Q = toPoly(D, x);
    // Rational function at infinity: degree comparison
    if (P && Q && t.kind === "inf") return rationalAtInfinity(P, Q, x, t, e, steps);
    // Rational function 0/0: factor and cancel
    if (P && Q && zz) {
      const G = Poly.gcd(P, Q);
      if (G.degree >= 1) {
        const Pn = P.divmod(G).q;
        const Qn = Q.divmod(G).q;
        const reduced = div(Pn.toExpr(x), Qn.toExpr(x));
        steps.push({ title: "Bentuk tak tentu 0/0", before: limL(div(N, D), x, t, dir), after: "\\frac{0}{0}", operation: "indeterminate", reason: "Substitusi langsung menghasilkan 0/0, sehingga perlu manipulasi aljabar." });
        steps.push({
          title: "Faktorkan dan coret faktor persekutuan",
          before: `\\frac{${toLatex(P.toExpr(x))}}{${toLatex(Q.toExpr(x))}}`,
          after: `\\frac{\\left(${toLatex(G.toExpr(x))}\\right)\\left(${toLatex(Pn.toExpr(x))}\\right)}{\\left(${toLatex(G.toExpr(x))}\\right)\\left(${toLatex(Qn.toExpr(x))}\\right)} = ${toLatex(reduced)}`,
          operation: "factor-cancel",
          rule: { id: "factor-cancel", name: "Faktorisasi dan pencoretan", formula: "\\frac{(x-a)p(x)}{(x-a)q(x)} = \\frac{p(x)}{q(x)},\\ x \\ne a" },
          reason: `Faktor ${toLatex(G.toExpr(x))} bernilai 0 di titik limit, tetapi boleh dicoret karena x ≠ a selama x mendekati a.`,
        });
        const inner = computeLimit(reduced, x, t, dir, depth + 1, seen);
        return { value: inner.value, steps: [...steps, ...inner.steps], method: "Faktorisasi dan pencoretan" };
      }
    }
    if (zz || ii) {
      const dn = differentiate(N, x);
      const dd = differentiate(D, x);
      const nN = tidy(dn.value);
      const nD = tidy(dd.value);
      const next = div(nN, nD);
      steps.push({
        title: `Aturan L'Hôpital (bentuk ${zz ? "0/0" : "∞/∞"})`,
        before: limL(div(N, D), x, t, dir),
        after: limL(exprSize(next) < exprSize(div(nN, nD)) ? next : div(nN, nD), x, t, dir),
        operation: "lhopital",
        rule: { id: "lhopital", name: "Aturan L'Hôpital", formula: "\\lim \\frac{f}{g} = \\lim \\frac{f'}{g'}", conditions: "Bentuk 0/0 atau ∞/∞; f, g terdiferensial di sekitar titik; g' ≠ 0 di sekitar titik; limit ruas kanan ada." },
        reason: "Turunkan pembilang dan penyebut secara terpisah (bukan aturan hasil bagi).",
        substeps: [dn.step, dd.step],
      });
      if (!seen.has(exprKey(next))) {
        const inner = computeLimit(next, x, t, dir, depth + 1, seen);
        return { value: inner.value, steps: [...steps, ...inner.steps], method: "Aturan L'Hôpital" };
      }
      steps.push({ title: "Aturan L'Hôpital berputar (siklus)", after: "\\text{beralih ke analisis sepihak}", operation: "lhopital-cycle", reason: "Penerapan L'Hôpital menghasilkan kembali bentuk yang sama, sehingga tidak membantu." });
    }
  }

  // 4. Substitution x = 1/u for limits at infinity
  if (t.kind === "inf" && depth < 3) {
    const U = rawSym(x === "u" ? "w" : "u");
    const sub1 = substitute(e, rawSym(x), pow(U, num(-1)));
    if (!containsSymbol(sub1, x)) {
      const inner = computeLimit(sub1, U.name, { kind: "finite", value: ZERO }, t.sign > 0 ? "+" : "-", depth + 1, new Set());
      if (inner.value.kind !== "numeric" && inner.value.kind !== "dne") {
        steps.push({ title: `Substitusi ${x} = 1/${U.name}`, before: limL(e, x, t), after: limL(sub1, U.name, { kind: "finite", value: ZERO }, t.sign > 0 ? "+" : "-"), operation: "reciprocal-substitution", reason: `${x} → ${t.sign > 0 ? "+" : "−"}∞ setara dengan ${U.name} → 0${t.sign > 0 ? "⁺" : "⁻"}.` });
        return { value: inner.value, steps: [...steps, ...inner.steps], method: inner.method };
      }
    }
  }

  // 5. Numeric analysis (clearly labelled)
  const sides = sidesOf(t, dir);
  const behaviours = sides.map((s) => classify(probe(e, x, t, s)));
  const desc = (b: Behaviour) => (b.kind === "finite" ? formatNumber(b.value, 8) : b.kind === "inf" ? (b.sign > 0 ? "+\\infty" : "-\\infty") : "?");
  if (behaviours.length === 2 && behaviours.every((b) => b.kind !== "unknown")) {
    const [r, l] = behaviours;
    const differ = r.kind !== l.kind || (r.kind === "finite" && l.kind === "finite" && Math.abs(r.value - l.value) > 1e-6 * Math.max(1, Math.abs(r.value))) || (r.kind === "inf" && l.kind === "inf" && r.sign !== l.sign);
    if (differ) {
      steps.push({ title: "Bandingkan limit kiri dan kanan", before: limL(e, x, t, dir), after: `\\lim_{${x}\\to a^-} \\approx ${desc(l)},\\quad \\lim_{${x}\\to a^+} \\approx ${desc(r)}`, operation: "one-sided-mismatch", rule: { id: "two-sided", name: "Syarat limit dua sisi", formula: "\\lim_{x\\to a} f = L \\iff \\lim_{x\\to a^-} f = \\lim_{x\\to a^+} f = L" }, reason: "Limit kiri dan kanan berbeda, sehingga limit dua sisi tidak ada." });
      return { value: { kind: "dne", reason: "Limit kiri dan kanan berbeda." }, steps, method: "Analisis limit sepihak" };
    }
  }
  const b = behaviours[0];
  if (b.kind === "inf" && behaviours.every((q) => q.kind === "inf" && q.sign === b.sign)) {
    steps.push({ title: "Estimasi numerik: fungsi membesar tanpa batas", before: limL(e, x, t, dir), after: b.sign > 0 ? "\\infty" : "-\\infty", operation: "numeric-estimate", reason: "Nilai fungsi pada titik-titik yang makin dekat ke target membesar tanpa batas (estimasi numerik)." });
    return { value: { kind: "inf", sign: b.sign }, steps, method: "Estimasi numerik" };
  }
  if (b.kind === "finite" && behaviours.every((q) => q.kind === "finite")) {
    steps.push({ title: "Estimasi numerik", before: limL(e, x, t, dir), after: `\\approx ${formatNumber(b.value, 10)}`, operation: "numeric-estimate", reason: "Tidak ada metode simbolik yang berhasil; nilai limit diestimasi dari barisan titik yang mendekati target. Ini aproksimasi, bukan bukti." });
    return { value: { kind: "numeric", value: b.value }, steps, method: "Estimasi numerik" };
  }
  steps.push({ title: "Limit tidak ada", before: limL(e, x, t, dir), after: "\\text{tidak ada}", operation: "dne", reason: lv.kind === "dne" ? lv.reason : "Nilai fungsi tidak menunjukkan konvergensi (misalnya berosilasi)." });
  return { value: { kind: "dne", reason: "Fungsi tidak konvergen (mungkin berosilasi)." }, steps, method: "Analisis numerik" };
}

function rationalAtInfinity(P: Poly, Q: Poly, x: string, t: LimitTarget & { kind: "inf" }, e: Expr, steps: Step[]): LimitResult {
  const n = P.degree;
  const m = Q.degree;
  const X = rawSym(x);
  steps.push({
    title: `Bagi pembilang dan penyebut dengan ${toLatex(pow(X, num(m)))}`,
    before: limL(e, x, t),
    after: `\\lim \\frac{${toLatex(expand(div(P.toExpr(x), pow(X, num(m)))))}}{${toLatex(expand(div(Q.toExpr(x), pow(X, num(m)))))}}`,
    operation: "divide-highest-power",
    rule: { id: "rational-infinity", name: "Limit fungsi rasional di tak hingga", formula: "\\lim_{x\\to\\pm\\infty}\\frac{1}{x^k} = 0,\\ k > 0" },
    reason: "Suku dengan xᵏ di penyebut menuju 0 ketika x → ±∞.",
  });
  if (n < m) {
    steps.push({ title: "Derajat pembilang < derajat penyebut", after: "0", operation: "degree-compare", reason: `${n} < ${m}, sehingga pecahan menuju 0.` });
    return { value: { kind: "finite", value: ZERO }, steps, method: "Perbandingan derajat" };
  }
  if (n === m) {
    const v = num(P.lead().div(Q.lead()));
    steps.push({ title: "Derajat sama: perbandingan koefisien utama", after: `\\frac{${toLatex(num(P.lead()))}}{${toLatex(num(Q.lead()))}} = ${toLatex(v)}`, operation: "degree-compare", reason: "Semua suku lain menuju 0." });
    return { value: { kind: "finite", value: v }, steps, method: "Perbandingan derajat" };
  }
  const sign = (P.lead().div(Q.lead()).isPositive() ? 1 : -1) * (t.sign < 0 && (n - m) % 2 === 1 ? -1 : 1);
  steps.push({ title: "Derajat pembilang > derajat penyebut", after: sign > 0 ? "\\infty" : "-\\infty", operation: "degree-compare", reason: `${n} > ${m}: pecahan membesar tanpa batas; tanda dari koefisien utama dan arah.` });
  return { value: { kind: "inf", sign: sign as 1 | -1 }, steps, method: "Perbandingan derajat" };
}

/** Numeric verification of a claimed limit. */
export function verifyLimit(e: Expr, x: string, t: LimitTarget, dir: "+" | "-" | undefined, v: LimitValue): { passed: boolean; detail: string } {
  const sides = sidesOf(t, dir);
  const seqs = sides.map((s) => probe(e, x, t, s));
  const bs = seqs.map(classify);
  const sample = seqs.map((s, i) => `${sides[i] > 0 ? (t.kind === "inf" ? "" : "kanan: ") : "kiri: "}${s.slice(-3).map((q) => formatNumber(q, 8)).join(", ")}`).join(" | ");
  if (v.kind === "finite" || v.kind === "numeric") {
    const target = v.kind === "finite" ? evalReal(v.value) : v.value;
    const ok = seqs.every((s) => {
      const fin = s.filter((q) => Number.isFinite(q));
      if (fin.length < 3) return false;
      const errs = fin.map((q) => Math.abs(q - target));
      return errs[errs.length - 1] <= 1e-4 * Math.max(1, Math.abs(target));
    });
    return { passed: ok, detail: `Nilai fungsi di dekat target: ${sample}` };
  }
  if (v.kind === "inf") return { passed: bs.every((b) => b.kind === "inf" && b.sign === v.sign), detail: `Nilai fungsi: ${sample}` };
  if (bs.length === 2) {
    const [a, b] = bs;
    const differ = a.kind === "unknown" || b.kind === "unknown" || a.kind !== b.kind || (a.kind === "finite" && b.kind === "finite" && Math.abs(a.value - b.value) > 1e-6) || (a.kind === "inf" && b.kind === "inf" && a.sign !== b.sign);
    return { passed: differ, detail: `Perilaku kiri/kanan: ${sample}` };
  }
  return { passed: bs[0].kind === "unknown", detail: `Perilaku: ${sample}` };
}
