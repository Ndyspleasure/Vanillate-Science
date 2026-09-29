/**
 * Data contract between the engine and the UI.
 *
 * Every solver returns a `Solution` made only of plain data (strings, numbers, booleans) so it
 * can cross a Web Worker boundary and be serialized. Steps are produced from operations the
 * engine actually performed (CLAUDE.md §7) and carry their own verification status.
 */

export type Level = "dasar" | "pelajar" | "universitas" | "advanced" | "expert";

export const LEVELS: { id: Level; label: string; description: string }[] = [
  { id: "dasar", label: "Dasar", description: "Bahasa sederhana untuk pemula." },
  { id: "pelajar", label: "Pelajar", description: "Penjelasan konseptual dan rumus." },
  { id: "universitas", label: "Universitas", description: "Notasi dan terminologi akademik." },
  { id: "advanced", label: "Advanced", description: "Langkah formal beserta asumsi." },
  { id: "expert", label: "Expert", description: "Teorema, kondisi keberlakuan, domain, dan verifikasi tiap langkah." },
];

export type VerificationStatus = "verified" | "verified-numeric" | "partial" | "unverified" | "failed";

export interface Reference {
  name: string;
  source: string;
  edition?: string;
  chapter?: string;
  section?: string;
  url?: string;
  notes?: string;
}

export interface RuleRef {
  id: string;
  name: string;
  /** LaTeX statement of the rule, e.g. "\\frac{d}{dx}x^n = n x^{n-1}". */
  formula?: string;
  /** Conditions under which the rule is valid. */
  conditions?: string;
}

export interface StepCheck {
  status: VerificationStatus;
  method: string;
  detail?: string;
}

export interface Step {
  /** Short description of the operation ("Kurangi kedua ruas dengan 5"). */
  title: string;
  /** LaTeX before the transformation (optional). */
  before?: string;
  /** LaTeX after the transformation. */
  after: string;
  /** Machine-readable operation id ("subtract-both-sides"). */
  operation: string;
  rule?: RuleRef;
  /** Plain explanation of why the step is taken. */
  reason: string;
  /** Formal/expert explanation (conditions, theorems). */
  detail?: string;
  assumptions?: string[];
  check?: StepCheck;
  substeps?: Step[];
}

export interface Answer {
  /** Label such as "x₁" or "Determinan". */
  label?: string;
  latex: string;
  text: string;
  /** Decimal approximation (string, already formatted) when the exact form is not a plain decimal. */
  approx?: string;
  exact: boolean;
  /** Unit (LaTeX) for scientific results. */
  unit?: string;
}

export interface VerificationCheck {
  description: string;
  latex?: string;
  passed: boolean;
  method: string;
  detail?: string;
}

export interface Verification {
  status: VerificationStatus;
  summary: string;
  checks: VerificationCheck[];
}

export interface Alternative {
  name: string;
  description: string;
  steps: Step[];
  answers?: Answer[];
}

export interface PlotFunction {
  /** Re-parseable text expression in the plot variable. */
  expr: string;
  label: string;
}

export interface PlotSpec {
  kind: "function" | "polar" | "parametric" | "scatter" | "histogram" | "bar";
  variable: string;
  functions: PlotFunction[];
  xRange?: [number, number];
  yRange?: [number, number];
  points?: { x: number; y: number; label?: string }[];
  /** Filled region under a curve (definite integrals). */
  shade?: { from: number; to: number; functionIndex: number };
  /** Data for statistics plots. */
  data?: number[];
  /** Parametric/polar parameter range. */
  tRange?: [number, number];
  /** Second component for parametric plots. */
  yExpr?: string;
}

export interface TableData {
  caption?: string;
  headers: string[];
  rows: string[][];
}

export type ProblemKind =
  | "arithmetic"
  | "simplify"
  | "expand"
  | "factor"
  | "equation"
  | "inequality"
  | "system"
  | "derivative"
  | "integral"
  | "limit"
  | "series"
  | "matrix"
  | "vector"
  | "number-theory"
  | "complex"
  | "statistics"
  | "probability"
  | "units"
  | "formula"
  | "chemistry"
  | "finance"
  | "computer-science"
  | "geometry"
  | "trigonometry"
  | "ode"
  | "logic"
  | "sequence";

export interface Solution {
  kind: ProblemKind;
  title: string;
  input: string;
  inputLatex: string;
  answers: Answer[];
  method: { name: string; description: string; formula?: string };
  steps: Step[];
  verification: Verification;
  assumptions: string[];
  /** Interpretation notes and warnings. */
  notes: string[];
  alternatives: Alternative[];
  plot?: PlotSpec;
  tables?: TableData[];
  references?: Reference[];
  meta: {
    engineVersion: string;
    module: string;
    durationMs?: number;
  };
}

export const ENGINE_VERSION = "1.0.0";
