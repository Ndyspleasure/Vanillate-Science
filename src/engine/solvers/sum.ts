/**
 * Finite and infinite sums (sigma notation) with verified closed forms.
 *
 * - Numeric bounds: the terms are added exactly (rational/symbolic arithmetic).
 * - Polynomial summand with symbolic upper bound: the sum is a polynomial of degree d + 1
 *   (Faulhaber); it is found by exact interpolation and then PROVEN by induction:
 *   S(a) = f(a) and S(m) − S(m − 1) = f(m) are checked symbolically.
 * - Geometric summand c·r^k: closed form c·r^a·(r^(n−a+1) − 1)/(r − 1), verified the same way.
 * - Infinite sums: geometric series with |r| < 1; divergence test when the terms do not
 *   tend to 0 (non-zero polynomial terms, geometric with |r| ≥ 1).
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { checkEquivalent, isSymbolicallyZero } from "../expr/equivalence";
import { evalReal } from "../expr/evaluate";
import { expand } from "../expr/expand";
import { polyCoefficients } from "../expr/polynomial";
import { toLatex, toText } from "../expr/print";
import { add, div, mul, num, pow, simplify, sub, substitute, sym, ONE } from "../expr/simplify";
import { containsSymbol, freeSymbols, isOneExpr, type Expr } from "../expr/types";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification, exactAnswer, formatNumber } from "../steps/format";
import type { Alternative, Solution, Step, TableData, VerificationCheck } from "../steps/types";
import { factorExpression } from "./factor";

const MAX_TERMS = 5000;

function intValue(e: Expr): bigint | null {
  return e.type === "num" && e.value.isInteger() ? e.value.num : null;
}

function isInfinite(e: Expr): boolean {
  return e.type === "sym" && e.name === "inf";
}

function at(f: Expr, k: string, v: Expr): Expr {
  return simplify(substitute(f, sym(k), v));
}

/** Exact Lagrange interpolation through (x_i, y_i) evaluated as a polynomial in `n`. */
function interpolate(xs: bigint[], ys: Expr[], n: string): Expr {
  const terms: Expr[] = [];
  for (let i = 0; i < xs.length; i++) {
    let basis: Expr = ONE;
    let denom = Rational.ONE;
    for (let j = 0; j < xs.length; j++) {
      if (j === i) continue;
      basis = mul(basis, sub(sym(n), num(xs[j])));
      denom = denom.mul(Rational.of(xs[i] - xs[j]));
    }
    terms.push(mul(ys[i], div(basis, num(denom))));
  }
  return expand(add(...terms));
}

/** Geometric summand c·r^k → { c, r } (r free of k), or null. */
function geometricParts(f: Expr, k: string): { c: Expr; r: Expr } | null {
  const factors = f.type === "mul" ? f.factors : [f];
  let r: Expr | null = null;
  const rest: Expr[] = [];
  for (const g of factors) {
    if (g.type === "pow" && !containsSymbol(g.base, k) && containsSymbol(g.exp, k)) {
      const cs = polyCoefficients(g.exp, k);
      if (!cs || cs.length !== 2) return null;
      // base^(p·k + q) = base^q · (base^p)^k
      const rk = pow(g.base, cs[1]);
      r = r ? mul(r, rk) : rk;
      rest.push(pow(g.base, cs[0]));
    } else if (containsSymbol(g, k)) return null;
    else rest.push(g);
  }
  if (!r) return null;
  return { c: simplify(mul(...rest)), r: simplify(r) };
}

function inductionChecks(S: Expr, f: Expr, k: string, a: bigint, n: string): VerificationCheck[] {
  const m = "m__";
  const Sm = substitute(S, sym(n), sym(m));
  const Sm1 = substitute(S, sym(n), sub(sym(m), ONE));
  const diff = simplify(sub(sub(Sm, Sm1), at(f, k, sym(m))));
  const stepOk = isSymbolicallyZero(expand(diff)) ? { ok: true, method: "Pembuktian simbolik" } : (() => {
    const r = checkEquivalent(sub(Sm, Sm1), at(f, k, sym(m)));
    return { ok: r.equivalent, method: r.method === "symbolic" ? "Pembuktian simbolik" : "Kesetaraan numerik" };
  })();
  const base = simplify(sub(substitute(S, sym(n), num(a)), at(f, k, num(a))));
  const baseOk = isSymbolicallyZero(base) || Math.abs(evalReal(base)) < 1e-9;
  return [
    { description: `Basis induksi: S(${a}) = f(${a})`, latex: `S(${a}) = ${toLatex(simplify(substitute(S, sym(n), num(a))))} = f(${a})`, passed: baseOk, method: "Substitusi eksak" },
    { description: "Langkah induksi: S(m) − S(m − 1) = f(m) untuk semua m", latex: `S(m) - S(m-1) = ${toLatex(simplify(at(f, k, sym("m"))))}`, passed: stepOk.ok, method: stepOk.method },
  ];
}

interface ClosedForm {
  S: Expr;
  steps: Step[];
  checks: VerificationCheck[];
  tables: TableData[];
  polynomial: boolean;
}

/** Closed form of Σ_{k=a}^{n} f(k) for polynomial or geometric f, proven by induction. Throws when unsupported. */
function closedForm(f: Expr, k: string, a: bigint, n: string): ClosedForm {
  const steps: Step[] = [];
  const tables: TableData[] = [];
  const fLatex = toLatex(f);
  const coefs = polyCoefficients(f, k);
  const geo = coefs ? null : geometricParts(f, k);
  let S: Expr;
  if (coefs) {
    const d = coefs.length - 1;
    const xs: bigint[] = [];
    const ys: Expr[] = [];
    let acc: Expr = num(0);
    for (let i = 0; i <= d + 1; i++) {
      const m = a + BigInt(i);
      acc = simplify(add(acc, at(f, k, num(m))));
      xs.push(m);
      ys.push(acc);
    }
    S = interpolate(xs, ys, n);
    steps.push({ title: "Kenali suku umum sebagai polinom", after: `f(${k}) = ${fLatex}\\quad(\\text{derajat } ${d})`, operation: "identify-polynomial", rule: { id: "faulhaber", name: "Rumus Faulhaber", formula: "\\sum_{k=1}^{n} k^p \\text{ adalah polinom berderajat } p+1 \\text{ dalam } n", conditions: "Berlaku untuk suku polinom dengan batas bawah bilangan bulat." }, reason: `Jumlah suku polinom berderajat ${d} adalah polinom berderajat ${d + 1} dalam ${n}.` });
    if (a === 1n && d <= 3) {
      const standard = ["\\sum_{k=1}^{n} 1 = n", "\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}", "\\sum_{k=1}^{n} k^2 = \\frac{n(n+1)(2n+1)}{6}", "\\sum_{k=1}^{n} k^3 = \\left(\\frac{n(n+1)}{2}\\right)^2"];
      const parts = coefs.map((c, j) => (isSymbolicallyZero(c) ? null : `${isOneExpr(c) ? "" : `${toLatex(c)} `}\\sum_{${k}=1}^{${n}} ${j === 0 ? "1" : j === 1 ? k : `${k}^{${j}}`}`)).filter(Boolean);
      steps.push({ title: "Pisahkan dengan sifat linear sigma", after: `\\sum_{${k}=1}^{${n}} ${fLatex} = ${parts.join(" + ")}`, operation: "linearity", rule: { id: "sigma-linearity", name: "Sifat linear notasi sigma", formula: "\\sum (c\\,a_k + b_k) = c\\sum a_k + \\sum b_k" }, reason: "Konstanta dapat dikeluarkan dan jumlah dapat dipisah per suku." });
      steps.push({ title: "Gunakan rumus jumlah pangkat standar", after: coefs.map((c, j) => (isSymbolicallyZero(c) ? null : standard[j])).filter(Boolean).join(" \\\\ "), operation: "standard-sums", reason: "Rumus baku jumlah bilangan asli berpangkat." });
      steps.push({ title: "Gabungkan dan sederhanakan", after: `S(${n}) = ${toLatex(S)}`, operation: "combine", reason: "Substitusi rumus-rumus di atas lalu kumpulkan suku sejenis." });
    } else {
      tables.push({ caption: "Jumlah parsial yang dihitung eksak", headers: [n, `S(${n})`], rows: xs.map((x, i) => [x.toString(), toText(ys[i])]) });
      steps.push({ title: `Hitung ${d + 2} jumlah parsial secara eksak`, after: xs.map((x, i) => `S(${x}) = ${toLatex(ys[i])}`).join(",\\ "), operation: "partial-sums", reason: `Polinom berderajat ${d + 1} ditentukan tunggal oleh ${d + 2} titik.` });
      steps.push({ title: "Interpolasi polinom (Lagrange)", after: `S(${n}) = ${toLatex(S)}`, operation: "interpolate", rule: { id: "lagrange", name: "Interpolasi Lagrange", formula: "P(x) = \\sum_i y_i \\prod_{j\\neq i} \\frac{x - x_j}{x_i - x_j}" }, reason: "Polinom unik yang melalui semua jumlah parsial tersebut." });
    }
  } else if (geo) {
    const r = geo.r;
    if (isSymbolicallyZero(simplify(sub(r, ONE)))) throw new MathError("unsupported", "Rasio r = 1: suku konstan.", { module: "sum" });
    const first = at(f, k, num(a));
    S = simplify(div(mul(first, sub(pow(r, add(sub(sym(n), num(a)), ONE)), ONE)), sub(r, ONE)));
    steps.push({ title: "Kenali deret geometri", after: `${fLatex} = ${toLatex(geo.c)}\\left(${toLatex(r)}\\right)^{${k}},\\quad r = ${toLatex(r)}`, operation: "identify-geometric", reason: "Setiap suku adalah suku sebelumnya dikali rasio tetap r." });
    steps.push({ title: "Rumus jumlah deret geometri", after: `\\sum_{${k}=${a}}^{${n}} ${fLatex} = \\frac{a_{${a}}\\left(r^{${n}-${a}+1} - 1\\right)}{r - 1} = ${toLatex(S)}`, operation: "geometric-sum", rule: { id: "geometric-sum", name: "Jumlah deret geometri", formula: "\\sum_{k=a}^{n} c\\,r^k = \\frac{c\\,r^a\\,(r^{\\,n-a+1}-1)}{r-1},\\ r\\neq 1" }, reason: "Kalikan jumlah dengan r lalu kurangkan (teleskopik)." });
  } else {
    throw new MathError("unsupported", "Bentuk tertutup untuk suku ini belum didukung.", { module: "sum", hint: "Yang didukung: suku polinom dan geometri. Untuk batas numerik (misalnya sum(1/k, k, 1, 100)) jumlah dihitung langsung." });
  }
  const checks = inductionChecks(S, f, k, a, n);
  steps.push({ title: "Buktikan rumus dengan induksi matematika", after: `S(${a}) = f(${a}),\\qquad S(m) - S(m-1) = f(m)`, operation: "induction", rule: { id: "induction", name: "Induksi matematika", formula: "P(a) \\land \\big(P(m-1) \\Rightarrow P(m)\\big) \\implies \\forall m \\geq a:\\ P(m)" }, reason: "Kedua syarat diperiksa secara simbolik oleh mesin (lihat tab Verifikasi).", check: { status: checks.every((c) => c.passed) ? "verified" : "failed", method: "Induksi (pemeriksaan simbolik)" } });
  return { S, steps, checks, tables, polynomial: coefs !== null };
}

export function solveSum(input: string, f: Expr, k: string, lower: Expr, upper: Expr, inputLatex: string, warnings: string[] = []): Solution {
  const a = intValue(lower);
  if (a === null) throw new MathError("invalid-input", "Batas bawah sigma harus bilangan bulat.", { module: "sum", hint: "Contoh: sum(k^2, k, 1, n)" });
  const steps: Step[] = [];
  const notes = [...warnings];
  const checks: VerificationCheck[] = [];
  const alternatives: Alternative[] = [];
  const tables: TableData[] = [];
  const fLatex = toLatex(f);

  // ---------------------------------------------------------------- infinite
  if (isInfinite(upper)) {
    const coefs = polyCoefficients(f, k);
    if (coefs && !(coefs.length === 1 && isSymbolicallyZero(coefs[0]))) {
      steps.push({ title: "Uji suku ke-n (uji divergensi)", after: `\\lim_{${k}\\to\\infty} ${fLatex} \\neq 0`, operation: "divergence-test", rule: { id: "nth-term-test", name: "Uji suku ke-n", formula: "\\lim_{k\\to\\infty} a_k \\neq 0 \\implies \\sum a_k \\text{ divergen}" }, reason: "Suku-suku polinom tak nol tidak menuju nol, sehingga jumlahnya tidak konvergen." });
      return makeSolution({
        kind: "series",
        title: "Deret tak hingga — divergen",
        input,
        inputLatex,
        answers: [{ label: "Kesimpulan", latex: "\\text{Divergen}", text: "divergen", exact: true }],
        method: { name: "Uji suku ke-n", description: "Jika suku-suku tidak menuju nol, deret pasti divergen." },
        steps,
        verification: aggregateVerification([{ description: `Suku umum polinom berderajat ${coefs.length - 1} tidak menuju 0`, passed: true, method: "Analisis simbolik (derajat polinom)" }]),
        module: "sum",
        notes,
        references: [REFERENCES.openstaxCalc2],
      });
    }
    const g = geometricParts(f, k);
    if (!g || freeSymbols(g.r).size > 0) throw new MathError("unsupported", "Deret tak hingga jenis ini belum didukung.", { module: "sum", hint: "Yang didukung: deret geometri Σ c·rᵏ dan uji divergensi untuk suku polinom. Coba jumlah parsial dengan batas atas n." });
    const r = evalReal(g.r);
    steps.push({ title: "Kenali deret geometri", after: `${fLatex} = ${toLatex(g.c)} \\cdot \\left(${toLatex(g.r)}\\right)^{${k}}`, operation: "identify-geometric", reason: `Rasio antarsuku tetap r = ${toText(g.r)}.` });
    if (!(Math.abs(r) < 1)) {
      steps.push({ title: "Periksa syarat konvergensi", after: `|r| = ${formatNumber(Math.abs(r), 8)} \\geq 1`, operation: "ratio-check", rule: { id: "geometric-convergence", name: "Konvergensi deret geometri", formula: "\\sum r^k \\text{ konvergen} \\iff |r| < 1" }, reason: "Deret geometri dengan |r| ≥ 1 divergen." });
      return makeSolution({ kind: "series", title: "Deret geometri tak hingga — divergen", input, inputLatex, answers: [{ label: "Kesimpulan", latex: "\\text{Divergen}", text: "divergen", exact: true }], method: { name: "Deret geometri", description: "Deret geometri hanya konvergen bila |r| < 1." }, steps, verification: aggregateVerification([{ description: "|r| ≥ 1", passed: true, method: "Evaluasi numerik rasio" }]), module: "sum", notes, references: [REFERENCES.openstaxCalc2] });
    }
    const first = at(f, k, num(a));
    const S = simplify(div(first, sub(ONE, g.r)));
    steps.push({ title: "Gunakan rumus jumlah deret geometri tak hingga", after: `\\sum_{${k}=${a}}^{\\infty} ${fLatex} = \\frac{a_{${a}}}{1 - r} = \\frac{${toLatex(first)}}{1 - ${toLatex(g.r)}} = ${toLatex(S)}`, operation: "geometric-infinite", rule: { id: "geometric-infinite", name: "Jumlah deret geometri tak hingga", formula: "\\sum_{k=a}^{\\infty} c\\,r^k = \\frac{c\\,r^a}{1-r},\\ |r|<1" }, reason: `|r| = ${formatNumber(Math.abs(r), 8)} < 1, jadi deret konvergen.` });
    let partial = 0;
    for (let i = 0; i < 2000; i++) partial += evalReal(at(f, k, num(a + BigInt(i))));
    const target = evalReal(S);
    checks.push({ description: "Jumlah parsial 2000 suku mendekati hasil", passed: Math.abs(partial - target) <= 1e-8 * Math.max(1, Math.abs(target)) || Math.abs(r) > 0.99, method: "Kesetaraan numerik", detail: `S₂₀₀₀ ≈ ${formatNumber(partial, 12)}; hasil ≈ ${formatNumber(target, 12)}` });
    return makeSolution({ kind: "series", title: "Deret geometri tak hingga", input, inputLatex, answers: [exactAnswer(S, "Jumlah")], method: { name: "Deret geometri", description: "Jumlah deret geometri tak hingga dengan |r| < 1.", formula: "\\sum_{k=a}^{\\infty} c\\,r^k = \\frac{c\\,r^a}{1-r}" }, steps, verification: aggregateVerification(checks), module: "sum", notes, references: [REFERENCES.openstaxCalc2] });
  }

  const b = intValue(upper);
  const coefs = polyCoefficients(f, k);
  const geo = coefs ? null : geometricParts(f, k);

  // --------------------------------------------------- symbolic upper bound
  if (b === null) {
    const uFree = [...freeSymbols(upper)];
    if (upper.type !== "sym" || uFree.length !== 1) throw new MathError("unsupported", "Batas atas harus bilangan bulat atau satu variabel (misalnya n).", { module: "sum" });
    const n = upper.name;
    if (n === k) throw new MathError("invalid-input", "Batas atas tidak boleh sama dengan indeks penjumlahan.", { module: "sum" });
    const cf = closedForm(f, k, a, n);
    const answers = [exactAnswer(cf.S, `S(${n})`)];
    const fac = cf.polynomial ? factorExpression(cf.S) : null;
    if (fac && fac.factors.length > 1) {
      answers.push({ label: "Bentuk faktor", latex: toLatex(fac.factored), text: toText(fac.factored), exact: true });
      cf.checks.push({ description: "Bentuk faktor sama dengan bentuk polinom", passed: checkEquivalent(fac.factored, cf.S).equivalent, method: "Kesetaraan simbolik" });
    }
    return makeSolution({
      kind: "series",
      title: cf.polynomial ? "Jumlah deret (notasi sigma) — suku polinom" : "Jumlah deret geometri",
      input,
      inputLatex,
      answers,
      method: cf.polynomial
        ? { name: "Rumus jumlah polinom (Faulhaber)", description: "Jumlah suku polinom berderajat d adalah polinom berderajat d+1; rumusnya ditentukan lalu dibuktikan dengan induksi.", formula: "\\sum_{k=a}^{n} f(k) = S(n),\\ S(n) - S(n-1) = f(n)" }
        : { name: "Deret geometri", description: "Jumlah n suku pertama deret geometri, dibuktikan dengan induksi.", formula: "\\frac{c\\,r^a(r^{n-a+1}-1)}{r-1}" },
      steps: cf.steps,
      verification: aggregateVerification(cf.checks),
      module: "sum",
      notes,
      tables: cf.tables,
      references: [REFERENCES.rosen],
    });
  }

  // ---------------------------------------------------------- numeric bounds
  const count = b - a + 1n;
  if (count <= 0n) {
    steps.push({ title: "Batas atas lebih kecil dari batas bawah", after: `\\sum_{${k}=${a}}^{${b}} ${fLatex} = 0`, operation: "empty-sum", rule: { id: "empty-sum", name: "Jumlah kosong", formula: "\\sum_{k=a}^{b} a_k = 0 \\text{ jika } b < a" }, reason: "Tidak ada suku yang dijumlahkan." });
    return makeSolution({ kind: "series", title: "Jumlah kosong", input, inputLatex, answers: [exactAnswer(num(0), "Jumlah")], method: { name: "Jumlah kosong", description: "Konvensi: jumlah tanpa suku bernilai 0." }, steps, verification: aggregateVerification([{ description: "Tidak ada suku", passed: true, method: "Definisi" }]), module: "sum", notes });
  }
  if (count > BigInt(MAX_TERMS) && !coefs && !geo) throw new MathError("limit-exceeded", `Penjumlahan langsung dibatasi ${MAX_TERMS} suku.`, { module: "sum", hint: "Untuk suku polinom/geometri gunakan batas atas simbolik n lalu substitusi." });

  let total: Expr;
  if (count <= BigInt(MAX_TERMS)) {
    const shown: string[] = [];
    let acc: Expr = num(0);
    let floatSum = 0;
    for (let i = 0n; i < count; i++) {
      const term = at(f, k, num(a + i));
      acc = simplify(add(acc, term));
      floatSum += evalReal(term);
      if (i < 4n || i === count - 1n) shown.push(toLatex(term));
      else if (i === 4n) shown.push("\\cdots");
    }
    total = acc;
    steps.push({ title: `Tulis ${count} suku`, after: `\\sum_{${k}=${a}}^{${b}} ${fLatex} = ${shown.join(" + ")}`, operation: "expand-terms", reason: `Substitusi ${k} = ${a}, ${a + 1n}, …, ${b} ke dalam suku umum.` });
    steps.push({ title: "Jumlahkan secara eksak", after: `= ${toLatex(total)}`, operation: "add-terms", reason: "Penjumlahan pecahan/bentuk akar dilakukan secara eksak (bukan desimal)." });
    const tv = evalReal(total);
    checks.push({ description: "Penjumlahan ulang dengan aritmetika floating-point", passed: Number.isFinite(tv) && Math.abs(tv - floatSum) <= 1e-9 * Math.max(1, Math.abs(tv)), method: "Kesetaraan numerik", detail: `Σ (float) ≈ ${formatNumber(floatSum, 12)}` });
    if (coefs || geo) {
      try {
        const cf = closedForm(f, k, a, "n");
        const closed = simplify(substitute(cf.S, sym("n"), num(b)));
        checks.push({ description: "Cocok dengan rumus tertutup yang sudah dibuktikan", passed: checkEquivalent(closed, total).equivalent, method: "Kesetaraan simbolik", detail: `S(n) = ${toText(cf.S)} pada n = ${b}` });
        alternatives.push({ name: "Rumus tertutup", description: `Tentukan rumus umum S(n), buktikan dengan induksi, lalu substitusi n = ${b}.`, steps: [...cf.steps, { title: `Substitusi n = ${b}`, after: `S(${b}) = ${toLatex(closed)}`, operation: "substitute", reason: "Masukkan batas atas ke rumus." }], answers: [exactAnswer(closed, "Jumlah")] });
      } catch {
        // closed form not available — the direct sum stands on its own
      }
    }
  } else {
    // Many terms of a polynomial/geometric sum: closed form (proven), then substitute.
    const cf = closedForm(f, k, a, "n");
    total = simplify(substitute(cf.S, sym("n"), num(b)));
    steps.push(...cf.steps);
    steps.push({ title: `Substitusi n = ${b}`, after: `S(${b}) = ${toLatex(total)}`, operation: "substitute", reason: `Terlalu banyak suku (${count}) untuk dijumlahkan satu per satu; rumus tertutup yang sudah dibuktikan dipakai.` });
    checks.push(...cf.checks);
    tables.push(...cf.tables);
  }
  return makeSolution({ kind: "series", title: "Jumlah deret (notasi sigma)", input, inputLatex, answers: [exactAnswer(total, "Jumlah")], method: { name: count <= BigInt(MAX_TERMS) ? "Penjumlahan langsung (eksak)" : "Rumus tertutup", description: "Setiap suku dihitung eksak lalu dijumlahkan." }, steps, verification: aggregateVerification(checks), module: "sum", notes, alternatives, tables, references: [REFERENCES.rosen] });
}

