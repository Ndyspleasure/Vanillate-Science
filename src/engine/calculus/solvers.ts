/**
 * Calculus problem solvers: derivatives (incl. higher-order and partial), indefinite and
 * definite integrals (incl. improper), limits, Taylor polynomials, implicit derivatives,
 * and critical points.
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { checkEquivalent, seededRandom } from "../expr/equivalence";
import { evalReal } from "../expr/evaluate";
import { toLatex, toText } from "../expr/print";
import { add, div, fn, mul, neg, num, pow, sub, substitute, ZERO } from "../expr/simplify";
import { containsSymbol, freeSymbols, rawSym, type Expr } from "../expr/types";
import { isInfinity } from "../parse/convert";
import { adaptiveSimpson, gaussKronrod, numericDerivative, findRealRoots } from "../numeric/methods";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification, exactAnswer, formatNumber, approxAnswer } from "../steps/format";
import type { Answer, Reference, Solution, Step, TableData, VerificationCheck } from "../steps/types";
import { differentiate, tidy } from "./derivative";
import { integrate } from "./integral";
import { computeLimit, limitValueLatex, verifyLimit, type LimitTarget, type LimitValue } from "./limit";
import { solveCore } from "../solvers/equation";

function pickVariable(e: Expr, v?: string): string {
  if (v) return v;
  const vars = [...freeSymbols(e)];
  if (vars.includes("x")) return "x";
  if (vars.length === 0) return "x";
  if (vars.length === 1) return vars[0];
  for (const p of ["t", "y", "z"]) if (vars.includes(p)) return p;
  return vars.sort()[0];
}

// ---------------------------------------------------------------------------
// Derivatives
// ---------------------------------------------------------------------------

function numericDerivativeCheck(f: Expr, d: Expr, x: string, order: number): VerificationCheck {
  const others = [...freeSymbols(f)].filter((v) => v !== x);
  const rand = seededRandom(4242);
  let valid = 0;
  let worst = 0;
  let bad: string | null = null;
  for (let k = 0; k < 60 && valid < 8; k++) {
    const env: Record<string, number> = {};
    for (const o of others) env[o] = 0.3 + 2 * rand();
    const x0 = (k < 30 ? -2.5 : 0.2) + 2.7 * rand();
    const F = (t: number) => evalReal(f, { ...env, [x]: t });
    const exact = evalReal(d, { ...env, [x]: x0 });
    const fx = F(x0);
    if (!Number.isFinite(exact) || !Number.isFinite(fx) || Math.abs(exact) > 1e8) continue;
    const approx = numericDerivative(F, x0, order);
    if (!Number.isFinite(approx)) continue;
    valid++;
    const err = Math.abs(approx - exact) / Math.max(1, Math.abs(exact));
    worst = Math.max(worst, err);
    if (err > (order === 1 ? 1e-6 : 1e-3)) {
      bad = `${x} = ${x0.toPrecision(5)}: numerik ${approx.toPrecision(8)}, simbolik ${exact.toPrecision(8)}`;
      break;
    }
  }
  if (bad) return { description: "Bandingkan dengan turunan numerik (beda pusat + ekstrapolasi Richardson)", passed: false, method: "Diferensiasi numerik", detail: bad };
  if (valid < 3) return { description: "Bandingkan dengan turunan numerik", passed: false, method: "Diferensiasi numerik", detail: "Tidak cukup titik uji valid pada domain fungsi." };
  return { description: "Bandingkan dengan turunan numerik (beda pusat + ekstrapolasi Richardson)", passed: true, method: "Diferensiasi numerik", detail: `Cocok pada ${valid} titik uji; galat relatif maksimum ${worst.toExponential(2)}.` };
}

export function solveDerivative(input: string, f: Expr, inputLatex: string, options: { variable?: string; order?: number; warnings?: string[] } = {}): Solution {
  const x = pickVariable(f, options.variable);
  const order = options.order ?? 1;
  if (order < 1 || order > 10) throw new MathError("invalid-input", "Orde turunan harus 1–10.", { module: "derivative" });
  const steps: Step[] = [];
  let current = f;
  const partial = [...freeSymbols(f)].filter((v) => v !== x).length > 0;
  for (let k = 1; k <= order; k++) {
    const r = differentiate(current, x);
    const t = tidy(r.value);
    if (order > 1) {
      steps.push({ title: `Turunan ke-${k}`, before: `\\frac{d}{d${x}}\\left[${toLatex(current)}\\right]`, after: toLatex(t), operation: "derivative-order", reason: `Turunkan hasil turunan ke-${k - 1}.`, substeps: [r.step] });
    } else {
      steps.push(r.step);
      if (toLatex(t) !== toLatex(r.value)) steps.push({ title: "Sederhanakan hasil", before: toLatex(r.value), after: toLatex(t), operation: "tidy", reason: "Gabungkan suku dan pecahan agar bentuk akhir lebih ringkas.", check: undefined });
    }
    current = t;
  }
  const checks: VerificationCheck[] = [numericDerivativeCheck(f, current, x, order)];
  const notation = order === 1 ? (partial ? `\\frac{\\partial}{\\partial ${x}}` : `\\frac{d}{d${x}}`) : partial ? `\\frac{\\partial^{${order}}}{\\partial ${x}^{${order}}}` : `\\frac{d^{${order}}}{d${x}^{${order}}}`;
  const vars = freeSymbols(f);
  return makeSolution({
    kind: "derivative",
    title: order === 1 ? (partial ? "Turunan parsial" : "Turunan") : `Turunan ke-${order}`,
    input,
    inputLatex: inputLatex || `${notation}\\left[${toLatex(f)}\\right]`,
    answers: [{ ...exactAnswer(current), label: order === 1 ? (partial ? `∂/∂${x}` : `f'(${x})`) : `f^(${order})(${x})` }],
    method: { name: "Aturan turunan", description: "Aturan jumlah, konstanta, pangkat, perkalian, hasil bagi, dan rantai diterapkan secara rekursif sesuai struktur ekspresi." },
    steps,
    verification: aggregateVerification(checks),
    module: "derivative",
    assumptions: partial ? [`Variabel selain ${x} (${[...vars].filter((v) => v !== x).join(", ")}) diperlakukan sebagai konstanta.`] : [],
    notes: options.warnings ?? [],
    plot: vars.size === 1 ? { kind: "function", variable: x, functions: [{ expr: toText(f), label: `f(${x}) = ${toText(f)}` }, { expr: toText(current), label: order === 1 ? `f'(${x})` : `f^(${order})(${x})` }] } : undefined,
    references: [REFERENCES.openstaxCalc1],
  });
}

// ---------------------------------------------------------------------------
// Integrals
// ---------------------------------------------------------------------------

function antiderivativeCheck(f: Expr, F: Expr, x: string): VerificationCheck {
  try {
    const dF = differentiate(F, x).value;
    const eq = checkEquivalent(dF, f, { variables: [...new Set([...freeSymbols(f), ...freeSymbols(F)])] });
    return {
      description: "Turunkan kembali hasil integral dan bandingkan dengan integran",
      latex: `\\frac{d}{d${x}}\\left[${toLatex(F)}\\right] = ${toLatex(dF)}`,
      passed: eq.equivalent,
      method: eq.method === "symbolic" ? "Diferensiasi balik (simbolik)" : "Diferensiasi balik (kesetaraan numerik)",
      detail: eq.detail,
    };
  } catch (e) {
    return { description: "Turunkan kembali hasil integral", passed: false, method: "Diferensiasi balik", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Real points in [a, b] where the integrand is not defined (poles, log arguments = 0). */
function singularities(f: Expr, x: string, a: number, b: number): number[] {
  const bases: Expr[] = [];
  const visit = (e: Expr) => {
    if (e.type === "pow" && e.exp.type === "num" && e.exp.value.isNegative() && containsSymbol(e.base, x)) bases.push(e.base);
    if (e.type === "fn" && (e.name === "ln" || e.name === "log") && containsSymbol(e.args[0], x)) bases.push(e.args[0]);
    if (e.type === "fn" && ["tan", "sec"].includes(e.name) && containsSymbol(e.args[0], x)) bases.push(fn("cos", e.args[0]));
    if (e.type === "fn" && ["cot", "csc"].includes(e.name) && containsSymbol(e.args[0], x)) bases.push(fn("sin", e.args[0]));
    const kids = e.type === "add" ? e.terms : e.type === "mul" ? e.factors : e.type === "pow" ? [e.base, e.exp] : e.type === "fn" ? e.args : [];
    kids.forEach(visit);
  };
  visit(f);
  const pts: number[] = [];
  const lo = Number.isFinite(a) ? a : -1e6;
  const hi = Number.isFinite(b) ? b : 1e6;
  for (const base of bases) {
    const F = (t: number) => evalReal(base, { [x]: t });
    const span = hi - lo;
    const search = findRealRoots(F, lo - 1e-9 * Math.max(1, span), hi + 1e-9 * Math.max(1, span), Math.min(4000, Math.max(400, Math.ceil(span * 50))), 50);
    for (const r of search.roots) {
      if (r.root >= lo - 1e-12 && r.root <= hi + 1e-12 && !pts.some((p) => Math.abs(p - r.root) < 1e-9)) pts.push(r.root);
    }
  }
  return pts.sort((p, q) => p - q);
}

function numericIntegral(f: Expr, x: string, a: number, b: number) {
  const F = (t: number) => evalReal(f, { [x]: t });
  if (Number.isFinite(a) && Number.isFinite(b)) {
    const gk = gaussKronrod(F, a, b);
    if (gk.converged) return gk;
    return adaptiveSimpson(F, a, b);
  }
  return gaussKronrod(F, a, b);
}

function boundValue(e: Expr): number {
  const s = isInfinity(e);
  if (s !== 0) return s * Infinity;
  return evalReal(e);
}

export function solveIntegral(input: string, f: Expr, inputLatex: string, options: { variable?: string; lower?: Expr; upper?: Expr; warnings?: string[] } = {}): Solution {
  const x = pickVariable(f, options.variable);
  const X = rawSym(x);
  const notes = [...(options.warnings ?? [])];
  const definite = options.lower !== undefined && options.upper !== undefined;
  const result = integrate(f, x);
  const references: Reference[] = [REFERENCES.openstaxCalc2];
  const vars = freeSymbols(f);
  if (!definite) {
    if (!result) {
      throw new MathError("unsupported", "Engine tidak menemukan antiturunan elementer untuk integral ini.", {
        module: "integral",
        cause: "Tidak ada metode (tabel, substitusi, parsial, pecahan parsial, identitas trigonometri) yang berhasil. Beberapa fungsi, misalnya e^(x²) atau sin(x)/x, memang tidak memiliki antiturunan elementer.",
        hint: "Untuk integral tentu, tambahkan batas (misalnya ∫_0^1 ...) agar dapat dihitung secara numerik.",
      });
    }
    const F = tidy(result.value);
    const steps: Step[] = [result.step];
    if (toLatex(F) !== toLatex(result.value)) steps.push({ title: "Sederhanakan", before: toLatex(result.value), after: toLatex(F), operation: "tidy", reason: "Bentuk akhir dirapikan." });
    steps.push({ title: "Tambahkan konstanta integrasi", after: `${toLatex(F)} + C`, operation: "add-constant", rule: { id: "constant-of-integration", name: "Konstanta integrasi", formula: "\\int f(x)\\,dx = F(x) + C" }, reason: "Antiturunan hanya unik sampai konstanta penjumlahan." });
    const ans = exactAnswer(F);
    return makeSolution({
      kind: "integral",
      title: "Integral tak tentu",
      input,
      inputLatex,
      answers: [{ ...ans, latex: `${ans.latex} + C`, text: `${ans.text} + C`, approx: undefined, label: "Antiturunan" }],
      method: { name: result.step.rule?.name ?? result.step.title, description: "Metode dipilih berdasarkan struktur integran: tabel, linearitas, substitusi, parsial, pecahan parsial, atau identitas trigonometri." },
      steps,
      verification: aggregateVerification([antiderivativeCheck(f, F, x)]),
      module: "integral",
      assumptions: ["C adalah konstanta sembarang.", ...(toLatex(F).includes("\\left|") ? ["Nilai mutlak di dalam ln memastikan hasil berlaku pada kedua sisi titik singular (pada setiap interval secara terpisah)."] : [])],
      notes,
      plot: vars.size <= 1 ? { kind: "function", variable: x, functions: [{ expr: toText(f), label: `f(${x})` }, { expr: toText(F), label: `F(${x}) (C = 0)` }] } : undefined,
      references,
    });
  }
  const lo = options.lower!;
  const hi = options.upper!;
  const a = boundValue(lo);
  const b = boundValue(hi);
  if (vars.size > 1 || [...vars].some((v) => v !== x)) {
    throw new MathError("unsupported", "Integral tentu dengan parameter lain belum didukung.", { module: "integral" });
  }
  if (Number.isNaN(a) || Number.isNaN(b)) throw new MathError("invalid-input", "Batas integral harus berupa bilangan atau ±∞.", { module: "integral" });
  const steps: Step[] = [];
  const checks: VerificationCheck[] = [];
  const answers: Answer[] = [];
  const lowerL = Number.isFinite(a) ? toLatex(lo) : a > 0 ? "\\infty" : "-\\infty";
  const upperL = Number.isFinite(b) ? toLatex(hi) : b > 0 ? "\\infty" : "-\\infty";
  let sign = 1;
  let [p, q] = [a, b];
  if (a > b) {
    sign = -1;
    [p, q] = [b, a];
    notes.push("Batas bawah > batas atas: ∫ₐᵇ f = −∫ᵇₐ f.");
  }
  const sing = singularities(f, x, p, q);
  const improper = !Number.isFinite(p) || !Number.isFinite(q) || sing.length > 0;
  let exactValue: Expr | null = null;
  let divergent: string | null = null;
  const numeric = numericIntegral(f, x, p, q);
  // domain check: integrand undefined on part of the interval (e.g. sqrt of negative)
  if (Number.isFinite(p) && Number.isFinite(q)) {
    for (let k = 1; k < 50; k++) {
      const t = p + ((q - p) * k) / 50;
      if (sing.some((s) => Math.abs(s - t) < 1e-9)) continue;
      if (Number.isNaN(evalReal(f, { [x]: t }))) {
        throw new MathError("domain-error", "Integran tidak terdefinisi (bukan bilangan real) pada sebagian interval integrasi.", {
          module: "integral",
          cause: `Misalnya pada ${x} = ${formatNumber(t, 6)}.`,
        });
      }
    }
  }
  if (result) {
    const F = tidy(result.value);
    steps.push({ title: "Cari antiturunan F(x)", before: `\\int ${toLatex(f)}\\,d${x}`, after: `F(${x}) = ${toLatex(F)}`, operation: "antiderivative", reason: result.step.rule?.name ?? "", substeps: [result.step] });
    checks.push(antiderivativeCheck(f, F, x));
    if (!improper) {
      const Fb = substitute(F, X, hi);
      const Fa = substitute(F, X, lo);
      exactValue = sub(Fb, Fa);
      steps.push({
        title: "Terapkan Teorema Dasar Kalkulus",
        after: `F(${upperL}) - F(${lowerL}) = \\left(${toLatex(Fb)}\\right) - \\left(${toLatex(Fa)}\\right) = ${toLatex(exactValue)}`,
        operation: "ftc",
        rule: { id: "ftc", name: "Teorema Dasar Kalkulus II", formula: "\\int_a^b f(x)\\,dx = F(b) - F(a)", conditions: "f kontinu pada [a, b]" },
        reason: "Integran kontinu pada seluruh interval sehingga TDK berlaku.",
      });
    } else {
      // improper: split at singularities and use limits of F
      const cuts = [p, ...sing.filter((s) => s > p && s < q), q];
      steps.push({ title: "Integral tak wajar", after: sing.length ? `\\text{titik singular: } ${sing.map((s) => `${x} = ${formatNumber(s, 8)}`).join(",\\ ")}` : "\\text{batas tak hingga}", operation: "improper", rule: { id: "improper", name: "Integral tak wajar", formula: "\\int_a^{\\infty} f\\,dx = \\lim_{t\\to\\infty}\\int_a^{t} f\\,dx" }, reason: "Integral didefinisikan sebagai limit karena interval tak terbatas atau integran tidak terbatas di suatu titik; TDK tidak boleh diterapkan langsung melewati singularitas." });
      let total: Expr = ZERO;
      for (let i = 0; i < cuts.length - 1; i++) {
        const l = cuts[i];
        const r = cuts[i + 1];
        const lim = (pt: number, side: "+" | "-"): LimitValue => {
          const target: LimitTarget = Number.isFinite(pt) ? { kind: "finite", value: exactPoint(pt, lo, hi) } : { kind: "inf", sign: pt > 0 ? 1 : -1 };
          return computeLimit(F, x, target, Number.isFinite(pt) ? side : undefined).value;
        };
        const leftSingular = sing.some((s) => Math.abs(s - l) < 1e-12) || !Number.isFinite(l);
        const rightSingular = sing.some((s) => Math.abs(s - r) < 1e-12) || !Number.isFinite(r);
        const Fr: LimitValue = rightSingular ? lim(r, "-") : { kind: "finite", value: substitute(F, X, exactPoint(r, lo, hi)) };
        const Fl: LimitValue = leftSingular ? lim(l, "+") : { kind: "finite", value: substitute(F, X, exactPoint(l, lo, hi)) };
        steps.push({ title: `Bagian [${formatNumber(l, 6)}, ${formatNumber(r, 6)}]`, after: `\\lim F(${x})\\big|_{\\text{atas}} = ${limitValueLatex(Fr)},\\quad \\lim F(${x})\\big|_{\\text{bawah}} = ${limitValueLatex(Fl)}`, operation: "improper-part", reason: "Hitung limit antiturunan di ujung-ujung yang singular." });
        if (Fr.kind === "inf" || Fl.kind === "inf") {
          divergent = `Limit antiturunan di ujung interval tak hingga, sehingga integral divergen.`;
          break;
        }
        if (Fr.kind !== "finite" || Fl.kind !== "finite") {
          exactValue = null;
          divergent = null;
          total = ZERO;
          break;
        }
        total = add(total, sub(Fr.value, Fl.value));
        exactValue = total;
      }
    }
  } else {
    notes.push("Engine tidak menemukan antiturunan elementer; nilai integral dihitung secara numerik.");
  }
  if (divergent) {
    steps.push({ title: "Integral divergen", after: "\\text{divergen}", operation: "divergent", reason: divergent });
    answers.push({ label: "Hasil", latex: "\\text{divergen}", text: "divergen", exact: true });
    checks.push({ description: "Integrasi numerik tidak konvergen / membesar", passed: !numeric.converged || Math.abs(numeric.value) > 1e6, method: "Integrasi numerik", detail: `Estimasi numerik: ${formatNumber(numeric.value, 8)} (konvergen: ${numeric.converged ? "ya" : "tidak"}).` });
  } else if (exactValue) {
    const v = sign < 0 ? neg(exactValue) : exactValue;
    answers.push({ ...exactAnswer(v), label: "Nilai integral" });
    const ev = evalReal(v);
    const ok = numeric.converged && Math.abs(ev - sign * numeric.value) <= Math.max(1e-7, 1e-7 * Math.abs(ev), numeric.errorEstimate * 10);
    checks.push({ description: `Bandingkan dengan integrasi numerik (${numeric.method})`, latex: `${formatNumber(ev, 12)} \\approx ${formatNumber(sign * numeric.value, 12)}`, passed: ok, method: "Integrasi numerik", detail: `Estimasi galat numerik ${numeric.errorEstimate.toExponential(2)}, ${numeric.evaluations} evaluasi fungsi.` });
  } else {
    if (!numeric.converged) {
      throw new MathError("numerical-instability", "Integrasi numerik tidak konvergen.", { module: "integral", cause: "Integran mungkin tidak terbatas atau berosilasi kuat pada interval.", details: { estimate: numeric.value } });
    }
    const val = sign * numeric.value;
    steps.push({ title: "Integrasi numerik", after: `\\int_{${lowerL}}^{${upperL}} ${toLatex(f)}\\,d${x} \\approx ${formatNumber(val, 12)}`, operation: "numeric-integration", rule: { id: "gauss-kronrod", name: numeric.method, formula: "\\int_a^b f \\approx \\sum w_i f(x_i)" }, reason: `Estimasi galat ${numeric.errorEstimate.toExponential(2)} dengan ${numeric.evaluations} evaluasi fungsi.` });
    answers.push({ ...approxAnswer(val, "Nilai integral (aproksimasi)", 12) });
    const simp = Number.isFinite(p) && Number.isFinite(q) ? adaptiveSimpson((t) => evalReal(f, { [x]: t }), p, q, 1e-9) : null;
    if (simp) checks.push({ description: "Bandingkan dua metode numerik independen (Gauss–Kronrod vs Simpson adaptif)", passed: Math.abs(simp.value - numeric.value) <= 1e-6 * Math.max(1, Math.abs(numeric.value)), method: "Integrasi numerik", detail: `Simpson: ${formatNumber(sign * simp.value, 12)}` });
    references.push(REFERENCES.numericalRecipes);
  }
  return makeSolution({
    kind: "integral",
    title: improper ? "Integral tentu (tak wajar)" : "Integral tentu",
    input,
    inputLatex,
    answers,
    method: exactValue ? { name: "Teorema Dasar Kalkulus", description: "Cari antiturunan F lalu hitung F(b) − F(a) (dengan limit bila tak wajar).", formula: "\\int_a^b f(x)\\,dx = F(b) - F(a)" } : { name: "Integrasi numerik", description: "Kuadratur Gauss–Kronrod adaptif dengan estimasi galat." },
    steps,
    verification: aggregateVerification(checks),
    module: "integral",
    notes,
    plot: Number.isFinite(p) && Number.isFinite(q) ? { kind: "function", variable: x, functions: [{ expr: toText(f), label: `f(${x})` }], shade: { from: p, to: q, functionIndex: 0 }, xRange: [p - (q - p) * 0.3 - 0.5, q + (q - p) * 0.3 + 0.5] } : undefined,
    references,
  });
}

function exactPoint(v: number, lo: Expr, hi: Expr): Expr {
  if (Math.abs(evalReal(lo) - v) < 1e-12) return lo;
  if (Math.abs(evalReal(hi) - v) < 1e-12) return hi;
  const r = Rational.fromNumber(Number(v.toPrecision(15)));
  return num(r);
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export function solveLimit(input: string, f: Expr, variable: string, to: Expr, direction: "+" | "-" | undefined, inputLatex: string, warnings: string[] = []): Solution {
  const x = variable || pickVariable(f);
  const inf = isInfinity(to);
  const target: LimitTarget = inf !== 0 ? { kind: "inf", sign: inf as 1 | -1 } : { kind: "finite", value: to };
  if (target.kind === "finite" && freeSymbols(to).size > 0) throw new MathError("unsupported", "Titik limit harus berupa konstanta.", { module: "limit" });
  const res = computeLimit(f, x, target, direction);
  const v = res.value;
  const answers: Answer[] = [];
  if (v.kind === "finite") answers.push({ ...exactAnswer(v.value), label: "Nilai limit" });
  else if (v.kind === "inf") answers.push({ label: "Nilai limit", latex: v.sign > 0 ? "\\infty" : "-\\infty", text: v.sign > 0 ? "∞" : "-∞", exact: true });
  else if (v.kind === "numeric") answers.push(approxAnswer(v.value, "Nilai limit (estimasi numerik)"));
  else answers.push({ label: "Nilai limit", latex: "\\text{tidak ada}", text: `tidak ada — ${v.reason}`, exact: true });
  const ver = verifyLimit(f, x, target, direction, v);
  const checks: VerificationCheck[] = [{ description: "Evaluasi fungsi pada barisan titik yang mendekati target", passed: ver.passed, method: "Barisan numerik", detail: ver.detail }];
  const notes = [...warnings];
  if (v.kind === "numeric") notes.push("Hasil berupa estimasi numerik, bukan hasil simbolik yang terbukti.");
  const vars = freeSymbols(f);
  return makeSolution({
    kind: "limit",
    title: direction ? "Limit sepihak" : "Limit",
    input,
    inputLatex,
    answers,
    method: { name: res.method, description: "Metode dipilih berdasarkan bentuk hasil substitusi: kontinu, 0/0, ∞/∞, c/0, 0·∞, ∞−∞, atau bentuk pangkat tak tentu." },
    steps: res.steps,
    verification: aggregateVerification(checks),
    module: "limit",
    notes,
    plot: vars.size === 1 ? { kind: "function", variable: x, functions: [{ expr: toText(f), label: `f(${x})` }], xRange: target.kind === "finite" ? [evalReal(target.value) - 4, evalReal(target.value) + 4] : undefined, points: target.kind === "finite" && (v.kind === "finite" || v.kind === "numeric") ? [{ x: evalReal(target.value), y: v.kind === "finite" ? evalReal(v.value) : v.value, label: "nilai limit" }] : [] } : undefined,
    references: [REFERENCES.openstaxCalc1],
  });
}

// ---------------------------------------------------------------------------
// Taylor polynomial
// ---------------------------------------------------------------------------

export function solveTaylor(input: string, f: Expr, variable: string | undefined, center: Expr, order: number, warnings: string[] = []): Solution {
  const x = pickVariable(f, variable);
  if (!Number.isInteger(order) || order < 0 || order > 12) throw new MathError("invalid-input", "Orde deret Taylor harus bilangan bulat 0–12.", { module: "series" });
  const X = rawSym(x);
  const steps: Step[] = [];
  const rows: string[][] = [];
  let d = f;
  const terms: Expr[] = [];
  let factorial = Rational.ONE;
  for (let k = 0; k <= order; k++) {
    if (k > 0) {
      d = tidy(differentiate(d, x).value);
      factorial = factorial.mul(Rational.of(k));
    }
    let val: Expr;
    try {
      val = substitute(d, X, center);
    } catch (e) {
      throw new MathError("domain-error", `Turunan ke-${k} tidak terdefinisi di titik pusat.`, { module: "series", cause: e instanceof Error ? e.message : String(e) });
    }
    const coef = div(val, num(factorial));
    rows.push([String(k), toText(d), toText(val), toText(coef)]);
    terms.push(mul(coef, pow(sub(X, center), num(k))));
  }
  const T = add(...terms);
  steps.push({ title: "Hitung turunan-turunan di titik pusat", after: `f^{(k)}(${toLatex(center)}),\\ k = 0, \\ldots, ${order}`, operation: "derivatives-at-center", rule: { id: "taylor", name: "Deret Taylor", formula: "T_n(x) = \\sum_{k=0}^{n} \\frac{f^{(k)}(a)}{k!}(x - a)^k" }, reason: "Koefisien deret Taylor adalah turunan ke-k di titik a dibagi k!." });
  steps.push({ title: "Susun polinomial Taylor", after: `T_{${order}}(${x}) = ${toLatex(T)}`, operation: "assemble", reason: "Jumlahkan semua suku." });
  // verification: error shrinks like h^(n+1)
  const a = evalReal(center);
  const errAt = (h: number) => Math.abs(evalReal(f, { [x]: a + h }) - evalReal(T, { [x]: a + h }));
  const e1 = errAt(0.1);
  const e2 = errAt(0.05);
  const ratio = e2 > 0 ? e1 / e2 : Infinity;
  const expected = Math.pow(2, order + 1);
  const passed = (e1 < 1e-12 && e2 < 1e-12) || (ratio > expected * 0.5 && ratio < expected * 4) || e2 < 1e-10;
  const checks: VerificationCheck[] = [{ description: `Galat |f − T| mengecil seperti h^${order + 1} di dekat titik pusat`, passed, method: "Analisis galat numerik", detail: `|f−T| = ${e1.toExponential(2)} (h = 0.1), ${e2.toExponential(2)} (h = 0.05); rasio ${Number.isFinite(ratio) ? ratio.toFixed(2) : "∞"} (teori ≈ ${expected}).` }];
  const table: TableData = { caption: "Turunan dan koefisien", headers: ["k", "f^(k)(x)", "f^(k)(a)", "koefisien f^(k)(a)/k!"], rows };
  return makeSolution({
    kind: "series",
    title: evalReal(center) === 0 ? "Deret Maclaurin" : "Deret Taylor",
    input,
    inputLatex: `T_{${order}}\\left[${toLatex(f)}\\right],\\ ${x} = ${toLatex(center)}`,
    answers: [{ ...exactAnswer(T), label: `T${order}(${x})` }],
    method: { name: "Polinomial Taylor", description: "Turunkan fungsi berulang kali, evaluasi di titik pusat, lalu jumlahkan suku-sukunya.", formula: "T_n(x) = \\sum_{k=0}^{n} \\frac{f^{(k)}(a)}{k!}(x-a)^k" },
    steps,
    verification: aggregateVerification(checks),
    module: "series",
    notes: warnings,
    tables: [table],
    plot: freeSymbols(f).size <= 1 ? { kind: "function", variable: x, functions: [{ expr: toText(f), label: `f(${x})` }, { expr: toText(T), label: `T${order}(${x})` }], xRange: [a - 3, a + 3] } : undefined,
    references: [REFERENCES.openstaxCalc2],
  });
}

// ---------------------------------------------------------------------------
// Critical points and extrema
// ---------------------------------------------------------------------------

export function solveExtrema(input: string, f: Expr, variable?: string, warnings: string[] = []): Solution {
  const x = pickVariable(f, variable);
  if (freeSymbols(f).size > 1) throw new MathError("unsupported", "Analisis titik kritis hanya untuk fungsi satu variabel.", { module: "extrema" });
  const X = rawSym(x);
  const d1 = differentiate(f, x);
  const fp = tidy(d1.value);
  const d2 = tidy(differentiate(fp, x).value);
  const steps: Step[] = [
    { title: "Turunan pertama", before: `f(${x}) = ${toLatex(f)}`, after: `f'(${x}) = ${toLatex(fp)}`, operation: "first-derivative", reason: "Titik kritis terjadi saat f'(x) = 0 atau f' tidak terdefinisi.", substeps: [d1.step] },
  ];
  const eqAttempt = solveCore(fp, ZERO, x);
  const critValue = (r: (typeof eqAttempt.roots)[number]) => (r.expr ? evalReal(r.expr) : r.approx!.re);
  const crit = eqAttempt.roots
    .filter((r) => !r.periodic && (r.expr ? !containsSymbol(r.expr, "i") && Number.isFinite(evalReal(r.expr)) : r.approx && Math.abs(r.approx.im) < 1e-12))
    .sort((a, b) => critValue(a) - critValue(b));
  steps.push({ title: "Selesaikan f'(x) = 0", after: crit.length ? crit.map((r) => `${x} = ${r.expr ? toLatex(r.expr) : formatNumber(r.approx!.re)}`).join(",\\ ") : "\\text{tidak ada titik kritis real}", operation: "solve-critical", reason: eqAttempt.method.name, substeps: eqAttempt.steps });
  steps.push({ title: "Turunan kedua", after: `f''(${x}) = ${toLatex(d2)}`, operation: "second-derivative", rule: { id: "second-derivative-test", name: "Uji turunan kedua", formula: "f''(c) > 0 \\Rightarrow \\text{minimum lokal},\\ f''(c) < 0 \\Rightarrow \\text{maksimum lokal}" }, reason: "Tanda turunan kedua menentukan jenis titik kritis." });
  const rows: string[][] = [];
  const answers: Answer[] = [];
  const checks: VerificationCheck[] = [];
  for (const r of crit) {
    const c = r.expr ?? num(Rational.fromNumber(r.approx!.re));
    const cv = evalReal(c);
    const fc = r.expr ? substitute(f, X, c) : null;
    const fv = evalReal(f, { [x]: cv });
    const s = evalReal(d2, { [x]: cv });
    let kind: string;
    if (s > 1e-12) kind = "minimum lokal";
    else if (s < -1e-12) kind = "maksimum lokal";
    else {
      const l = evalReal(fp, { [x]: cv - 1e-4 });
      const rr = evalReal(fp, { [x]: cv + 1e-4 });
      kind = l < 0 && rr > 0 ? "minimum lokal (uji turunan pertama)" : l > 0 && rr < 0 ? "maksimum lokal (uji turunan pertama)" : "bukan ekstrem (titik belok/datar)";
    }
    rows.push([r.expr ? toText(c) : formatNumber(cv), fc ? toText(fc) : formatNumber(fv), formatNumber(s, 8), kind]);
    answers.push({ label: kind, latex: `\\left(${toLatex(c)},\\ ${fc ? toLatex(fc) : formatNumber(fv)}\\right)`, text: `(${r.expr ? toText(c) : formatNumber(cv)}, ${fc ? toText(fc) : formatNumber(fv)})`, exact: !!r.expr, approx: `(${formatNumber(cv, 8)}, ${formatNumber(fv, 8)})` });
    const h = 1e-3 * Math.max(1, Math.abs(cv));
    const left = evalReal(f, { [x]: cv - h });
    const right = evalReal(f, { [x]: cv + h });
    const isMin = kind.startsWith("minimum");
    const isMax = kind.startsWith("maksimum");
    const ok = isMin ? left >= fv - 1e-12 && right >= fv - 1e-12 : isMax ? left <= fv + 1e-12 && right <= fv + 1e-12 : true;
    checks.push({ description: `Bandingkan f(${formatNumber(cv, 6)}) dengan nilai di sekitarnya`, passed: ok, method: "Pengujian numerik lokal", detail: `f(c−h) = ${formatNumber(left, 8)}, f(c) = ${formatNumber(fv, 8)}, f(c+h) = ${formatNumber(right, 8)}` });
  }
  if (!answers.length) answers.push({ label: "Titik kritis", latex: "\\varnothing", text: "tidak ada titik kritis real", exact: true });
  return makeSolution({
    kind: "derivative",
    title: "Titik kritis dan ekstrem lokal",
    input,
    inputLatex: `f(${x}) = ${toLatex(f)}`,
    answers,
    method: { name: "Uji turunan pertama dan kedua", description: "Cari f'(x) = 0 lalu klasifikasikan dengan tanda f''(x)." },
    steps,
    verification: aggregateVerification(checks),
    module: "extrema",
    notes: warnings,
    tables: [{ caption: "Klasifikasi titik kritis", headers: ["x", "f(x)", "f''(x)", "Jenis"], rows }],
    plot: { kind: "function", variable: x, functions: [{ expr: toText(f), label: `f(${x})` }], points: crit.map((r) => { const cv = r.expr ? evalReal(r.expr) : r.approx!.re; return { x: cv, y: evalReal(f, { [x]: cv }), label: formatNumber(cv, 5) }; }) },
    references: [REFERENCES.openstaxCalc1],
  });
}

// ---------------------------------------------------------------------------
// Implicit differentiation
// ---------------------------------------------------------------------------

export function solveImplicit(input: string, L: Expr, R: Expr, x = "x", y = "y", warnings: string[] = []): Solution {
  const F = sub(L, R);
  const Fx = differentiate(F, x);
  const Fy = differentiate(F, y);
  const dydx = tidy(neg(div(Fx.value, Fy.value)));
  const steps: Step[] = [
    { title: "Tulis sebagai F(x, y) = 0", after: `F(${x}, ${y}) = ${toLatex(F)}`, operation: "implicit-form", reason: "Pindahkan semua suku ke satu ruas." },
    { title: `Turunan parsial terhadap ${x}`, after: `F_{${x}} = ${toLatex(Fx.value)}`, operation: "partial-x", reason: `${y} diperlakukan sebagai konstanta.`, substeps: [Fx.step] },
    { title: `Turunan parsial terhadap ${y}`, after: `F_{${y}} = ${toLatex(Fy.value)}`, operation: "partial-y", reason: `${x} diperlakukan sebagai konstanta.`, substeps: [Fy.step] },
    { title: "Gunakan rumus turunan implisit", after: `\\frac{d${y}}{d${x}} = -\\frac{F_{${x}}}{F_{${y}}} = ${toLatex(dydx)}`, operation: "implicit-formula", rule: { id: "implicit", name: "Teorema fungsi implisit", formula: "\\frac{dy}{dx} = -\\frac{F_x}{F_y},\\ F_y \\ne 0" }, reason: "Menurunkan F(x, y(x)) = 0 dengan aturan rantai memberi Fₓ + F_y·y' = 0." },
  ];
  // numeric verification: find a point on the curve and compare slopes
  const checks: VerificationCheck[] = [];
  const Fnum = (xv: number, yv: number) => evalReal(F, { [x]: xv, [y]: yv });
  for (const x0 of [0.37, 0.81, -0.63, 1.3]) {
    const roots = findRealRoots((t) => Fnum(x0, t), -50, 50, 2000, 4).roots;
    if (!roots.length) continue;
    const y0 = roots[0].root;
    const h = 1e-5;
    const yAt = (xv: number) => {
      const rr = findRealRoots((t) => Fnum(xv, t), y0 - 0.01, y0 + 0.01, 200, 2).roots;
      return rr.length ? rr[0].root : NaN;
    };
    const slopeNum = (yAt(x0 + h) - yAt(x0 - h)) / (2 * h);
    const slope = evalReal(dydx, { [x]: x0, [y]: y0 });
    if (!Number.isFinite(slopeNum) || !Number.isFinite(slope)) continue;
    checks.push({ description: `Kemiringan kurva di titik (${formatNumber(x0, 4)}, ${formatNumber(y0, 6)})`, passed: Math.abs(slopeNum - slope) <= 1e-4 * Math.max(1, Math.abs(slope)), method: "Diferensiasi numerik pada kurva", detail: `numerik ${formatNumber(slopeNum, 8)}, rumus ${formatNumber(slope, 8)}` });
    break;
  }
  return makeSolution({
    kind: "derivative",
    title: "Turunan implisit",
    input,
    inputLatex: `${toLatex(L)} = ${toLatex(R)}`,
    answers: [{ ...exactAnswer(dydx), label: `d${y}/d${x}` }],
    method: { name: "Turunan implisit", description: "Turunkan kedua ruas terhadap x dengan memandang y sebagai fungsi x." },
    steps,
    verification: aggregateVerification(checks),
    module: "derivative",
    assumptions: [`F_${y} ≠ 0 (kurva dapat dinyatakan secara lokal sebagai y = y(x)).`],
    notes: warnings,
    references: [REFERENCES.openstaxCalc1],
  });
}

export { rawSym };
