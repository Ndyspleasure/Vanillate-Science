/**
 * Form-level API for the structured calculators (chemistry, statistics, finance, computer
 * science). Each tool declares its input fields (labels in Indonesian), default values that
 * double as the worked example, and a `run` function that validates the raw text inputs and
 * calls the domain solver.
 *
 * The same definitions are used by the UI (to render forms), by the Web Worker (to run a
 * tool from raw field values) and by server components (to pre-render worked examples).
 */
import { MathError } from "./core/errors";
import { Rational } from "./core/rational";
import type { Solution } from "./steps/types";
import {
  solveAcidPH,
  solveBalance,
  solveEmpiricalFormula,
  solveMolarMass,
  solveStoichiometry,
  parseReaction,
} from "./chemistry/solvers";
import {
  solveAnova,
  solveBinomial,
  solveChiSquareGof,
  solveConfidenceInterval,
  solveExponentialDist,
  solveGeometric,
  solveInverseNormal,
  solveNormal,
  solveOneSampleT,
  solvePoisson,
  solveProportionZ,
  solveTwoSampleT,
  type Alternative,
  type Tail,
} from "./stats/distributions";
import { solveDescriptive, solveRegression } from "./stats/descriptive";
import {
  solveAnnuityValue,
  solveBreakEven,
  solveCompoundInterest,
  solveDepreciation,
  solveIRR,
  solveLoan,
  solveNPV,
  solveRealRate,
  solveROI,
  solveSimpleInterest,
  type LoanMethod,
} from "./finance/solvers";
import {
  solveBase64,
  solveBaseConversion,
  solveBitwise,
  solveBoolean,
  solveSubnet,
  solveTwosComplement,
} from "./cs/solvers";

export type FieldType = "number" | "text" | "select" | "textarea" | "checkbox";

export interface FieldOption {
  value: string;
  label: string;
}

export interface ToolField {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  help?: string;
  /** Unit shown after the input. */
  suffix?: string;
  options?: FieldOption[];
  optional?: boolean;
  /** Only shown (and validated) when another field has one of these values. */
  showIf?: { field: string; values: string[] };
  mono?: boolean;
}

export type Values = Record<string, string>;

export interface ToolDef {
  id: string;
  fields: ToolField[];
  defaults: Values;
  run: (values: Values) => Solution;
}

// ---------------------------------------------------------------------------
// Input normalisation and validation
// ---------------------------------------------------------------------------

/**
 * Normalise a number typed by an Indonesian or English user:
 * "1.250.000,50" → "1250000.50", "3,5" → "3.5", "1_000" → "1000", "0.975" → "0.975".
 */
export function normalizeNumber(text: string): string {
  let t = text.trim().replace(/[\s_]/g, "").replace(/−/g, "-");
  // Thousands separators are only recognised when unambiguous: two or more groups
  // ("1.250.000") or a group followed by a decimal part in the other style ("1.250,5").
  // A single "1.250" stays 1.25 and a single "3,5" is a decimal comma.
  if (
    /^[-+]?[1-9]\d{0,2}(\.\d{3}){2,}(,\d+)?$/.test(t) ||
    /^[-+]?[1-9]\d{0,2}(\.\d{3})+,\d+$/.test(t)
  )
    t = t.replace(/\./g, "").replace(",", ".");
  else if (
    /^[-+]?[1-9]\d{0,2}(,\d{3}){2,}(\.\d+)?$/.test(t) ||
    /^[-+]?[1-9]\d{0,2}(,\d{3})+\.\d+$/.test(t)
  )
    t = t.replace(/,/g, "");
  else if (!t.includes(".") && (t.match(/,/g) ?? []).length === 1) t = t.replace(",", ".");
  return t;
}

function required(values: Values, name: string, label: string): string {
  const raw = (values[name] ?? "").trim();
  if (!raw)
    throw new MathError("invalid-input", `${label} belum diisi.`, {
      module: "form",
      hint: `Isi kolom “${label}”.`,
    });
  return raw;
}

/** Decimal string (validated), for solvers that parse exact rationals themselves. */
function dec(values: Values, name: string, label: string): string {
  const t = normalizeNumber(required(values, name, label));
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) && !/^[-+]?\d+\/\d+$/.test(t)) {
    throw new MathError("invalid-input", `${label} harus berupa angka (contoh: 12,5 atau 3/4).`, {
      module: "form",
      cause: `Nilai yang dimasukkan: “${values[name]}”.`,
    });
  }
  return t;
}

function optDec(values: Values, name: string, label: string): string | undefined {
  return (values[name] ?? "").trim() ? dec(values, name, label) : undefined;
}

function num(
  values: Values,
  name: string,
  label: string,
  opts: { min?: number; max?: number; positive?: boolean; integer?: boolean } = {},
): number {
  const t = dec(values, name, label);
  const v = t.includes("/") ? Number(t.split("/")[0]) / Number(t.split("/")[1]) : Number(t);
  if (!Number.isFinite(v))
    throw new MathError("invalid-input", `${label} tidak valid.`, { module: "form" });
  if (opts.integer && !Number.isInteger(v))
    throw new MathError("invalid-input", `${label} harus bilangan bulat.`, { module: "form" });
  if (opts.positive && !(v > 0))
    throw new MathError("domain-error", `${label} harus lebih dari 0.`, { module: "form" });
  if (opts.min !== undefined && v < opts.min)
    throw new MathError("domain-error", `${label} minimal ${opts.min}.`, { module: "form" });
  if (opts.max !== undefined && v > opts.max)
    throw new MathError("domain-error", `${label} maksimal ${opts.max}.`, { module: "form" });
  return v;
}

function optNum(
  values: Values,
  name: string,
  label: string,
  opts: Parameters<typeof num>[3] = {},
): number | undefined {
  return (values[name] ?? "").trim() ? num(values, name, label, opts) : undefined;
}

/** Parse a list of numbers separated by commas, semicolons, spaces or new lines (decimal point: "."). */
export function numberList(text: string, label: string): string[] {
  const parts = text
    .split(/[\s;,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0)
    throw new MathError("invalid-input", `${label} kosong.`, { module: "form" });
  for (const p of parts) {
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(p)) {
      throw new MathError("invalid-input", `“${p}” pada ${label} bukan angka.`, {
        module: "form",
        hint: "Pisahkan angka dengan koma, spasi, atau baris baru; gunakan titik sebagai pemisah desimal (misalnya 2.5).",
      });
    }
  }
  return parts;
}

function rationalList(text: string, label: string): Rational[] {
  return numberList(text, label).map((s) => Rational.parseDecimal(s)!);
}

function choice<T extends string>(
  values: Values,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = values[name];
  return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
}

function integerText(values: Values, name: string, label: string): string {
  const t = required(values, name, label).replace(/[\s_]/g, "");
  if (!/^[-+]?\d+$/.test(t))
    throw new MathError("invalid-input", `${label} harus bilangan bulat desimal.`, {
      module: "form",
    });
  return t;
}

const TAILS: FieldOption[] = [
  { value: "eq", label: "P(X = k)" },
  { value: "le", label: "P(X ≤ k)" },
  { value: "lt", label: "P(X < k)" },
  { value: "ge", label: "P(X ≥ k)" },
  { value: "gt", label: "P(X > k)" },
  { value: "between", label: "P(k ≤ X ≤ k₂)" },
];

const ALTERNATIVES: FieldOption[] = [
  { value: "two-sided", label: "Dua sisi (≠)" },
  { value: "less", label: "Sisi kiri (<)" },
  { value: "greater", label: "Sisi kanan (>)" },
];

const ALPHA: ToolField = {
  name: "alpha",
  label: "Taraf signifikansi α",
  type: "number",
  placeholder: "0.05",
};

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const TOOLS: Record<string, ToolDef> = {
  // ------------------------------- chemistry -------------------------------
  "molar-mass": {
    id: "molar-mass",
    fields: [
      {
        name: "formula",
        label: "Rumus kimia",
        type: "text",
        placeholder: "Ca(OH)2, CuSO4·5H2O",
        mono: true,
        help: "Mendukung tanda kurung, hidrat (· atau *), dan muatan ion (SO4^2-).",
      },
    ],
    defaults: { formula: "CuSO4*5H2O" },
    run: (v) => solveMolarMass(required(v, "formula", "Rumus kimia")),
  },
  balance: {
    id: "balance",
    fields: [
      {
        name: "reaction",
        label: "Persamaan reaksi",
        type: "text",
        placeholder: "Fe + O2 -> Fe2O3",
        mono: true,
        help: "Gunakan -> atau = sebagai panah. Ion ditulis dengan muatan, misalnya MnO4^- atau Fe^3+.",
      },
    ],
    defaults: { reaction: "C3H8 + O2 -> CO2 + H2O" },
    run: (v) => solveBalance(required(v, "reaction", "Persamaan reaksi")),
  },
  empirical: {
    id: "empirical",
    fields: [
      {
        name: "composition",
        label: "Komposisi (% massa)",
        type: "textarea",
        placeholder: "C: 40\nH: 6.71\nO: 53.29",
        mono: true,
        help: "Satu unsur per baris: simbol, titik dua, persen massa.",
      },
      {
        name: "molarMass",
        label: "Massa molar senyawa (opsional)",
        type: "number",
        optional: true,
        suffix: "g/mol",
        help: "Isi untuk menentukan rumus molekul.",
      },
    ],
    defaults: { composition: "C: 40.00\nH: 6.71\nO: 53.29", molarMass: "180.16" },
    run: (v) => {
      const pct: Record<string, string> = {};
      for (const line of required(v, "composition", "Komposisi").split(/[\n;]+/)) {
        const t = line.trim();
        if (!t) continue;
        const m = /^([A-Z][a-z]?)\s*[:=]?\s*([\d.,]+)\s*%?$/.exec(t);
        if (!m)
          throw new MathError("invalid-input", `Baris “${t}” tidak dikenali.`, {
            module: "form",
            hint: "Format: C: 40",
          });
        pct[m[1]] = normalizeNumber(m[2]);
      }
      return solveEmpiricalFormula(pct, optDec(v, "molarMass", "Massa molar"));
    },
  },
  stoichiometry: {
    id: "stoichiometry",
    fields: [
      {
        name: "reaction",
        label: "Persamaan reaksi",
        type: "text",
        placeholder: "N2 + H2 -> NH3",
        mono: true,
        help: "Reaksi akan disetarakan otomatis.",
      },
      {
        name: "given",
        label: "Massa zat yang diketahui",
        type: "textarea",
        placeholder: "N2: 28\nH2: 10",
        mono: true,
        help: "Satu zat per baris: rumus, titik dua, massa dalam gram. Dua reaktan atau lebih → pereaksi pembatas ditentukan.",
      },
    ],
    defaults: { reaction: "N2 + H2 -> NH3", given: "N2: 28\nH2: 10" },
    run: (v) => {
      const reaction = required(v, "reaction", "Persamaan reaksi");
      const species = parseReaction(reaction);
      const masses: Record<number, string> = {};
      for (const line of required(v, "given", "Massa zat").split(/\n+/)) {
        const t = line.trim();
        if (!t) continue;
        const m = /^(.+?)\s*[:=]\s*([\d.,]+)\s*(g)?$/.exec(t);
        if (!m)
          throw new MathError("invalid-input", `Baris “${t}” tidak dikenali.`, {
            module: "form",
            hint: "Format: N2: 28",
          });
        const idx = species.findIndex(
          (s) => s.raw.replace(/\s+/g, "") === m[1].replace(/\s+/g, ""),
        );
        if (idx < 0)
          throw new MathError("invalid-input", `Zat “${m[1]}” tidak ada dalam reaksi.`, {
            module: "form",
            hint: `Zat dalam reaksi: ${species.map((s) => s.raw).join(", ")}.`,
          });
        masses[idx] = normalizeNumber(m[2]);
      }
      return solveStoichiometry(reaction, masses);
    },
  },
  "acid-ph": {
    id: "acid-ph",
    fields: [
      {
        name: "kind",
        label: "Jenis larutan",
        type: "select",
        options: [
          { value: "strong-acid", label: "Asam kuat" },
          { value: "strong-base", label: "Basa kuat" },
          { value: "weak-acid", label: "Asam lemah" },
          { value: "weak-base", label: "Basa lemah" },
        ],
      },
      { name: "concentration", label: "Konsentrasi", type: "number", suffix: "M" },
      {
        name: "equivalents",
        label: "Jumlah H⁺/OH⁻ per molekul",
        type: "number",
        showIf: { field: "kind", values: ["strong-acid", "strong-base"] },
        help: "Contoh: H2SO4 (diasumsikan terionisasi penuh) = 2, Ca(OH)2 = 2.",
      },
      {
        name: "k",
        label: "Konstanta ionisasi (Ka atau Kb)",
        type: "number",
        showIf: { field: "kind", values: ["weak-acid", "weak-base"] },
        placeholder: "1.8e-5",
      },
    ],
    defaults: { kind: "weak-acid", concentration: "0.1", equivalents: "1", k: "1.8e-5" },
    run: (v) => {
      const kind = choice(
        v,
        "kind",
        ["strong-acid", "strong-base", "weak-acid", "weak-base"] as const,
        "strong-acid",
      );
      const weak = kind.startsWith("weak");
      return solveAcidPH({
        kind,
        concentration: num(v, "concentration", "Konsentrasi", { positive: true }),
        k: weak ? num(v, "k", "Konstanta ionisasi", { positive: true }) : undefined,
        equivalents: weak
          ? undefined
          : optNum(v, "equivalents", "Jumlah H⁺/OH⁻", { integer: true, min: 1, max: 4 }),
      });
    },
  },

  // ------------------------------- statistics ------------------------------
  descriptive: {
    id: "descriptive",
    fields: [
      {
        name: "data",
        label: "Data",
        type: "textarea",
        placeholder: "12, 15, 11, 18, 20, 15",
        mono: true,
        help: "Pisahkan dengan koma, spasi, atau baris baru. Gunakan titik untuk desimal.",
      },
    ],
    defaults: { data: "12, 15, 11, 18, 20, 15, 14, 16" },
    run: (v) => {
      const data = rationalList(required(v, "data", "Data"), "data");
      return solveDescriptive(`statistik ${data.map((d) => d.toString()).join(", ")}`, data);
    },
  },
  regression: {
    id: "regression",
    fields: [
      { name: "xs", label: "Data x", type: "textarea", placeholder: "1, 2, 3, 4, 5", mono: true },
      {
        name: "ys",
        label: "Data y",
        type: "textarea",
        placeholder: "2.1, 3.9, 6.2, 7.8, 10.1",
        mono: true,
      },
    ],
    defaults: { xs: "1, 2, 3, 4, 5", ys: "2.1, 3.9, 6.2, 7.8, 10.1" },
    run: (v) => {
      const xs = rationalList(required(v, "xs", "Data x"), "data x");
      const ys = rationalList(required(v, "ys", "Data y"), "data y");
      if (xs.length !== ys.length)
        throw new MathError(
          "dimension-mismatch",
          `Jumlah data x (${xs.length}) dan y (${ys.length}) harus sama.`,
          { module: "form" },
        );
      return solveRegression(
        xs.map((x, i) => `(${x.toString()}, ${ys[i].toString()})`).join(", "),
        xs,
        ys,
      );
    },
  },
  binomial: {
    id: "binomial",
    fields: [
      { name: "n", label: "Banyak percobaan n", type: "number" },
      {
        name: "p",
        label: "Peluang sukses p",
        type: "number",
        help: "Boleh pecahan, misalnya 1/6.",
      },
      { name: "tail", label: "Peluang yang dicari", type: "select", options: TAILS },
      { name: "k", label: "k", type: "number" },
      { name: "k2", label: "k₂", type: "number", showIf: { field: "tail", values: ["between"] } },
    ],
    defaults: { n: "10", p: "0.3", tail: "le", k: "3", k2: "5" },
    run: (v) => {
      const tail = choice<Tail>(v, "tail", ["eq", "le", "lt", "ge", "gt", "between"], "eq");
      return solveBinomial({
        n: num(v, "n", "n", { integer: true, min: 1 }),
        p: dec(v, "p", "p"),
        k: num(v, "k", "k", { integer: true, min: 0 }),
        k2: tail === "between" ? num(v, "k2", "k₂", { integer: true, min: 0 }) : undefined,
        tail,
      });
    },
  },
  poisson: {
    id: "poisson",
    fields: [
      { name: "lambda", label: "Rata-rata kejadian λ", type: "number" },
      { name: "tail", label: "Peluang yang dicari", type: "select", options: TAILS },
      { name: "k", label: "k", type: "number" },
      { name: "k2", label: "k₂", type: "number", showIf: { field: "tail", values: ["between"] } },
    ],
    defaults: { lambda: "4", tail: "eq", k: "2", k2: "6" },
    run: (v) => {
      const tail = choice<Tail>(v, "tail", ["eq", "le", "lt", "ge", "gt", "between"], "eq");
      return solvePoisson({
        lambda: dec(v, "lambda", "λ"),
        k: num(v, "k", "k", { integer: true, min: 0 }),
        k2: tail === "between" ? num(v, "k2", "k₂", { integer: true, min: 0 }) : undefined,
        tail,
      });
    },
  },
  normal: {
    id: "normal",
    fields: [
      { name: "mu", label: "Rata-rata μ", type: "number" },
      { name: "sigma", label: "Simpangan baku σ", type: "number" },
      {
        name: "tail",
        label: "Peluang yang dicari",
        type: "select",
        options: [
          { value: "le", label: "P(X ≤ a)" },
          { value: "ge", label: "P(X ≥ a)" },
          { value: "between", label: "P(a ≤ X ≤ b)" },
        ],
      },
      { name: "a", label: "a", type: "number" },
      { name: "b", label: "b", type: "number", showIf: { field: "tail", values: ["between"] } },
    ],
    defaults: { mu: "70", sigma: "10", tail: "between", a: "60", b: "85" },
    run: (v) => {
      const tail = choice(v, "tail", ["le", "ge", "between"] as const, "le");
      return solveNormal({
        mu: num(v, "mu", "μ"),
        sigma: num(v, "sigma", "σ", { positive: true }),
        tail,
        a: num(v, "a", "a"),
        b: tail === "between" ? num(v, "b", "b") : undefined,
      });
    },
  },
  "inverse-normal": {
    id: "inverse-normal",
    fields: [
      {
        name: "p",
        label: "Peluang kumulatif P(X ≤ x)",
        type: "number",
        help: "Antara 0 dan 1, misalnya 0.95.",
      },
      { name: "mu", label: "Rata-rata μ", type: "number" },
      { name: "sigma", label: "Simpangan baku σ", type: "number" },
    ],
    defaults: { p: "0.975", mu: "0", sigma: "1" },
    run: (v) =>
      solveInverseNormal({
        p: num(v, "p", "Peluang", { min: 0, max: 1 }),
        mu: num(v, "mu", "μ"),
        sigma: num(v, "sigma", "σ", { positive: true }),
      }),
  },
  "t-test": {
    id: "t-test",
    fields: [
      { name: "mean", label: "Rata-rata sampel x̄", type: "number" },
      { name: "sd", label: "Simpangan baku sampel s", type: "number" },
      { name: "n", label: "Ukuran sampel n", type: "number" },
      { name: "mu0", label: "Nilai hipotesis μ₀", type: "number" },
      { name: "alternative", label: "Hipotesis alternatif", type: "select", options: ALTERNATIVES },
      ALPHA,
    ],
    defaults: {
      mean: "52.3",
      sd: "6.1",
      n: "25",
      mu0: "50",
      alternative: "two-sided",
      alpha: "0.05",
    },
    run: (v) =>
      solveOneSampleT({
        mean: num(v, "mean", "x̄"),
        sd: num(v, "sd", "s", { positive: true }),
        n: num(v, "n", "n", { integer: true, min: 2 }),
        mu0: num(v, "mu0", "μ₀"),
        alternative: choice<Alternative>(
          v,
          "alternative",
          ["two-sided", "less", "greater"],
          "two-sided",
        ),
        alpha: num(v, "alpha", "α", { min: 1e-6, max: 0.5 }),
      }),
  },
  "confidence-interval": {
    id: "confidence-interval",
    fields: [
      { name: "mean", label: "Rata-rata sampel x̄", type: "number" },
      { name: "sd", label: "Simpangan baku", type: "number" },
      { name: "n", label: "Ukuran sampel n", type: "number" },
      {
        name: "confidence",
        label: "Tingkat kepercayaan",
        type: "number",
        suffix: "%",
        placeholder: "95",
      },
      {
        name: "sigmaKnown",
        label: "Simpangan baku populasi diketahui?",
        type: "select",
        options: [
          { value: "no", label: "Tidak (pakai distribusi t)" },
          { value: "yes", label: "Ya (pakai distribusi z)" },
        ],
      },
    ],
    defaults: { mean: "72.5", sd: "8.2", n: "36", confidence: "95", sigmaKnown: "no" },
    run: (v) => {
      const c = num(v, "confidence", "Tingkat kepercayaan", { min: 1, max: 99.999 });
      return solveConfidenceInterval({
        mean: num(v, "mean", "x̄"),
        sd: num(v, "sd", "Simpangan baku", { positive: true }),
        n: num(v, "n", "n", { integer: true, min: 2 }),
        confidence: c / 100,
        sigmaKnown: v.sigmaKnown === "yes",
      });
    },
  },
  "t-test-2": {
    id: "t-test-2",
    fields: [
      { name: "mean1", label: "x̄₁", type: "number" },
      { name: "sd1", label: "s₁", type: "number" },
      { name: "n1", label: "n₁", type: "number" },
      { name: "mean2", label: "x̄₂", type: "number" },
      { name: "sd2", label: "s₂", type: "number" },
      { name: "n2", label: "n₂", type: "number" },
      { name: "alternative", label: "Hipotesis alternatif", type: "select", options: ALTERNATIVES },
      ALPHA,
    ],
    defaults: {
      mean1: "78",
      sd1: "10",
      n1: "30",
      mean2: "72",
      sd2: "12",
      n2: "35",
      alternative: "two-sided",
      alpha: "0.05",
    },
    run: (v) =>
      solveTwoSampleT({
        mean1: num(v, "mean1", "x̄₁"),
        sd1: num(v, "sd1", "s₁", { positive: true }),
        n1: num(v, "n1", "n₁", { integer: true, min: 2 }),
        mean2: num(v, "mean2", "x̄₂"),
        sd2: num(v, "sd2", "s₂", { positive: true }),
        n2: num(v, "n2", "n₂", { integer: true, min: 2 }),
        alternative: choice<Alternative>(
          v,
          "alternative",
          ["two-sided", "less", "greater"],
          "two-sided",
        ),
        alpha: num(v, "alpha", "α", { min: 1e-6, max: 0.5 }),
      }),
  },
  "proportion-z": {
    id: "proportion-z",
    fields: [
      { name: "x", label: "Banyak sukses x", type: "number" },
      { name: "n", label: "Ukuran sampel n", type: "number" },
      { name: "p0", label: "Proporsi hipotesis p₀", type: "number" },
      { name: "alternative", label: "Hipotesis alternatif", type: "select", options: ALTERNATIVES },
      ALPHA,
    ],
    defaults: { x: "58", n: "100", p0: "0.5", alternative: "greater", alpha: "0.05" },
    run: (v) =>
      solveProportionZ({
        x: num(v, "x", "x", { integer: true, min: 0 }),
        n: num(v, "n", "n", { integer: true, min: 1 }),
        p0: num(v, "p0", "p₀", { min: 0, max: 1 }),
        alternative: choice<Alternative>(
          v,
          "alternative",
          ["two-sided", "less", "greater"],
          "two-sided",
        ),
        alpha: num(v, "alpha", "α", { min: 1e-6, max: 0.5 }),
      }),
  },
  "chi-square": {
    id: "chi-square",
    fields: [
      {
        name: "observed",
        label: "Frekuensi observasi O",
        type: "textarea",
        mono: true,
        placeholder: "18, 22, 20, 25, 15",
      },
      {
        name: "expected",
        label: "Frekuensi harapan E (opsional)",
        type: "textarea",
        mono: true,
        optional: true,
        help: "Kosongkan untuk distribusi seragam.",
      },
      ALPHA,
    ],
    defaults: { observed: "18, 22, 20, 25, 15", expected: "", alpha: "0.05" },
    run: (v) => {
      const observed = numberList(
        required(v, "observed", "Frekuensi observasi"),
        "frekuensi observasi",
      ).map(Number);
      const expected = (v.expected ?? "").trim()
        ? numberList(v.expected, "frekuensi harapan").map(Number)
        : undefined;
      return solveChiSquareGof({
        observed,
        expected,
        alpha: num(v, "alpha", "α", { min: 1e-6, max: 0.5 }),
      });
    },
  },
  anova: {
    id: "anova",
    fields: [
      {
        name: "groups",
        label: "Data kelompok",
        type: "textarea",
        mono: true,
        placeholder: "85, 90, 78, 92\n70, 75, 80, 72\n88, 95, 91, 89",
        help: "Satu kelompok per baris.",
      },
      ALPHA,
    ],
    defaults: {
      groups: "85, 90, 78, 92, 88\n70, 75, 80, 72, 74\n88, 95, 91, 89, 94",
      alpha: "0.05",
    },
    run: (v) => {
      const groups = required(v, "groups", "Data kelompok")
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l, i) => numberList(l, `kelompok ${i + 1}`).map(Number));
      return solveAnova({ groups, alpha: num(v, "alpha", "α", { min: 1e-6, max: 0.5 }) });
    },
  },
  geometric: {
    id: "geometric",
    fields: [
      { name: "p", label: "Peluang sukses p", type: "number" },
      {
        name: "tail",
        label: "Peluang yang dicari",
        type: "select",
        options: [
          { value: "eq", label: "P(X = k)" },
          { value: "le", label: "P(X ≤ k)" },
          { value: "gt", label: "P(X > k)" },
        ],
      },
      { name: "k", label: "k (percobaan ke-)", type: "number" },
    ],
    defaults: { p: "0.2", tail: "eq", k: "3" },
    run: (v) =>
      solveGeometric({
        p: dec(v, "p", "p"),
        k: num(v, "k", "k", { integer: true, min: 1 }),
        tail: choice(v, "tail", ["eq", "le", "gt"] as const, "eq"),
      }),
  },
  exponential: {
    id: "exponential",
    fields: [
      { name: "rate", label: "Laju λ", type: "number" },
      {
        name: "tail",
        label: "Peluang yang dicari",
        type: "select",
        options: [
          { value: "le", label: "P(X ≤ a)" },
          { value: "ge", label: "P(X ≥ a)" },
          { value: "between", label: "P(a ≤ X ≤ b)" },
        ],
      },
      { name: "a", label: "a", type: "number" },
      { name: "b", label: "b", type: "number", showIf: { field: "tail", values: ["between"] } },
    ],
    defaults: { rate: "0.5", tail: "le", a: "2", b: "4" },
    run: (v) => {
      const tail = choice(v, "tail", ["le", "ge", "between"] as const, "le");
      return solveExponentialDist({
        rate: num(v, "rate", "λ", { positive: true }),
        tail,
        a: num(v, "a", "a", { min: 0 }),
        b: tail === "between" ? num(v, "b", "b", { min: 0 }) : undefined,
      });
    },
  },

  // -------------------------------- finance --------------------------------
  "simple-interest": {
    id: "simple-interest",
    fields: [
      { name: "principal", label: "Pokok (modal awal)", type: "number", suffix: "Rp" },
      { name: "rate", label: "Suku bunga per tahun", type: "number", suffix: "%" },
      { name: "years", label: "Lama", type: "number", suffix: "tahun" },
    ],
    defaults: { principal: "10000000", rate: "6", years: "3" },
    run: (v) =>
      solveSimpleInterest({
        principal: dec(v, "principal", "Pokok"),
        ratePercent: dec(v, "rate", "Suku bunga"),
        years: dec(v, "years", "Lama"),
      }),
  },
  "compound-interest": {
    id: "compound-interest",
    fields: [
      { name: "principal", label: "Pokok (modal awal)", type: "number", suffix: "Rp" },
      { name: "rate", label: "Suku bunga nominal per tahun", type: "number", suffix: "%" },
      { name: "years", label: "Lama", type: "number", suffix: "tahun" },
      {
        name: "periods",
        label: "Frekuensi pemajemukan",
        type: "select",
        options: [
          { value: "1", label: "Tahunan (1×)" },
          { value: "2", label: "Semesteran (2×)" },
          { value: "4", label: "Kuartalan (4×)" },
          { value: "12", label: "Bulanan (12×)" },
          { value: "365", label: "Harian (365×)" },
          { value: "continuous", label: "Kontinu" },
        ],
      },
    ],
    defaults: { principal: "10000000", rate: "6", years: "5", periods: "12" },
    run: (v) => {
      const continuous = v.periods === "continuous";
      return solveCompoundInterest({
        principal: dec(v, "principal", "Pokok"),
        ratePercent: dec(v, "rate", "Suku bunga"),
        years: dec(v, "years", "Lama"),
        periodsPerYear: continuous
          ? "1"
          : choice(v, "periods", ["1", "2", "4", "12", "365"] as const, "1"),
        continuous,
      });
    },
  },
  loan: {
    id: "loan",
    fields: [
      { name: "principal", label: "Jumlah pinjaman", type: "number", suffix: "Rp" },
      { name: "rate", label: "Suku bunga per tahun", type: "number", suffix: "%" },
      { name: "years", label: "Tenor", type: "number", suffix: "tahun" },
      {
        name: "method",
        label: "Metode bunga",
        type: "select",
        options: [
          { value: "anuitas", label: "Anuitas (cicilan tetap)" },
          { value: "efektif", label: "Efektif (bunga menurun)" },
          { value: "flat", label: "Flat" },
        ],
      },
      {
        name: "perYear",
        label: "Pembayaran per tahun",
        type: "select",
        options: [
          { value: "12", label: "Bulanan (12×)" },
          { value: "4", label: "Kuartalan (4×)" },
          { value: "1", label: "Tahunan (1×)" },
        ],
      },
    ],
    defaults: { principal: "300000000", rate: "8", years: "15", method: "anuitas", perYear: "12" },
    run: (v) =>
      solveLoan({
        principal: dec(v, "principal", "Jumlah pinjaman"),
        annualRatePercent: dec(v, "rate", "Suku bunga"),
        years: dec(v, "years", "Tenor"),
        paymentsPerYear: choice(v, "perYear", ["12", "4", "1"] as const, "12"),
        method: choice<LoanMethod>(v, "method", ["anuitas", "efektif", "flat"], "anuitas"),
      }),
  },
  npv: {
    id: "npv",
    fields: [
      { name: "rate", label: "Tingkat diskonto per periode", type: "number", suffix: "%" },
      {
        name: "cashflows",
        label: "Arus kas CF₀, CF₁, …",
        type: "textarea",
        mono: true,
        help: "CF₀ biasanya investasi awal (negatif). Gunakan titik untuk desimal.",
      },
    ],
    defaults: { rate: "10", cashflows: "-1000000, 300000, 400000, 500000" },
    run: (v) =>
      solveNPV({
        ratePercent: dec(v, "rate", "Tingkat diskonto"),
        cashflows: numberList(required(v, "cashflows", "Arus kas"), "arus kas"),
      }),
  },
  irr: {
    id: "irr",
    fields: [
      {
        name: "cashflows",
        label: "Arus kas CF₀, CF₁, …",
        type: "textarea",
        mono: true,
        help: "Harus ada setidaknya satu arus kas negatif dan satu positif.",
      },
    ],
    defaults: { cashflows: "-1000000, 300000, 400000, 500000" },
    run: (v) =>
      solveIRR({ cashflows: numberList(required(v, "cashflows", "Arus kas"), "arus kas") }),
  },
  "break-even": {
    id: "break-even",
    fields: [
      { name: "fixedCost", label: "Biaya tetap total", type: "number", suffix: "Rp" },
      { name: "price", label: "Harga jual per unit", type: "number", suffix: "Rp" },
      { name: "variableCost", label: "Biaya variabel per unit", type: "number", suffix: "Rp" },
    ],
    defaults: { fixedCost: "50000000", price: "25000", variableCost: "15000" },
    run: (v) =>
      solveBreakEven({
        fixedCost: dec(v, "fixedCost", "Biaya tetap"),
        price: dec(v, "price", "Harga jual"),
        variableCost: dec(v, "variableCost", "Biaya variabel"),
      }),
  },
  depreciation: {
    id: "depreciation",
    fields: [
      { name: "cost", label: "Harga perolehan", type: "number", suffix: "Rp" },
      { name: "salvage", label: "Nilai sisa", type: "number", suffix: "Rp" },
      { name: "life", label: "Umur ekonomis", type: "number", suffix: "tahun" },
      {
        name: "method",
        label: "Metode",
        type: "select",
        options: [
          { value: "garis-lurus", label: "Garis lurus" },
          { value: "saldo-menurun", label: "Saldo menurun" },
          { value: "jumlah-angka-tahun", label: "Jumlah angka tahun" },
        ],
      },
      {
        name: "rate",
        label: "Tarif saldo menurun (opsional)",
        type: "number",
        suffix: "%",
        optional: true,
        showIf: { field: "method", values: ["saldo-menurun"] },
        help: "Kosongkan untuk tarif ganda (200% / umur).",
      },
    ],
    defaults: {
      cost: "120000000",
      salvage: "20000000",
      life: "5",
      method: "garis-lurus",
      rate: "",
    },
    run: (v) => {
      const method = choice(
        v,
        "method",
        ["garis-lurus", "saldo-menurun", "jumlah-angka-tahun"] as const,
        "garis-lurus",
      );
      return solveDepreciation({
        cost: dec(v, "cost", "Harga perolehan"),
        salvage: dec(v, "salvage", "Nilai sisa"),
        life: dec(v, "life", "Umur ekonomis"),
        method,
        ratePercent: method === "saldo-menurun" ? optDec(v, "rate", "Tarif") : undefined,
      });
    },
  },
  "real-rate": {
    id: "real-rate",
    fields: [
      { name: "nominal", label: "Suku bunga nominal", type: "number", suffix: "%" },
      { name: "inflation", label: "Inflasi", type: "number", suffix: "%" },
    ],
    defaults: { nominal: "6", inflation: "2.5" },
    run: (v) =>
      solveRealRate({
        nominalPercent: dec(v, "nominal", "Suku bunga nominal"),
        inflationPercent: dec(v, "inflation", "Inflasi"),
      }),
  },
  roi: {
    id: "roi",
    fields: [
      { name: "gain", label: "Nilai akhir / pendapatan investasi", type: "number", suffix: "Rp" },
      { name: "cost", label: "Biaya investasi", type: "number", suffix: "Rp" },
    ],
    defaults: { gain: "15000000", cost: "12000000" },
    run: (v) =>
      solveROI({ gain: dec(v, "gain", "Nilai akhir"), cost: dec(v, "cost", "Biaya investasi") }),
  },
  annuity: {
    id: "annuity",
    fields: [
      { name: "payment", label: "Pembayaran per periode", type: "number", suffix: "Rp" },
      { name: "rate", label: "Suku bunga per periode", type: "number", suffix: "%" },
      { name: "periods", label: "Banyak periode", type: "number" },
      {
        name: "kind",
        label: "Nilai yang dicari",
        type: "select",
        options: [
          { value: "pv", label: "Nilai sekarang (PV)" },
          { value: "fv", label: "Nilai masa depan (FV)" },
        ],
      },
      {
        name: "due",
        label: "Waktu pembayaran",
        type: "select",
        options: [
          { value: "no", label: "Akhir periode (biasa)" },
          { value: "yes", label: "Awal periode (annuity due)" },
        ],
      },
    ],
    defaults: { payment: "1000000", rate: "1", periods: "24", kind: "fv", due: "no" },
    run: (v) =>
      solveAnnuityValue({
        payment: dec(v, "payment", "Pembayaran"),
        ratePercent: dec(v, "rate", "Suku bunga"),
        periods: dec(v, "periods", "Banyak periode"),
        kind: choice(v, "kind", ["pv", "fv"] as const, "pv"),
        due: v.due === "yes",
      }),
  },

  // --------------------------- computer science ---------------------------
  "base-conversion": {
    id: "base-conversion",
    fields: [
      { name: "value", label: "Bilangan", type: "text", mono: true, placeholder: "1011.101" },
      { name: "from", label: "Basis asal", type: "number", placeholder: "2" },
      { name: "to", label: "Basis tujuan", type: "number", placeholder: "10" },
    ],
    defaults: { value: "1011.101", from: "2", to: "10" },
    run: (v) =>
      solveBaseConversion({
        value: required(v, "value", "Bilangan"),
        from: num(v, "from", "Basis asal", { integer: true, min: 2, max: 36 }),
        to: num(v, "to", "Basis tujuan", { integer: true, min: 2, max: 36 }),
      }),
  },
  "twos-complement": {
    id: "twos-complement",
    fields: [
      {
        name: "value",
        label: "Bilangan bulat (desimal)",
        type: "text",
        mono: true,
        placeholder: "-42",
      },
      {
        name: "bits",
        label: "Lebar bit",
        type: "select",
        options: ["4", "8", "16", "32", "64"].map((b) => ({ value: b, label: `${b} bit` })),
      },
    ],
    defaults: { value: "-42", bits: "8" },
    run: (v) =>
      solveTwosComplement({
        value: integerText(v, "value", "Bilangan"),
        bits: Number(choice(v, "bits", ["4", "8", "16", "32", "64"] as const, "8")),
      }),
  },
  bitwise: {
    id: "bitwise",
    fields: [
      {
        name: "op",
        label: "Operasi",
        type: "select",
        options: [
          { value: "and", label: "AND" },
          { value: "or", label: "OR" },
          { value: "xor", label: "XOR" },
          { value: "not", label: "NOT" },
          { value: "shl", label: "Geser kiri (<<)" },
          { value: "shr", label: "Geser kanan (>>)" },
        ],
      },
      {
        name: "a",
        label: "A",
        type: "text",
        mono: true,
        help: "Desimal, 0b… (biner) atau 0x… (heksadesimal).",
      },
      {
        name: "b",
        label: "B (atau jumlah geser)",
        type: "text",
        mono: true,
        showIf: { field: "op", values: ["and", "or", "xor", "shl", "shr"] },
      },
      {
        name: "bits",
        label: "Lebar bit",
        type: "select",
        options: ["8", "16", "32"].map((b) => ({ value: b, label: `${b} bit` })),
      },
    ],
    defaults: { op: "and", a: "0b11001010", b: "0x0F", bits: "8" },
    run: (v) => {
      const op = choice(v, "op", ["and", "or", "xor", "not", "shl", "shr"] as const, "and");
      const check = (name: string, label: string) => {
        const t = required(v, name, label).trim().toLowerCase();
        if (!/^(0x[0-9a-f]+|0b[01]+|\d+)$/.test(t))
          throw new MathError(
            "invalid-input",
            `${label} harus bilangan bulat non-negatif (desimal, 0b…, atau 0x…).`,
            { module: "form" },
          );
        return t;
      };
      return solveBitwise({
        op,
        a: check("a", "A"),
        b: op === "not" ? undefined : check("b", "B"),
        bits: Number(choice(v, "bits", ["8", "16", "32"] as const, "8")),
      });
    },
  },
  subnet: {
    id: "subnet",
    fields: [
      {
        name: "address",
        label: "Alamat IPv4 + prefix/mask",
        type: "text",
        mono: true,
        placeholder: "192.168.10.77/26",
        help: "Contoh: 10.0.5.20/20 atau 192.168.1.10 255.255.255.0.",
      },
    ],
    defaults: { address: "192.168.10.77/26" },
    run: (v) => solveSubnet({ address: required(v, "address", "Alamat") }),
  },
  base64: {
    id: "base64",
    fields: [
      {
        name: "mode",
        label: "Mode",
        type: "select",
        options: [
          { value: "encode", label: "Encode (teks → Base64)" },
          { value: "decode", label: "Decode (Base64 → teks)" },
        ],
      },
      { name: "text", label: "Teks", type: "textarea", mono: true },
    ],
    defaults: { mode: "encode", text: "Halo, Dunia!" },
    run: (v) => {
      const text = v.text ?? "";
      if (text.length > 4096)
        throw new MathError("limit-exceeded", "Teks dibatasi 4096 karakter.", { module: "form" });
      if (!text) throw new MathError("invalid-input", "Teks belum diisi.", { module: "form" });
      return solveBase64({
        text,
        mode: choice(v, "mode", ["encode", "decode"] as const, "encode"),
      });
    },
  },
  boolean: {
    id: "boolean",
    fields: [
      {
        name: "expression",
        label: "Ekspresi Boolean",
        type: "text",
        mono: true,
        placeholder: "A'B + AB' + AB",
        help: "Operator: AND (·, &, juxtaposisi), OR (+, |), NOT (', !, ¬), XOR (^, ⊕).",
      },
    ],
    defaults: { expression: "A'B + AB' + AB" },
    run: (v) => solveBoolean({ expression: required(v, "expression", "Ekspresi") }),
  },
};

export type ToolId = keyof typeof TOOLS;
