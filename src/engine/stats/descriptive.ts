/**
 * Descriptive statistics and simple linear regression with exact rational arithmetic.
 *
 * Quartiles use the position rule L = p(n + 1) with linear interpolation (the rule commonly
 * taught in Indonesian secondary schools; equivalent to R type 6 / Minitab). Other software
 * may use different conventions (e.g. Excel QUARTILE.INC = R type 7); this is stated in the
 * output. Reference: OpenStax Introductory Statistics 2e, chapters 2 and 12.
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { toLatex } from "../expr/print";
import { mul, num, sqrt } from "../expr/simplify";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification, exactAnswer, formatNumber, rationalLatex } from "../steps/format";
import type { Answer, Solution, Step, TableData, VerificationCheck } from "../steps/types";

export const MAX_DATA = 10000;

function sum(xs: Rational[]): Rational {
  return xs.reduce((a, b) => a.add(b), Rational.ZERO);
}

export function quantile(sorted: Rational[], p: Rational): Rational {
  const n = sorted.length;
  const pos = p.mul(Rational.of(n + 1));
  if (pos.cmp(Rational.ONE) <= 0) return sorted[0];
  if (pos.cmp(Rational.of(n)) >= 0) return sorted[n - 1];
  const k = Number(pos.floor());
  const frac = pos.sub(Rational.of(k));
  return sorted[k - 1].add(frac.mul(sorted[k].sub(sorted[k - 1])));
}

export function median(sorted: Rational[]): Rational {
  const n = sorted.length;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : sorted[n / 2 - 1].add(sorted[n / 2]).div(Rational.TWO);
}

function rl(r: Rational): string {
  return rationalLatex(r);
}

function approx(r: Rational): string | undefined {
  return r.isInteger() || (r.hasTerminatingDecimal() && r.den < 10000n)
    ? undefined
    : formatNumber(r.toNumber());
}

function ans(label: string, r: Rational): Answer {
  const text =
    r.hasTerminatingDecimal() && !r.isInteger() && r.den < 10000n
      ? r.toFixedString(10)
      : r.toString();
  return {
    label,
    latex: r.hasTerminatingDecimal() && !r.isInteger() && r.den < 10000n ? text : rl(r),
    text,
    approx: approx(r),
    exact: true,
  };
}

export function solveDescriptive(
  input: string,
  data: Rational[],
  warnings: string[] = [],
): Solution {
  const n = data.length;
  if (n === 0) throw new MathError("invalid-input", "Data kosong.", { module: "statistics" });
  if (n > MAX_DATA)
    throw new MathError("limit-exceeded", `Jumlah data dibatasi ${MAX_DATA}.`, {
      module: "statistics",
    });
  const sorted = [...data].sort((a, b) => a.cmp(b));
  const N = Rational.of(n);
  const S = sum(data);
  const mean = S.div(N);
  const med = median(sorted);
  // mode
  const freq = new Map<string, { v: Rational; c: number }>();
  for (const x of data) {
    const k = x.toString();
    const f = freq.get(k);
    if (f) f.c++;
    else freq.set(k, { v: x, c: 1 });
  }
  const maxC = Math.max(...[...freq.values()].map((f) => f.c));
  const modes =
    maxC > 1
      ? [...freq.values()]
          .filter((f) => f.c === maxC)
          .map((f) => f.v)
          .sort((a, b) => a.cmp(b))
      : [];
  const min = sorted[0];
  const max = sorted[n - 1];
  const range = max.sub(min);
  const q1 = quantile(sorted, Rational.of(1, 4));
  const q3 = quantile(sorted, Rational.of(3, 4));
  const iqr = q3.sub(q1);
  const dev = data.map((x) => x.sub(mean));
  const ss = sum(dev.map((d) => d.mul(d)));
  const varPop = ss.div(N);
  const varSample = n > 1 ? ss.div(Rational.of(n - 1)) : null;
  const sdPop = sqrt(num(varPop));
  const sdSample = varSample ? sqrt(num(varSample)) : null;
  const lowFence = q1.sub(iqr.mul(Rational.of(3, 2)));
  const highFence = q3.add(iqr.mul(Rational.of(3, 2)));
  const outliers = sorted.filter((x) => x.lt(lowFence) || x.gt(highFence));

  const shown =
    n <= 40
      ? sorted.map(rl).join(",\\ ")
      : `${sorted.slice(0, 12).map(rl).join(",\\ ")},\\ \\ldots,\\ ${sorted.slice(-6).map(rl).join(",\\ ")}`;
  const steps: Step[] = [
    {
      title: "Urutkan data",
      after: shown,
      operation: "sort",
      reason: `n = ${n} data diurutkan dari terkecil ke terbesar.`,
    },
    {
      title: "Hitung jumlah dan rata-rata",
      after: `\\bar{x} = \\frac{\\sum x_i}{n} = \\frac{${rl(S)}}{${n}} = ${rl(mean)}`,
      operation: "mean",
      rule: {
        id: "mean",
        name: "Rata-rata (mean)",
        formula: "\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i",
      },
      reason: "Jumlah semua data dibagi banyak data.",
    },
    {
      title: "Median",
      after:
        n % 2 === 1
          ? `\\text{data ke-}${(n + 1) / 2} = ${rl(med)}`
          : `\\frac{x_{${n / 2}} + x_{${n / 2 + 1}}}{2} = \\frac{${rl(sorted[n / 2 - 1])} + ${rl(sorted[n / 2])}}{2} = ${rl(med)}`,
      operation: "median",
      rule: { id: "median", name: "Median", formula: "\\text{nilai tengah data terurut}" },
      reason:
        n % 2 === 1
          ? "n ganjil: median adalah data tengah."
          : "n genap: median adalah rata-rata dua data tengah.",
    },
    {
      title: "Modus",
      after: modes.length
        ? modes.map(rl).join(",\\ ") + `\\ (\\text{frekuensi } ${maxC})`
        : "\\text{tidak ada modus (semua nilai muncul sekali)}",
      operation: "mode",
      reason: "Nilai yang paling sering muncul.",
    },
    {
      title: "Kuartil (letak p(n + 1), interpolasi linear)",
      after: `Q_1 = ${rl(q1)},\\quad Q_2 = ${rl(med)},\\quad Q_3 = ${rl(q3)},\\quad \\text{IQR} = ${rl(iqr)}`,
      operation: "quartiles",
      rule: { id: "quartile", name: "Kuartil", formula: "\\text{letak } Q_i = \\frac{i(n+1)}{4}" },
      reason: "Posisi pecahan diinterpolasi linear antara dua data terdekat.",
    },
    {
      title: "Jumlah kuadrat simpangan",
      after: `\\sum (x_i - \\bar{x})^2 = ${rl(ss)}`,
      operation: "sum-squares",
      reason: "Setiap simpangan dari rata-rata dikuadratkan lalu dijumlahkan (lihat tabel).",
    },
    {
      title: "Variansi",
      after: `\\sigma^2 = \\frac{${rl(ss)}}{${n}} = ${rl(varPop)}${varSample ? `,\\quad s^2 = \\frac{${rl(ss)}}{${n - 1}} = ${rl(varSample)}` : ""}`,
      operation: "variance",
      rule: {
        id: "variance",
        name: "Variansi populasi dan sampel",
        formula:
          "\\sigma^2 = \\frac{\\sum(x_i - \\mu)^2}{n},\\quad s^2 = \\frac{\\sum(x_i - \\bar{x})^2}{n - 1}",
      },
      reason:
        "Variansi sampel dibagi n − 1 (koreksi Bessel) agar menjadi penduga tak bias bagi variansi populasi.",
    },
    {
      title: "Simpangan baku",
      after: `\\sigma = \\sqrt{${rl(varPop)}} = ${toLatex(sdPop)}${sdSample ? `,\\quad s = ${toLatex(sdSample)}` : ""}`,
      operation: "std",
      rule: { id: "std", name: "Simpangan baku", formula: "\\sigma = \\sqrt{\\sigma^2}" },
      reason: "Akar kuadrat variansi, dalam satuan yang sama dengan data.",
    },
  ];
  if (outliers.length)
    steps.push({
      title: "Deteksi pencilan (pagar Tukey)",
      after: `[${rl(lowFence)},\\ ${rl(highFence)}] \\Rightarrow \\text{pencilan: } ${outliers.map(rl).join(", ")}`,
      operation: "outliers",
      rule: {
        id: "tukey",
        name: "Pagar Tukey",
        formula: "[Q_1 - 1.5\\,\\text{IQR},\\ Q_3 + 1.5\\,\\text{IQR}]",
      },
      reason: "Data di luar pagar dianggap pencilan.",
    });
  const answers: Answer[] = [
    ans("n", N),
    ans("Jumlah", S),
    ans("Rata-rata", mean),
    ans("Median", med),
    {
      label: "Modus",
      latex: modes.length ? modes.map(rl).join(", ") : "\\text{tidak ada}",
      text: modes.length ? modes.map(String).join(", ") : "tidak ada",
      exact: true,
    },
    ans("Minimum", min),
    ans("Maksimum", max),
    ans("Jangkauan", range),
    ans("Q1", q1),
    ans("Q3", q3),
    ans("IQR", iqr),
    ans("Variansi populasi σ²", varPop),
    ...(varSample ? [ans("Variansi sampel s²", varSample)] : []),
    { ...exactAnswer(sdPop), label: "Simpangan baku populasi σ" },
    ...(sdSample ? [{ ...exactAnswer(sdSample), label: "Simpangan baku sampel s" }] : []),
  ];
  // verification
  const sumSq = sum(data.map((x) => x.mul(x)));
  const varComp = sumSq.sub(N.mul(mean).mul(mean)).div(N);
  const checks: VerificationCheck[] = [
    {
      description: "Jumlah simpangan dari rata-rata sama dengan nol",
      latex: `\\sum (x_i - \\bar{x}) = ${rl(sum(dev))}`,
      passed: sum(dev).isZero(),
      method: "Invarian eksak",
    },
    {
      description: "Variansi dengan rumus komputasi (Σx² − n·x̄²)/n sama dengan definisi",
      latex: `\\frac{${rl(sumSq)} - ${n}\\cdot(${rl(mean)})^2}{${n}} = ${rl(varComp)}`,
      passed: varComp.equals(varPop),
      method: "Rumus independen (eksak)",
    },
    {
      description: "min ≤ Q1 ≤ median ≤ Q3 ≤ maks",
      passed: min.cmp(q1) <= 0 && q1.cmp(med) <= 0 && med.cmp(q3) <= 0 && q3.cmp(max) <= 0,
      method: "Invarian urutan",
    },
  ];
  const tables: TableData[] = [];
  if (n <= 60) {
    tables.push({
      caption: "Tabel simpangan",
      headers: ["i", "xᵢ", "xᵢ − x̄", "(xᵢ − x̄)²"],
      rows: data.map((x, i) => [
        String(i + 1),
        x.toString(),
        dev[i].toString(),
        dev[i].mul(dev[i]).toString(),
      ]),
    });
  }
  if (freq.size <= 30) {
    tables.push({
      caption: "Distribusi frekuensi",
      headers: ["Nilai", "Frekuensi", "Frekuensi relatif"],
      rows: [...freq.values()]
        .sort((a, b) => a.v.cmp(b.v))
        .map((f) => [f.v.toString(), String(f.c), formatNumber(f.c / n, 6)]),
    });
  }
  return makeSolution({
    kind: "statistics",
    title: "Statistika deskriptif",
    input,
    inputLatex: `\\{${shown}\\}`,
    answers,
    method: {
      name: "Statistika deskriptif (eksak)",
      description:
        "Ukuran pemusatan (mean, median, modus), letak (kuartil) dan penyebaran (jangkauan, IQR, variansi, simpangan baku) dihitung dengan aritmetika rasional eksak.",
    },
    steps,
    verification: aggregateVerification(checks),
    module: "statistics",
    assumptions: [
      "Kuartil memakai aturan letak p(n+1) dengan interpolasi linear; perangkat lunak lain dapat memakai konvensi berbeda sehingga hasil kuartil bisa sedikit berbeda.",
    ],
    notes: warnings,
    tables,
    plot: { kind: "histogram", variable: "x", functions: [], data: data.map((x) => x.toNumber()) },
    references: [REFERENCES.openstaxStats],
  });
}

export function solveRegression(
  input: string,
  xs: Rational[],
  ys: Rational[],
  warnings: string[] = [],
): Solution {
  const n = xs.length;
  if (n < 2 || ys.length !== n)
    throw new MathError("invalid-input", "Regresi membutuhkan minimal 2 pasangan data (x, y).", {
      module: "statistics",
    });
  const N = Rational.of(n);
  const Sx = sum(xs);
  const Sy = sum(ys);
  const Sxy = sum(xs.map((x, i) => x.mul(ys[i])));
  const Sxx = sum(xs.map((x) => x.mul(x)));
  const Syy = sum(ys.map((y) => y.mul(y)));
  const den = N.mul(Sxx).sub(Sx.mul(Sx));
  if (den.isZero())
    throw new MathError(
      "no-solution",
      "Semua nilai x sama sehingga garis regresi tidak dapat ditentukan (kemiringan tak hingga).",
      { module: "statistics" },
    );
  const b = N.mul(Sxy).sub(Sx.mul(Sy)).div(den);
  const a = Sy.div(N).sub(b.mul(Sx.div(N)));
  const denY = N.mul(Syy).sub(Sy.mul(Sy));
  const rNum = N.mul(Sxy).sub(Sx.mul(Sy));
  const r2 = denY.isZero() ? null : rNum.mul(rNum).div(den.mul(denY));
  const rExact = r2 ? mul(num(rNum.isNegative() ? -1 : 1), sqrt(num(r2))) : null;
  const rVal = r2 ? (rNum.isNegative() ? -1 : 1) * Math.sqrt(r2.toNumber()) : NaN;
  const steps: Step[] = [
    {
      title: "Hitung jumlah-jumlah yang diperlukan",
      after: `n = ${n},\\ \\sum x = ${rl(Sx)},\\ \\sum y = ${rl(Sy)},\\ \\sum xy = ${rl(Sxy)},\\ \\sum x^2 = ${rl(Sxx)}`,
      operation: "sums",
      reason: "Lihat tabel perhitungan.",
    },
    {
      title: "Kemiringan (slope) b",
      after: `b = \\frac{n\\sum xy - \\sum x \\sum y}{n \\sum x^2 - (\\sum x)^2} = \\frac{${n}\\cdot${rl(Sxy)} - ${rl(Sx)}\\cdot${rl(Sy)}}{${n}\\cdot${rl(Sxx)} - (${rl(Sx)})^2} = ${rl(b)}`,
      operation: "slope",
      rule: {
        id: "least-squares",
        name: "Metode kuadrat terkecil",
        formula: "b = \\frac{n\\sum xy - \\sum x\\sum y}{n\\sum x^2 - (\\sum x)^2}",
      },
      reason: "Meminimalkan jumlah kuadrat residu.",
    },
    {
      title: "Intersep a",
      after: `a = \\bar{y} - b\\bar{x} = ${rl(Sy.div(N))} - ${rl(b)}\\cdot${rl(Sx.div(N))} = ${rl(a)}`,
      operation: "intercept",
      rule: { id: "intercept", name: "Intersep", formula: "a = \\bar{y} - b\\bar{x}" },
      reason: "Garis regresi selalu melalui titik (x̄, ȳ).",
    },
  ];
  if (r2)
    steps.push({
      title: "Koefisien korelasi dan determinasi",
      after: `r = ${formatNumber(rVal, 10)},\\quad R^2 = ${rl(r2)} \\approx ${formatNumber(r2.toNumber(), 8)}`,
      operation: "correlation",
      rule: {
        id: "pearson",
        name: "Korelasi Pearson",
        formula:
          "r = \\frac{n\\sum xy - \\sum x\\sum y}{\\sqrt{[n\\sum x^2 - (\\sum x)^2][n\\sum y^2 - (\\sum y)^2]}}",
      },
      reason: `|r| mendekati 1 berarti hubungan linear kuat; R² = ${formatNumber(r2.toNumber() * 100, 4)}% variasi y dijelaskan oleh x.`,
    });
  const residuals = xs.map((x, i) => ys[i].sub(a.add(b.mul(x))));
  const checks: VerificationCheck[] = [
    {
      description: "Persamaan normal 1: Σ residu = 0",
      latex: `\\sum e_i = ${rl(sum(residuals))}`,
      passed: sum(residuals).isZero(),
      method: "Invarian eksak kuadrat terkecil",
    },
    {
      description: "Persamaan normal 2: Σ xᵢ·residuᵢ = 0",
      latex: `\\sum x_i e_i = ${rl(sum(residuals.map((e, i) => e.mul(xs[i]))))}`,
      passed: sum(residuals.map((e, i) => e.mul(xs[i]))).isZero(),
      method: "Invarian eksak kuadrat terkecil",
    },
  ];
  const lineText = `${a.toString()} + ${b.toString()}*x`;
  const xsN = xs.map((x) => x.toNumber());
  const minX = Math.min(...xsN);
  const maxX = Math.max(...xsN);
  return makeSolution({
    kind: "statistics",
    title: "Regresi linear sederhana",
    input,
    inputLatex: `\\{${xs
      .map((x, i) => `(${rl(x)}, ${rl(ys[i])})`)
      .slice(0, 20)
      .join(",\\ ")}${n > 20 ? ",\\ \\ldots" : ""}\\}`,
    answers: [
      {
        label: "Persamaan regresi",
        latex: `\\hat{y} = ${rl(a)} ${b.isNegative() ? "-" : "+"} ${rl(b.abs())}x`,
        text: `ŷ = ${a.toString()} ${b.isNegative() ? "-" : "+"} ${b.abs().toString()}x`,
        approx: `ŷ ≈ ${formatNumber(a.toNumber(), 8)} ${b.isNegative() ? "-" : "+"} ${formatNumber(Math.abs(b.toNumber()), 8)}x`,
        exact: true,
      },
      ans("Kemiringan b", b),
      ans("Intersep a", a),
      ...(r2 && rExact ? [{ ...exactAnswer(rExact), label: "Korelasi r" }, ans("R²", r2)] : []),
    ],
    method: {
      name: "Metode kuadrat terkecil",
      description: "Garis ŷ = a + bx yang meminimalkan Σ(yᵢ − ŷᵢ)².",
    },
    steps,
    verification: aggregateVerification(checks),
    module: "statistics",
    notes: warnings,
    tables: [
      {
        caption: "Tabel perhitungan",
        headers: ["x", "y", "xy", "x²", "ŷ", "residu"],
        rows: xs.map((x, i) => [
          x.toString(),
          ys[i].toString(),
          x.mul(ys[i]).toString(),
          x.mul(x).toString(),
          formatNumber(a.add(b.mul(x)).toNumber(), 8),
          formatNumber(residuals[i].toNumber(), 8),
        ]),
      },
    ],
    plot: {
      kind: "scatter",
      variable: "x",
      functions: [{ expr: lineText, label: "garis regresi" }],
      points: xs.map((x, i) => ({ x: x.toNumber(), y: ys[i].toNumber() })),
      xRange: [minX - (maxX - minX) * 0.15 - 0.5, maxX + (maxX - minX) * 0.15 + 0.5],
    },
    references: [REFERENCES.openstaxStats],
  });
}
