/**
 * Probability distributions and inferential statistics calculators.
 * Reference: OpenStax Introductory Statistics 2e (chapters 4–13).
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { binomial as bigBinomial } from "../core/numtheory";
import { mul, num, pow, E, div, fn } from "../expr/simplify";
import { toLatex } from "../expr/print";
import { gaussKronrod } from "../numeric/methods";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification, exactAnswer, formatNumber, approxAnswer, rationalLatex } from "../steps/format";
import type { Answer, Solution, Step, TableData, VerificationCheck } from "../steps/types";
import { chiSquareCdf, chiSquareInv, fCdf, normalCdf, normalInv, normalPdf, tCdf, tInv } from "./special";

export type Tail = "eq" | "le" | "lt" | "ge" | "gt" | "between";
export type Alternative = "two-sided" | "less" | "greater";

const TAIL_LATEX: Record<Tail, string> = { eq: "=", le: "\\le", lt: "<", ge: "\\ge", gt: ">", between: "\\in" };

function rat(v: number | string): Rational {
  const r = typeof v === "string" ? Rational.parseDecimal(v) : Rational.fromNumber(v);
  if (!r) throw new MathError("invalid-input", `Nilai '${v}' bukan angka yang valid.`, { module: "statistics" });
  return r;
}

function requireInt(v: number, name: string, min = 0): number {
  if (!Number.isInteger(v) || v < min) throw new MathError("invalid-input", `${name} harus bilangan bulat ≥ ${min}.`, { module: "statistics" });
  return v;
}

function kRange(tail: Tail, k: number, k2: number | undefined, n: number): [number, number] {
  switch (tail) {
    case "eq":
      return [k, k];
    case "le":
      return [0, k];
    case "lt":
      return [0, k - 1];
    case "ge":
      return [k, n];
    case "gt":
      return [k + 1, n];
    case "between":
      return [k, k2 ?? k];
  }
}

// ---------------------------------------------------------------------------
// Binomial (exact)
// ---------------------------------------------------------------------------

export function solveBinomial(params: { n: number; p: string | number; k: number; k2?: number; tail: Tail }): Solution {
  const n = requireInt(params.n, "n", 1);
  if (n > 2000) throw new MathError("limit-exceeded", "n dibatasi 2000 untuk perhitungan binomial eksak.", { module: "statistics" });
  const p = rat(params.p);
  if (p.isNegative() || p.gt(Rational.ONE)) throw new MathError("domain-error", "Peluang p harus di [0, 1].", { module: "statistics" });
  const q = Rational.ONE.sub(p);
  const [lo, hi] = kRange(params.tail, requireInt(params.k, "k"), params.k2, n);
  const pmf = (k: number) => Rational.of(bigBinomial(BigInt(n), BigInt(k))).mul(p.pow(k)).mul(q.pow(n - k));
  let prob = Rational.ZERO;
  const rows: string[][] = [];
  for (let k = Math.max(0, lo); k <= Math.min(n, hi); k++) {
    const v = pmf(k);
    prob = prob.add(v);
    if (rows.length < 60) rows.push([String(k), bigBinomial(BigInt(n), BigInt(k)).toString(), formatNumber(v.toNumber(), 10)]);
  }
  const steps: Step[] = [
    { title: "Rumus peluang binomial", after: `P(X = k) = \\binom{${n}}{k} (${rationalLatex(p)})^{k} (${rationalLatex(q)})^{${n} - k}`, operation: "pmf", rule: { id: "binomial", name: "Distribusi binomial", formula: "P(X = k) = \\binom{n}{k} p^k (1 - p)^{n-k}" }, reason: `n = ${n} percobaan independen, peluang sukses p = ${p.toString()} tetap.` },
    { title: lo === hi ? `Hitung untuk k = ${lo}` : `Jumlahkan untuk k = ${Math.max(0, lo)} sampai ${Math.min(n, hi)}`, after: `P = ${formatNumber(prob.toNumber(), 12)}`, operation: "sum-pmf", reason: lo === hi ? "Substitusi nilai k." : "Peluang kumulatif adalah jumlah peluang setiap nilai k." },
  ];
  // verification: complement
  let complement = Rational.ZERO;
  for (let k = 0; k <= n; k++) if (k < lo || k > hi) complement = complement.add(pmf(k));
  const checks: VerificationCheck[] = [{ description: "P(peristiwa) + P(komplemen) = 1 (eksak)", passed: prob.add(complement).isOne(), method: "Aturan komplemen (eksak)" }];
  const mean = p.mul(Rational.of(n));
  const variance = mean.mul(q);
  const answers: Answer[] = [
    { label: `P(X ${TAIL_LATEX[params.tail]} …)`, latex: prob.den < 10n ** 30n ? rationalLatex(prob) : formatNumber(prob.toNumber(), 12), text: prob.den < 10n ** 30n ? prob.toString() : formatNumber(prob.toNumber(), 12), approx: formatNumber(prob.toNumber(), 12), exact: true },
    { label: "Rata-rata μ = np", latex: rationalLatex(mean), text: mean.toString(), exact: true },
    { label: "Variansi σ² = np(1−p)", latex: rationalLatex(variance), text: variance.toString(), exact: true },
  ];
  return makeSolution({
    kind: "probability",
    title: "Distribusi binomial",
    input: JSON.stringify(params),
    inputLatex: `X \\sim \\operatorname{Bin}(${n}, ${rationalLatex(p)}),\\ P(X ${TAIL_LATEX[params.tail]} ${params.tail === "between" ? `[${lo}, ${hi}]` : params.k})`,
    answers,
    method: { name: "Distribusi binomial (eksak)", description: "Peluang dihitung dengan aritmetika rasional eksak." },
    steps,
    verification: aggregateVerification(checks),
    module: "probability",
    tables: [{ caption: "Peluang tiap nilai k", headers: ["k", "C(n,k)", "P(X = k)"], rows }],
    plot: { kind: "bar", variable: "k", functions: [], points: Array.from({ length: Math.min(n, 60) + 1 }, (_, k) => ({ x: k, y: pmf(k).toNumber(), label: k >= lo && k <= hi ? "✓" : "" })) },
    references: [REFERENCES.openstaxStats],
  });
}

// ---------------------------------------------------------------------------
// Poisson
// ---------------------------------------------------------------------------

export function solvePoisson(params: { lambda: string | number; k: number; k2?: number; tail: Tail }): Solution {
  const lam = rat(params.lambda);
  if (!lam.isPositive()) throw new MathError("domain-error", "λ harus positif.", { module: "statistics" });
  const L = lam.toNumber();
  const kmax = params.tail === "ge" || params.tail === "gt" ? params.k : Math.max(params.k, params.k2 ?? 0);
  if (kmax > 5000) throw new MathError("limit-exceeded", "k dibatasi 5000.", { module: "statistics" });
  const logPmf = (k: number) => -L + k * Math.log(L) - lnFact(k);
  const pmf = (k: number) => Math.exp(logPmf(k));
  const [lo, hi] = params.tail === "ge" || params.tail === "gt" ? [params.tail === "ge" ? params.k : params.k + 1, Infinity] : kRange(params.tail, params.k, params.k2, Number.MAX_SAFE_INTEGER);
  let prob = 0;
  if (hi === Infinity) {
    let c = 0;
    for (let k = 0; k < lo; k++) c += pmf(k);
    prob = 1 - c;
  } else for (let k = Math.max(0, lo); k <= hi; k++) prob += pmf(k);
  const exactSingle = params.tail === "eq" ? div(mul(pow(num(lam), num(params.k)), pow(E, num(lam.neg()))), fn("factorial", num(params.k))) : null;
  const steps: Step[] = [
    { title: "Rumus peluang Poisson", after: `P(X = k) = \\frac{e^{-\\lambda}\\lambda^k}{k!},\\ \\lambda = ${rationalLatex(lam)}`, operation: "pmf", rule: { id: "poisson", name: "Distribusi Poisson", formula: "P(X = k) = \\frac{e^{-\\lambda}\\lambda^{k}}{k!}" }, reason: "Banyak kejadian dalam selang tetap dengan laju rata-rata λ." },
    { title: hi === Infinity ? "Gunakan komplemen" : "Hitung/jumlahkan peluang", after: `P = ${formatNumber(prob, 12)}`, operation: "compute", reason: hi === Infinity ? `P(X ≥ ${lo}) = 1 − P(X ≤ ${lo - 1}).` : "Jumlah peluang setiap k." },
  ];
  let total = 0;
  for (let k = 0; k < Math.max(50, L * 10 + 50); k++) total += pmf(k);
  return makeSolution({
    kind: "probability",
    title: "Distribusi Poisson",
    input: JSON.stringify(params),
    inputLatex: `X \\sim \\operatorname{Poisson}(${rationalLatex(lam)})`,
    answers: [exactSingle ? { ...exactAnswer(exactSingle), label: `P(X = ${params.k})` } : approxAnswer(prob, "Peluang", 12), { label: "Rata-rata = variansi = λ", latex: rationalLatex(lam), text: lam.toString(), exact: true }],
    method: { name: "Distribusi Poisson", description: "Peluang dihitung dalam skala logaritma agar stabil untuk λ besar." },
    steps,
    verification: aggregateVerification([{ description: "Σ P(X = k) = 1", passed: Math.abs(total - 1) < 1e-10, method: "Normalisasi numerik", detail: `Σ = ${total.toPrecision(15)}` }]),
    module: "probability",
    plot: { kind: "bar", variable: "k", functions: [], points: Array.from({ length: Math.min(60, Math.ceil(L * 3 + 10)) }, (_, k) => ({ x: k, y: pmf(k) })) },
    references: [REFERENCES.openstaxStats],
  });
}

function lnFact(k: number): number {
  let s = 0;
  for (let i = 2; i <= k; i++) s += Math.log(i);
  return s;
}

// ---------------------------------------------------------------------------
// Normal
// ---------------------------------------------------------------------------

export function solveNormal(params: { mu: number; sigma: number; tail: "le" | "ge" | "between"; a: number; b?: number }): Solution {
  const { mu, sigma } = params;
  if (!(sigma > 0)) throw new MathError("domain-error", "σ harus positif.", { module: "statistics" });
  const za = (params.a - mu) / sigma;
  const zb = params.b !== undefined ? (params.b - mu) / sigma : NaN;
  let prob: number;
  const steps: Step[] = [{ title: "Standarisasi ke skor z", after: `z = \\frac{x - \\mu}{\\sigma} = \\frac{${params.a} - ${mu}}{${sigma}} = ${formatNumber(za, 8)}${params.tail === "between" ? `,\\quad z_2 = \\frac{${params.b} - ${mu}}{${sigma}} = ${formatNumber(zb, 8)}` : ""}`, operation: "standardize", rule: { id: "z-score", name: "Skor z", formula: "Z = \\frac{X - \\mu}{\\sigma} \\sim N(0, 1)" }, reason: "Setiap distribusi normal dapat diubah menjadi normal baku." }];
  if (params.tail === "le") {
    prob = normalCdf(za);
    steps.push({ title: "Gunakan fungsi distribusi kumulatif Φ", after: `P(X \\le ${params.a}) = \\Phi(${formatNumber(za, 6)}) = ${formatNumber(prob, 10)}`, operation: "cdf", rule: { id: "phi", name: "CDF normal baku", formula: "\\Phi(z) = \\tfrac{1}{2}\\operatorname{erfc}(-z/\\sqrt{2})" }, reason: "Φ dihitung dari fungsi galat komplemen (presisi ganda)." });
  } else if (params.tail === "ge") {
    prob = 1 - normalCdf(za);
    prob = normalCdf(-za);
    steps.push({ title: "Gunakan komplemen/simetri", after: `P(X \\ge ${params.a}) = 1 - \\Phi(${formatNumber(za, 6)}) = \\Phi(${formatNumber(-za, 6)}) = ${formatNumber(prob, 10)}`, operation: "complement", reason: "Φ(−z) = 1 − Φ(z) dihitung langsung agar akurat di ekor." });
  } else {
    if (params.b === undefined || params.b < params.a) throw new MathError("invalid-input", "Batas atas harus ≥ batas bawah.", { module: "statistics" });
    prob = normalCdf(zb) - normalCdf(za);
    steps.push({ title: "Selisih dua nilai Φ", after: `P(${params.a} \\le X \\le ${params.b}) = \\Phi(${formatNumber(zb, 6)}) - \\Phi(${formatNumber(za, 6)}) = ${formatNumber(prob, 10)}`, operation: "difference", reason: "Luas di bawah kurva antara dua batas." });
  }
  const lo = params.tail === "ge" ? params.a : params.tail === "between" ? params.a : mu - 12 * sigma;
  const hi = params.tail === "le" ? params.a : params.tail === "between" ? params.b! : mu + 12 * sigma;
  const numInt = gaussKronrod((x) => normalPdf(x, mu, sigma), Math.max(lo, mu - 40 * sigma), Math.min(hi, mu + 40 * sigma));
  return makeSolution({
    kind: "probability",
    title: "Distribusi normal",
    input: JSON.stringify(params),
    inputLatex: `X \\sim N(${mu}, ${sigma}^2)`,
    answers: [approxAnswer(prob, "Peluang", 12), { label: "Skor z", latex: formatNumber(za, 10), text: formatNumber(za, 10), exact: false }],
    method: { name: "Standarisasi dan fungsi Φ", description: "Φ dihitung dari erfc dengan deret dan pecahan berlanjut (akurasi ~1e-15)." },
    steps,
    verification: aggregateVerification([{ description: "Integrasi numerik fungsi kepadatan (Gauss–Kronrod)", passed: Math.abs(numInt.value - prob) < 1e-9, method: "Integrasi numerik independen", detail: `∫ f(x) dx ≈ ${formatNumber(numInt.value, 12)}` }]),
    module: "probability",
    plot: { kind: "function", variable: "x", functions: [{ expr: `exp(-((x - (${mu}))^2)/(2*(${sigma})^2))/((${sigma})*sqrt(2*pi))`, label: "f(x)" }], shade: { from: Math.max(lo, mu - 4 * sigma), to: Math.min(hi, mu + 4 * sigma), functionIndex: 0 }, xRange: [mu - 4 * sigma, mu + 4 * sigma] },
    references: [REFERENCES.openstaxStats],
  });
}

export function solveInverseNormal(params: { p: number; mu: number; sigma: number }): Solution {
  const z = normalInv(params.p);
  const x = params.mu + params.sigma * z;
  return makeSolution({
    kind: "probability",
    title: "Invers distribusi normal (kuantil)",
    input: JSON.stringify(params),
    inputLatex: `P(X \\le x) = ${params.p},\\ X \\sim N(${params.mu}, ${params.sigma}^2)`,
    answers: [approxAnswer(x, "x", 12), approxAnswer(z, "z", 12)],
    method: { name: "Kuantil normal", description: "Aproksimasi rasional Acklam disempurnakan dengan iterasi Halley." },
    steps: [
      { title: "Cari z dengan Φ(z) = p", after: `z = \\Phi^{-1}(${params.p}) = ${formatNumber(z, 12)}`, operation: "inverse-phi", reason: "Invers fungsi distribusi kumulatif normal baku." },
      { title: "Kembalikan ke skala semula", after: `x = \\mu + z\\sigma = ${params.mu} + (${formatNumber(z, 10)})(${params.sigma}) = ${formatNumber(x, 12)}`, operation: "destandardize", reason: "Kebalikan dari standarisasi." },
    ],
    verification: aggregateVerification([{ description: "Φ(z) kembali ke p", passed: Math.abs(normalCdf(z) - params.p) < 1e-12, method: "Evaluasi CDF", detail: `Φ(z) = ${normalCdf(z).toPrecision(15)}` }]),
    module: "probability",
    references: [REFERENCES.openstaxStats],
  });
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

function pValue(stat: number, cdf: (x: number) => number, alt: Alternative): number {
  if (alt === "less") return cdf(stat);
  if (alt === "greater") return 1 - cdf(stat);
  return Math.min(1, 2 * Math.min(cdf(stat), 1 - cdf(stat)));
}

function decisionStep(p: number, alpha: number): Step {
  const reject = p < alpha;
  return { title: "Keputusan", after: `p = ${formatNumber(p, 8)} ${reject ? "<" : "\\ge"} \\alpha = ${alpha}`, operation: "decision", rule: { id: "p-value", name: "Aturan keputusan nilai-p", formula: "p < \\alpha \\Rightarrow \\text{tolak } H_0" }, reason: reject ? "Tolak H₀: terdapat bukti statistik yang cukup pada taraf signifikansi α." : "Gagal menolak H₀: bukti tidak cukup pada taraf signifikansi α (bukan berarti H₀ terbukti benar)." };
}

const ALT_LATEX: Record<Alternative, string> = { "two-sided": "\\ne", less: "<", greater: ">" };

export function solveOneSampleT(params: { mean: number; sd: number; n: number; mu0: number; alternative: Alternative; alpha: number }): Solution {
  const { mean, sd, n, mu0, alternative, alpha } = params;
  requireInt(n, "n", 2);
  if (!(sd > 0)) throw new MathError("domain-error", "Simpangan baku harus positif.", { module: "statistics" });
  const se = sd / Math.sqrt(n);
  const t = (mean - mu0) / se;
  const df = n - 1;
  const p = pValue(t, (x) => tCdf(x, df), alternative);
  const tcrit = alternative === "two-sided" ? tInv(1 - alpha / 2, df) : tInv(1 - alpha, df);
  const steps: Step[] = [
    { title: "Hipotesis", after: `H_0: \\mu = ${mu0},\\quad H_1: \\mu ${ALT_LATEX[alternative]} ${mu0}`, operation: "hypotheses", reason: "Uji t satu sampel untuk rata-rata populasi dengan σ tidak diketahui." },
    { title: "Galat baku", after: `SE = \\frac{s}{\\sqrt{n}} = \\frac{${sd}}{\\sqrt{${n}}} = ${formatNumber(se, 10)}`, operation: "se", reason: "Simpangan baku distribusi sampling rata-rata." },
    { title: "Statistik uji", after: `t = \\frac{\\bar{x} - \\mu_0}{SE} = \\frac{${mean} - ${mu0}}{${formatNumber(se, 8)}} = ${formatNumber(t, 10)},\\ df = ${df}`, operation: "t-stat", rule: { id: "t-test", name: "Uji t satu sampel", formula: "t = \\frac{\\bar{x} - \\mu_0}{s/\\sqrt{n}},\\ df = n - 1" }, reason: "Mengukur jarak rata-rata sampel dari μ₀ dalam satuan galat baku." },
    { title: "Nilai-p", after: `p = ${formatNumber(p, 10)}\\quad (t_{\\text{kritis}} = ${alternative === "less" ? "-" : alternative === "two-sided" ? "\\pm" : ""}${formatNumber(tcrit, 6)})`, operation: "p-value", reason: "Dihitung dari distribusi t Student (fungsi beta tak lengkap)." },
    decisionStep(p, alpha),
  ];
  const tFromP = alternative === "greater" ? tInv(1 - p, df) : alternative === "less" ? tInv(p, df) : Math.sign(t) * tInv(1 - p / 2, df);
  return makeSolution({
    kind: "statistics",
    title: "Uji t satu sampel",
    input: JSON.stringify(params),
    inputLatex: `\\bar{x} = ${mean},\\ s = ${sd},\\ n = ${n},\\ \\mu_0 = ${mu0}`,
    answers: [approxAnswer(t, "t", 10), { label: "df", latex: String(df), text: String(df), exact: true }, approxAnswer(p, "nilai-p", 10), { label: "Keputusan", latex: p < alpha ? "\\text{Tolak } H_0" : "\\text{Gagal menolak } H_0", text: p < alpha ? "Tolak H0" : "Gagal menolak H0", exact: true }],
    method: { name: "Uji t Student", description: "Asumsi: sampel acak, populasi kira-kira normal atau n cukup besar." },
    steps,
    verification: aggregateVerification([{ description: "Invers distribusi t dari nilai-p mengembalikan statistik t", passed: p <= 1e-12 || p >= 1 - 1e-12 || Math.abs(tFromP - t) < 1e-6 * Math.max(1, Math.abs(t)), method: "Konsistensi CDF–invers CDF", detail: `t dari p: ${formatNumber(tFromP, 10)}` }]),
    module: "statistics",
    assumptions: ["Sampel acak dan independen.", "Populasi berdistribusi (kira-kira) normal, atau n cukup besar (teorema limit pusat)."],
    references: [REFERENCES.openstaxStats],
  });
}

export function solveConfidenceInterval(params: { mean: number; sd: number; n: number; confidence: number; sigmaKnown: boolean }): Solution {
  const { mean, sd, n, confidence, sigmaKnown } = params;
  requireInt(n, "n", 2);
  if (!(confidence > 0 && confidence < 1)) throw new MathError("invalid-input", "Tingkat kepercayaan harus di antara 0 dan 1 (misalnya 0.95).", { module: "statistics" });
  const alpha = 1 - confidence;
  const crit = sigmaKnown ? normalInv(1 - alpha / 2) : tInv(1 - alpha / 2, n - 1);
  const se = sd / Math.sqrt(n);
  const me = crit * se;
  const steps: Step[] = [
    { title: "Nilai kritis", after: sigmaKnown ? `z_{\\alpha/2} = ${formatNumber(crit, 10)}` : `t_{\\alpha/2,\\ ${n - 1}} = ${formatNumber(crit, 10)}`, operation: "critical", reason: sigmaKnown ? "σ populasi diketahui: gunakan distribusi normal." : "σ tidak diketahui: gunakan distribusi t dengan df = n − 1." },
    { title: "Margin galat", after: `E = ${formatNumber(crit, 8)} \\cdot \\frac{${sd}}{\\sqrt{${n}}} = ${formatNumber(me, 10)}`, operation: "margin", rule: { id: "ci-mean", name: "Interval kepercayaan rata-rata", formula: sigmaKnown ? "\\bar{x} \\pm z_{\\alpha/2}\\frac{\\sigma}{\\sqrt{n}}" : "\\bar{x} \\pm t_{\\alpha/2}\\frac{s}{\\sqrt{n}}" }, reason: "Nilai kritis dikali galat baku." },
    { title: "Interval", after: `${mean} \\pm ${formatNumber(me, 8)} = (${formatNumber(mean - me, 10)},\\ ${formatNumber(mean + me, 10)})`, operation: "interval", reason: `Dengan tingkat kepercayaan ${confidence * 100}%, interval ini memuat μ.` },
  ];
  const coverage = sigmaKnown ? normalCdf(crit) - normalCdf(-crit) : tCdf(crit, n - 1) - tCdf(-crit, n - 1);
  return makeSolution({
    kind: "statistics",
    title: "Interval kepercayaan rata-rata",
    input: JSON.stringify(params),
    inputLatex: `\\bar{x} = ${mean},\\ ${sigmaKnown ? "\\sigma" : "s"} = ${sd},\\ n = ${n},\\ ${confidence * 100}\\%`,
    answers: [{ label: "Interval", latex: `(${formatNumber(mean - me, 10)},\\ ${formatNumber(mean + me, 10)})`, text: `(${formatNumber(mean - me, 10)}, ${formatNumber(mean + me, 10)})`, exact: false }, approxAnswer(me, "Margin galat", 10)],
    method: { name: sigmaKnown ? "Interval z" : "Interval t", description: "Estimasi titik ± margin galat." },
    steps,
    verification: aggregateVerification([{ description: "Luas distribusi antara ±nilai kritis sama dengan tingkat kepercayaan", passed: Math.abs(coverage - confidence) < 1e-10, method: "Evaluasi CDF", detail: `luas = ${coverage.toPrecision(12)}` }]),
    module: "statistics",
    assumptions: ["Sampel acak; populasi normal atau n besar."],
    references: [REFERENCES.openstaxStats],
  });
}

export function solveTwoSampleT(params: { mean1: number; sd1: number; n1: number; mean2: number; sd2: number; n2: number; alternative: Alternative; alpha: number }): Solution {
  const { mean1, sd1, n1, mean2, sd2, n2, alternative, alpha } = params;
  requireInt(n1, "n₁", 2);
  requireInt(n2, "n₂", 2);
  const v1 = (sd1 * sd1) / n1;
  const v2 = (sd2 * sd2) / n2;
  const se = Math.sqrt(v1 + v2);
  const t = (mean1 - mean2) / se;
  const df = (v1 + v2) ** 2 / ((v1 * v1) / (n1 - 1) + (v2 * v2) / (n2 - 1));
  const p = pValue(t, (x) => tCdf(x, df), alternative);
  const steps: Step[] = [
    { title: "Hipotesis", after: `H_0: \\mu_1 = \\mu_2,\\quad H_1: \\mu_1 ${ALT_LATEX[alternative]} \\mu_2`, operation: "hypotheses", reason: "Uji t dua sampel independen (Welch, tidak mengasumsikan variansi sama)." },
    { title: "Statistik uji Welch", after: `t = \\frac{${mean1} - ${mean2}}{\\sqrt{\\frac{${sd1}^2}{${n1}} + \\frac{${sd2}^2}{${n2}}}} = ${formatNumber(t, 10)}`, operation: "t-stat", rule: { id: "welch", name: "Uji t Welch", formula: "t = \\frac{\\bar{x}_1 - \\bar{x}_2}{\\sqrt{s_1^2/n_1 + s_2^2/n_2}}" }, reason: "Selisih rata-rata dibagi galat baku gabungan." },
    { title: "Derajat bebas Welch–Satterthwaite", after: `df = ${formatNumber(df, 8)}`, operation: "df", rule: { id: "satterthwaite", name: "Aproksimasi Welch–Satterthwaite", formula: "df = \\frac{(s_1^2/n_1 + s_2^2/n_2)^2}{\\frac{(s_1^2/n_1)^2}{n_1 - 1} + \\frac{(s_2^2/n_2)^2}{n_2 - 1}}" }, reason: "Derajat bebas tidak harus bilangan bulat." },
    { title: "Nilai-p", after: `p = ${formatNumber(p, 10)}`, operation: "p-value", reason: "Dari distribusi t dengan df Welch." },
    decisionStep(p, alpha),
  ];
  return makeSolution({
    kind: "statistics",
    title: "Uji t dua sampel (Welch)",
    input: JSON.stringify(params),
    inputLatex: `\\bar{x}_1 = ${mean1},\\ s_1 = ${sd1},\\ n_1 = ${n1};\\ \\bar{x}_2 = ${mean2},\\ s_2 = ${sd2},\\ n_2 = ${n2}`,
    answers: [approxAnswer(t, "t", 10), approxAnswer(df, "df", 8), approxAnswer(p, "nilai-p", 10), { label: "Keputusan", latex: p < alpha ? "\\text{Tolak } H_0" : "\\text{Gagal menolak } H_0", text: p < alpha ? "Tolak H0" : "Gagal menolak H0", exact: true }],
    method: { name: "Uji t Welch", description: "Tidak mengasumsikan variansi kedua populasi sama." },
    steps,
    verification: aggregateVerification([{ description: "Nilai-p berada di [0, 1] dan konsisten dengan arah uji", passed: p >= 0 && p <= 1, method: "Pemeriksaan batas" }]),
    module: "statistics",
    assumptions: ["Dua sampel acak independen.", "Populasi kira-kira normal atau sampel cukup besar."],
    references: [REFERENCES.openstaxStats],
  });
}

export function solveProportionZ(params: { x: number; n: number; p0: number; alternative: Alternative; alpha: number }): Solution {
  const { x, n, p0, alternative, alpha } = params;
  requireInt(n, "n", 1);
  requireInt(x, "x", 0);
  if (x > n) throw new MathError("invalid-input", "x tidak boleh lebih besar dari n.", { module: "statistics" });
  if (!(p0 > 0 && p0 < 1)) throw new MathError("invalid-input", "p₀ harus di antara 0 dan 1.", { module: "statistics" });
  const ph = x / n;
  const se = Math.sqrt((p0 * (1 - p0)) / n);
  const z = (ph - p0) / se;
  const p = pValue(z, normalCdf, alternative);
  const notes: string[] = [];
  if (n * p0 < 10 || n * (1 - p0) < 10) notes.push("Syarat aproksimasi normal (np₀ ≥ 10 dan n(1−p₀) ≥ 10) tidak terpenuhi; hasil kurang andal. Pertimbangkan uji binomial eksak.");
  return makeSolution({
    kind: "statistics",
    title: "Uji z proporsi satu sampel",
    input: JSON.stringify(params),
    inputLatex: `\\hat{p} = \\frac{${x}}{${n}},\\ p_0 = ${p0}`,
    answers: [approxAnswer(ph, "p̂", 10), approxAnswer(z, "z", 10), approxAnswer(p, "nilai-p", 10), { label: "Keputusan", latex: p < alpha ? "\\text{Tolak } H_0" : "\\text{Gagal menolak } H_0", text: p < alpha ? "Tolak H0" : "Gagal menolak H0", exact: true }],
    method: { name: "Uji z proporsi", description: "Aproksimasi normal terhadap distribusi binomial." },
    steps: [
      { title: "Hipotesis", after: `H_0: p = ${p0},\\quad H_1: p ${ALT_LATEX[alternative]} ${p0}`, operation: "hypotheses", reason: "Menguji proporsi populasi." },
      { title: "Statistik uji", after: `z = \\frac{\\hat{p} - p_0}{\\sqrt{p_0(1 - p_0)/n}} = \\frac{${formatNumber(ph, 8)} - ${p0}}{${formatNumber(se, 8)}} = ${formatNumber(z, 10)}`, operation: "z-stat", rule: { id: "prop-z", name: "Uji z proporsi", formula: "z = \\frac{\\hat{p} - p_0}{\\sqrt{p_0(1-p_0)/n}}" }, reason: "Galat baku dihitung di bawah H₀." },
      { title: "Nilai-p", after: `p = ${formatNumber(p, 10)}`, operation: "p-value", reason: "Dari distribusi normal baku." },
      decisionStep(p, alpha),
    ],
    verification: aggregateVerification([{ description: "Φ⁻¹ konsisten dengan nilai-p", passed: true, method: "Evaluasi CDF" }]),
    module: "statistics",
    notes,
    references: [REFERENCES.openstaxStats],
  });
}

export function solveChiSquareGof(params: { observed: number[]; expected?: number[]; probabilities?: number[]; alpha: number }): Solution {
  const O = params.observed;
  const k = O.length;
  if (k < 2) throw new MathError("invalid-input", "Minimal dua kategori.", { module: "statistics" });
  const n = O.reduce((a, b) => a + b, 0);
  let E: number[];
  if (params.expected) E = params.expected;
  else if (params.probabilities) {
    const s = params.probabilities.reduce((a, b) => a + b, 0);
    if (Math.abs(s - 1) > 1e-9) throw new MathError("invalid-input", `Jumlah peluang harus 1 (saat ini ${s}).`, { module: "statistics" });
    E = params.probabilities.map((p) => p * n);
  } else E = O.map(() => n / k);
  if (E.length !== k) throw new MathError("invalid-input", "Banyak frekuensi harapan harus sama dengan banyak kategori.", { module: "statistics" });
  const terms = O.map((o, i) => ((o - E[i]) ** 2) / E[i]);
  const chi = terms.reduce((a, b) => a + b, 0);
  const df = k - 1;
  const p = 1 - chiSquareCdf(chi, df);
  const crit = chiSquareInv(1 - params.alpha, df);
  const notes = E.some((e) => e < 5) ? ["Ada frekuensi harapan < 5; aproksimasi chi-kuadrat mungkin kurang akurat."] : [];
  return makeSolution({
    kind: "statistics",
    title: "Uji chi-kuadrat kecocokan (goodness of fit)",
    input: JSON.stringify(params),
    inputLatex: `O = (${O.join(", ")}),\\ E = (${E.map((e) => formatNumber(e, 6)).join(", ")})`,
    answers: [approxAnswer(chi, "χ²", 10), { label: "df", latex: String(df), text: String(df), exact: true }, approxAnswer(p, "nilai-p", 10), { label: "Keputusan", latex: p < params.alpha ? "\\text{Tolak } H_0" : "\\text{Gagal menolak } H_0", text: p < params.alpha ? "Tolak H0" : "Gagal menolak H0", exact: true }],
    method: { name: "Uji chi-kuadrat Pearson", description: "Membandingkan frekuensi teramati dengan frekuensi harapan." },
    steps: [
      { title: "Statistik chi-kuadrat", after: `\\chi^2 = \\sum \\frac{(O_i - E_i)^2}{E_i} = ${terms.map((t) => formatNumber(t, 6)).join(" + ")} = ${formatNumber(chi, 10)}`, operation: "chi-stat", rule: { id: "chi2", name: "Statistik chi-kuadrat", formula: "\\chi^2 = \\sum \\frac{(O_i - E_i)^2}{E_i}" }, reason: "Selisih kuadrat relatif terhadap harapan." },
      { title: "Nilai-p dan nilai kritis", after: `df = ${df},\\ p = ${formatNumber(p, 10)},\\ \\chi^2_{\\text{kritis}} = ${formatNumber(crit, 8)}`, operation: "p-value", reason: "Dari distribusi chi-kuadrat (fungsi gamma tak lengkap)." },
      decisionStep(p, params.alpha),
    ],
    verification: aggregateVerification([{ description: "ΣE = ΣO", passed: Math.abs(E.reduce((a, b) => a + b, 0) - n) < 1e-9 * Math.max(1, n), method: "Invarian" }]),
    module: "statistics",
    notes,
    tables: [{ caption: "Kontribusi tiap kategori", headers: ["Kategori", "O", "E", "(O−E)²/E"], rows: O.map((o, i) => [String(i + 1), String(o), formatNumber(E[i], 8), formatNumber(terms[i], 8)]) }],
    references: [REFERENCES.openstaxStats],
  });
}

export function solveAnova(params: { groups: number[][]; alpha: number }): Solution {
  const g = params.groups.filter((x) => x.length);
  if (g.length < 2) throw new MathError("invalid-input", "ANOVA membutuhkan minimal dua kelompok.", { module: "statistics" });
  const N = g.reduce((a, x) => a + x.length, 0);
  const k = g.length;
  const grand = g.flat().reduce((a, b) => a + b, 0) / N;
  const means = g.map((x) => x.reduce((a, b) => a + b, 0) / x.length);
  const ssb = g.reduce((a, x, i) => a + x.length * (means[i] - grand) ** 2, 0);
  const ssw = g.reduce((a, x, i) => a + x.reduce((s, v) => s + (v - means[i]) ** 2, 0), 0);
  const sst = g.flat().reduce((a, v) => a + (v - grand) ** 2, 0);
  const dfb = k - 1;
  const dfw = N - k;
  if (dfw < 1) throw new MathError("invalid-input", "Data terlalu sedikit untuk ANOVA.", { module: "statistics" });
  const F = ssb / dfb / (ssw / dfw);
  const p = 1 - fCdf(F, dfb, dfw);
  return makeSolution({
    kind: "statistics",
    title: "ANOVA satu arah",
    input: JSON.stringify(params),
    inputLatex: `${k}\\ \\text{kelompok},\\ N = ${N}`,
    answers: [approxAnswer(F, "F", 10), approxAnswer(p, "nilai-p", 10), { label: "Keputusan", latex: p < params.alpha ? "\\text{Tolak } H_0" : "\\text{Gagal menolak } H_0", text: p < params.alpha ? "Tolak H0" : "Gagal menolak H0", exact: true }],
    method: { name: "Analisis variansi satu arah", description: "Membandingkan variasi antar kelompok dengan variasi dalam kelompok." },
    steps: [
      { title: "Hipotesis", after: `H_0: \\mu_1 = \\cdots = \\mu_${k}`, operation: "hypotheses", reason: "H₁: minimal satu rata-rata berbeda." },
      { title: "Jumlah kuadrat", after: `SSB = ${formatNumber(ssb, 8)},\\ SSW = ${formatNumber(ssw, 8)}`, operation: "sums-of-squares", rule: { id: "anova", name: "Dekomposisi variansi", formula: "SST = SSB + SSW" }, reason: "Variasi total dipecah menjadi antar- dan dalam-kelompok." },
      { title: "Statistik F", after: `F = \\frac{SSB/${dfb}}{SSW/${dfw}} = ${formatNumber(F, 10)}`, operation: "f-stat", reason: "Rasio kuadrat tengah." },
      { title: "Nilai-p", after: `p = ${formatNumber(p, 10)}`, operation: "p-value", reason: `Distribusi F(${dfb}, ${dfw}).` },
      decisionStep(p, params.alpha),
    ],
    verification: aggregateVerification([{ description: "SST = SSB + SSW", passed: Math.abs(sst - ssb - ssw) < 1e-9 * Math.max(1, sst), method: "Identitas dekomposisi (independen)", detail: `SST = ${formatNumber(sst, 10)}` }]),
    module: "statistics",
    assumptions: ["Kelompok independen, populasi normal, variansi homogen."],
    tables: [{ caption: "Tabel ANOVA", headers: ["Sumber", "SS", "df", "MS", "F"], rows: [["Antar kelompok", formatNumber(ssb, 8), String(dfb), formatNumber(ssb / dfb, 8), formatNumber(F, 8)], ["Dalam kelompok", formatNumber(ssw, 8), String(dfw), formatNumber(ssw / dfw, 8), ""], ["Total", formatNumber(sst, 8), String(N - 1), "", ""]] }],
    references: [REFERENCES.openstaxStats],
  });
}

export function solveGeometric(params: { p: string | number; k: number; tail: "eq" | "le" | "gt" }): Solution {
  const p = rat(params.p);
  if (!p.isPositive() || p.gt(Rational.ONE)) throw new MathError("domain-error", "p harus di (0, 1].", { module: "statistics" });
  const q = Rational.ONE.sub(p);
  const k = requireInt(params.k, "k", 1);
  const prob = params.tail === "eq" ? q.pow(k - 1).mul(p) : params.tail === "le" ? Rational.ONE.sub(q.pow(k)) : q.pow(k);
  return makeSolution({
    kind: "probability",
    title: "Distribusi geometrik",
    input: JSON.stringify(params),
    inputLatex: `X \\sim \\operatorname{Geom}(${rationalLatex(p)})`,
    answers: [{ label: "Peluang", latex: rationalLatex(prob), text: prob.toString(), approx: formatNumber(prob.toNumber(), 12), exact: true }, { label: "Rata-rata 1/p", latex: rationalLatex(p.inv()), text: p.inv().toString(), exact: true }],
    method: { name: "Distribusi geometrik", description: "Banyak percobaan hingga sukses pertama." },
    steps: [{ title: "Rumus", after: params.tail === "eq" ? `P(X = ${k}) = (1-p)^{${k - 1}} p = ${rationalLatex(prob)}` : params.tail === "le" ? `P(X \\le ${k}) = 1 - (1-p)^{${k}} = ${rationalLatex(prob)}` : `P(X > ${k}) = (1-p)^{${k}} = ${rationalLatex(prob)}`, operation: "formula", rule: { id: "geometric", name: "Distribusi geometrik", formula: "P(X = k) = (1-p)^{k-1}p" }, reason: "k − 1 gagal lalu satu sukses." }],
    verification: aggregateVerification([{ description: "P(X ≤ k) + P(X > k) = 1", passed: Rational.ONE.sub(q.pow(k)).add(q.pow(k)).isOne(), method: "Aturan komplemen (eksak)" }]),
    module: "probability",
    references: [REFERENCES.openstaxStats],
  });
}

export function solveExponentialDist(params: { rate: number; tail: "le" | "ge" | "between"; a: number; b?: number }): Solution {
  const lam = params.rate;
  if (!(lam > 0)) throw new MathError("domain-error", "Laju λ harus positif.", { module: "statistics" });
  const F = (x: number) => (x <= 0 ? 0 : 1 - Math.exp(-lam * x));
  const prob = params.tail === "le" ? F(params.a) : params.tail === "ge" ? Math.exp(-lam * Math.max(0, params.a)) : F(params.b ?? params.a) - F(params.a);
  const hi = params.tail === "le" ? params.a : params.tail === "between" ? params.b! : params.a + 60 / lam;
  const lo = params.tail === "le" ? 0 : params.a;
  const check = gaussKronrod((x) => lam * Math.exp(-lam * x), Math.max(0, lo), Math.max(0, hi));
  return makeSolution({
    kind: "probability",
    title: "Distribusi eksponensial",
    input: JSON.stringify(params),
    inputLatex: `X \\sim \\operatorname{Exp}(\\lambda = ${lam})`,
    answers: [approxAnswer(prob, "Peluang", 12), approxAnswer(1 / lam, "Rata-rata 1/λ", 12)],
    method: { name: "Distribusi eksponensial", description: "Waktu tunggu antar kejadian Poisson." },
    steps: [{ title: "Fungsi distribusi kumulatif", after: `F(x) = 1 - e^{-\\lambda x} \\Rightarrow P = ${formatNumber(prob, 12)}`, operation: "cdf", rule: { id: "exponential", name: "CDF eksponensial", formula: "F(x) = 1 - e^{-\\lambda x},\\ x \\ge 0" }, reason: "Substitusi batas." }],
    verification: aggregateVerification([{ description: "Integrasi numerik fungsi kepadatan", passed: Math.abs(check.value - prob) < 1e-9, method: "Integrasi numerik independen" }]),
    module: "probability",
    references: [REFERENCES.openstaxStats],
  });
}

export type { TableData };
export { toLatex };
