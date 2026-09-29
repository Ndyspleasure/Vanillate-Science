/**
 * Inequalities in one variable.
 *
 * Linear inequalities use the balance method (flip the sign when multiplying/dividing by a
 * negative number). All other inequalities use the sign-chart method: critical points are
 * the solutions of f(x) = 0 plus points where f is undefined (denominator zeros, domain
 * boundaries), the sign of f is tested in every interval, and the intervals satisfying the
 * inequality are joined.
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { evalReal } from "../expr/evaluate";
import { expand } from "../expr/expand";
import { polyCoefficients } from "../expr/polynomial";
import { toLatex, toText } from "../expr/print";
import { add, div, mul, neg, num, sub, ZERO, frac } from "../expr/simplify";
import { containsSymbol, exprKey, freeSymbols, rawSym, type Expr } from "../expr/types";
import { toExpr } from "../parse/convert";
import { syntaxToLatex } from "../parse/print-syntax";
import type { RelOp, SNode } from "../parse/syntax";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification, formatNumber } from "../steps/format";
import type { Answer, Solution, Step, TableData, VerificationCheck } from "../steps/types";
import { chooseVariable, solveCore } from "./equation";
import { PERIOD_SYMBOL } from "./isolate";

type Ineq = "<" | ">" | "<=" | ">=" | "!=";

const REL_LATEX: Record<string, string> = { "<": "<", ">": ">", "<=": "\\le", ">=": "\\ge", "!=": "\\ne", "=": "=" };
const FLIP: Record<Ineq, Ineq> = { "<": ">", ">": "<", "<=": ">=", ">=": "<=", "!=": "!=" };

export interface Point {
  value: number;
  expr?: Expr;
}

export interface Interval {
  lo: Point | null; // null = -∞
  hi: Point | null; // null = +∞
  loClosed: boolean;
  hiClosed: boolean;
}

function pointLatex(p: Point): string {
  return p.expr ? toLatex(p.expr) : formatNumber(p.value, 10);
}
function pointText(p: Point): string {
  return p.expr ? toText(p.expr) : formatNumber(p.value, 10);
}

export function intervalLatex(iv: Interval): string {
  if (iv.lo && iv.hi && iv.lo.value === iv.hi.value) return `\\left\\{${pointLatex(iv.lo)}\\right\\}`;
  const l = iv.lo ? pointLatex(iv.lo) : "-\\infty";
  const h = iv.hi ? pointLatex(iv.hi) : "\\infty";
  return `${iv.loClosed && iv.lo ? "\\left[" : "\\left("}${l}, ${h}${iv.hiClosed && iv.hi ? "\\right]" : "\\right)"}`;
}

function intervalText(iv: Interval): string {
  if (iv.lo && iv.hi && iv.lo.value === iv.hi.value) return `{${pointText(iv.lo)}}`;
  const l = iv.lo ? pointText(iv.lo) : "-∞";
  const h = iv.hi ? pointText(iv.hi) : "∞";
  return `${iv.loClosed && iv.lo ? "[" : "("}${l}, ${h}${iv.hiClosed && iv.hi ? "]" : ")"}`;
}

export function unionLatex(ivs: Interval[]): string {
  if (ivs.length === 0) return "\\varnothing";
  if (ivs.length === 1 && !ivs[0].lo && !ivs[0].hi) return "\\mathbb{R}";
  return ivs.map(intervalLatex).join(" \\cup ");
}

function setBuilderLatex(ivs: Interval[], x: string): string {
  const X = toLatex(rawSym(x));
  return ivs
    .map((iv) => {
      if (iv.lo && iv.hi && iv.lo.value === iv.hi.value) return `${X} = ${pointLatex(iv.lo)}`;
      if (!iv.lo && !iv.hi) return `${X} \\in \\mathbb{R}`;
      if (!iv.lo) return `${X} ${iv.hiClosed ? "\\le" : "<"} ${pointLatex(iv.hi!)}`;
      if (!iv.hi) return `${X} ${iv.loClosed ? "\\ge" : ">"} ${pointLatex(iv.lo)}`;
      return `${pointLatex(iv.lo)} ${iv.loClosed ? "\\le" : "<"} ${X} ${iv.hiClosed ? "\\le" : "<"} ${pointLatex(iv.hi)}`;
    })
    .join(" \\ \\lor\\ ");
}

function setBuilderText(ivs: Interval[], x: string): string {
  return ivs
    .map((iv) => {
      if (iv.lo && iv.hi && iv.lo.value === iv.hi.value) return `${x} = ${pointText(iv.lo)}`;
      if (!iv.lo && !iv.hi) return `${x} ∈ ℝ`;
      if (!iv.lo) return `${x} ${iv.hiClosed ? "≤" : "<"} ${pointText(iv.hi!)}`;
      if (!iv.hi) return `${x} ${iv.loClosed ? "≥" : ">"} ${pointText(iv.lo)}`;
      return `${pointText(iv.lo)} ${iv.loClosed ? "≤" : "<"} ${x} ${iv.hiClosed ? "≤" : "<"} ${pointText(iv.hi)}`;
    })
    .join(" atau ");
}

function satisfies(v: number, op: Ineq): boolean {
  switch (op) {
    case "<":
      return v < 0;
    case ">":
      return v > 0;
    case "<=":
      return v <= 0;
    case ">=":
      return v >= 0;
    case "!=":
      return v !== 0;
  }
}

/** Domain-boundary expressions: denominators, radicands of even roots, log arguments. */
function domainBoundaries(e: Expr, x: string, out: Expr[] = []): Expr[] {
  const push = (b: Expr) => {
    if (containsSymbol(b, x) && !out.some((o) => exprKey(o) === exprKey(b))) out.push(b);
  };
  if (e.type === "pow" && e.exp.type === "num") {
    if (e.exp.value.isNegative()) push(e.base);
    if (e.exp.value.den % 2n === 0n) push(e.base);
  }
  if (e.type === "fn" && (e.name === "ln" || e.name === "log")) push(e.args[0]);
  if (e.type === "fn" && e.name === "abs") push(e.args[0]);
  const kids = e.type === "add" ? e.terms : e.type === "mul" ? e.factors : e.type === "pow" ? [e.base, e.exp] : e.type === "fn" ? e.args : [];
  kids.forEach((k) => domainBoundaries(k, x, out));
  return out;
}

function realRootsOf(L: Expr, R: Expr, x: string): Point[] {
  const att = solveCore(L, R, x);
  if (att.roots.some((r) => r.periodic)) {
    throw new MathError("unsupported", "Pertidaksamaan trigonometri pada seluruh bilangan real belum didukung.", {
      module: "inequality",
      hint: "Batasi domain atau selesaikan persamaan terkait terlebih dahulu.",
    });
  }
  const pts: Point[] = [];
  for (const r of att.roots) {
    const v = r.expr ? evalReal(r.expr) : r.approx && Math.abs(r.approx.im) < 1e-12 ? r.approx.re : NaN;
    if (!Number.isFinite(v)) continue;
    if (r.expr && containsSymbol(r.expr, "i")) continue;
    pts.push({ value: v, expr: r.expr && freeSymbols(r.expr).size === 0 ? r.expr : undefined });
  }
  return pts;
}

export interface SignChartResult {
  intervals: Interval[];
  steps: Step[];
  table: TableData;
  critical: Point[];
}

export function signChart(f: Expr, op: Ineq, x: string): SignChartResult {
  const F = (t: number) => evalReal(f, { [x]: t });
  const zeros = realRootsOf(f, ZERO, x);
  const bounds: Point[] = [];
  for (const b of domainBoundaries(f, x)) {
    try {
      bounds.push(...realRootsOf(b, ZERO, x));
    } catch {
      // ignore boundaries we cannot solve
    }
  }
  const all: Point[] = [];
  for (const p of [...zeros, ...bounds]) {
    if (!all.some((q) => Math.abs(q.value - p.value) <= 1e-9 * Math.max(1, Math.abs(p.value)))) all.push(p);
  }
  all.sort((a, b) => a.value - b.value);
  const steps: Step[] = [];
  const X = toLatex(rawSym(x));
  steps.push({
    title: "Tentukan titik kritis",
    after: all.length ? all.map((p) => `${X} = ${pointLatex(p)}`).join(",\\ ") : "\\text{tidak ada titik kritis}",
    operation: "critical-points",
    rule: { id: "critical", name: "Titik kritis", formula: "f(x) = 0 \\text{ atau } f(x) \\text{ tidak terdefinisi}" },
    reason: "Tanda f hanya dapat berubah di pembuat nol atau di titik tempat f tidak terdefinisi (penyebut nol / batas domain).",
  });
  // test intervals
  const edges = all.map((p) => p.value);
  const segments: Array<{ lo: Point | null; hi: Point | null; test: number }> = [];
  if (edges.length === 0) segments.push({ lo: null, hi: null, test: 0 });
  else {
    segments.push({ lo: null, hi: all[0], test: edges[0] - Math.max(1, Math.abs(edges[0]) * 0.5) });
    for (let i = 0; i < all.length - 1; i++) segments.push({ lo: all[i], hi: all[i + 1], test: (edges[i] + edges[i + 1]) / 2 });
    segments.push({ lo: all[all.length - 1], hi: null, test: edges[edges.length - 1] + Math.max(1, Math.abs(edges[edges.length - 1]) * 0.5) });
  }
  const rows: string[][] = [];
  const picked: Interval[] = [];
  for (const seg of segments) {
    const v = F(seg.test);
    const defined = Number.isFinite(v);
    const ok = defined && satisfies(v, op);
    rows.push([
      intervalText({ lo: seg.lo, hi: seg.hi, loClosed: false, hiClosed: false }),
      formatNumber(seg.test, 6),
      defined ? (v > 0 ? "+" : v < 0 ? "−" : "0") : "tidak terdefinisi",
      ok ? "✓" : "✗",
    ]);
    if (ok) picked.push({ lo: seg.lo, hi: seg.hi, loClosed: false, hiClosed: false });
  }
  // endpoints
  const pointOk = all.map((p) => {
    const v = F(p.value);
    return Number.isFinite(v) && satisfies(Math.abs(v) < 1e-12 ? 0 : v, op);
  });
  steps.push({
    title: "Uji tanda f pada setiap interval (garis bilangan)",
    after: `f(${X}) = ${toLatex(f)}`,
    operation: "sign-chart",
    rule: { id: "sign-chart", name: "Metode garis bilangan / tabel tanda" },
    reason: "Satu titik uji di setiap interval cukup karena f tidak berganti tanda di dalam interval tanpa titik kritis (fungsi kontinu pada domainnya).",
  });
  // merge intervals and endpoints
  const merged: Interval[] = [];
  const addInterval = (iv: Interval) => {
    const last = merged[merged.length - 1];
    if (last && last.hi && iv.lo && last.hi.value === iv.lo.value && (last.hiClosed || iv.loClosed)) {
      last.hi = iv.hi;
      last.hiClosed = iv.hiClosed;
    } else merged.push({ ...iv });
  };
  // walk in order: segment0, point0, segment1, point1, ...
  for (let i = 0; i < segments.length; i++) {
    const seg = picked.find((p) => p.lo === segments[i].lo && p.hi === segments[i].hi);
    if (seg) {
      const iv: Interval = { ...seg, loClosed: i > 0 && pointOk[i - 1], hiClosed: i < all.length && pointOk[i] };
      addInterval(iv);
    }
    if (i < all.length && pointOk[i]) {
      const last = merged[merged.length - 1];
      if (last && last.hi && last.hi.value === all[i].value) last.hiClosed = true;
      else if (!(segments[i + 1] && picked.find((p) => p.lo === segments[i + 1].lo && p.hi === segments[i + 1].hi))) addInterval({ lo: all[i], hi: all[i], loClosed: true, hiClosed: true });
    }
  }
  steps.push({
    title: "Gabungkan interval yang memenuhi",
    after: unionLatex(merged),
    operation: "union",
    reason: op.includes("=") ? "Titik pembuat nol ikut disertakan (tanda ≤ / ≥), titik tak terdefinisi selalu dikecualikan." : "Titik pembuat nol tidak disertakan (tanda < / >).",
  });
  return {
    intervals: merged,
    steps,
    critical: all,
    table: { caption: "Tabel tanda", headers: ["Interval", "Titik uji", "Tanda f", "Memenuhi?"], rows },
  };
}

function linearInequalitySteps(L: Expr, R: Expr, op: Ineq, x: string): { steps: Step[]; op: Ineq; bound: Expr; A: Rational } | null {
  const cL = polyCoefficients(L, x);
  const cR = polyCoefficients(R, x);
  if (!cL || !cR || cL.length > 2 || cR.length > 2) return null;
  const coefs = [...cL, ...cR];
  if (!coefs.every((c) => c.type === "num")) return null;
  const a = sub(cL[1] ?? ZERO, cR[1] ?? ZERO);
  const b = sub(cR[0] ?? ZERO, cL[0] ?? ZERO);
  if (a.type !== "num" || a.value.isZero()) return null;
  const X = rawSym(x);
  const steps: Step[] = [];
  const rel = (l: Expr, o: Ineq, r: Expr) => `${toLatex(l)} ${REL_LATEX[o]} ${toLatex(r)}`;
  const Le = expand(L);
  const Re = expand(R);
  if (exprKey(Le) !== exprKey(L) || exprKey(Re) !== exprKey(R)) {
    steps.push({ title: "Jabarkan kedua ruas", before: rel(L, op, R), after: rel(Le, op, Re), operation: "expand", reason: "Hilangkan tanda kurung." });
  }
  const mid = mul(a, X);
  steps.push({
    title: "Kumpulkan suku variabel di kiri dan konstanta di kanan",
    before: rel(Le, op, Re),
    after: rel(mid, op, b),
    operation: "collect",
    rule: { id: "ineq-add", name: "Sifat penjumlahan pertidaksamaan", formula: "a < b \\iff a + c < b + c" },
    reason: "Menambah/mengurangi bilangan yang sama pada kedua ruas tidak mengubah arah pertidaksamaan.",
  });
  const A = a.value;
  const newOp = A.isNegative() ? FLIP[op] : op;
  const bound = div(b, a);
  if (!A.isOne()) {
    steps.push({
      title: A.isNegative() ? `Bagi kedua ruas dengan ${A.toString()} dan BALIK tanda pertidaksamaan` : `Bagi kedua ruas dengan ${A.toString()}`,
      before: rel(mid, op, b),
      after: rel(X, newOp, bound),
      operation: A.isNegative() ? "divide-negative-flip" : "divide-positive",
      rule: A.isNegative()
        ? { id: "ineq-neg", name: "Perkalian/pembagian dengan bilangan negatif", formula: "a < b,\\ c < 0 \\Rightarrow \\frac{a}{c} > \\frac{b}{c}" }
        : { id: "ineq-pos", name: "Perkalian/pembagian dengan bilangan positif", formula: "a < b,\\ c > 0 \\Rightarrow \\frac{a}{c} < \\frac{b}{c}" },
      reason: A.isNegative() ? "Membagi dengan bilangan negatif membalik urutan bilangan, sehingga tanda pertidaksamaan harus dibalik." : "Membagi dengan bilangan positif tidak mengubah arah pertidaksamaan.",
    });
  }
  return { steps, op: newOp, bound, A };
}

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const p of a) {
    for (const q of b) {
      const loP = p.lo ? p.lo.value : -Infinity;
      const loQ = q.lo ? q.lo.value : -Infinity;
      const hiP = p.hi ? p.hi.value : Infinity;
      const hiQ = q.hi ? q.hi.value : Infinity;
      let lo: Point | null;
      let loClosed: boolean;
      if (loP > loQ) {
        lo = p.lo;
        loClosed = p.loClosed;
      } else if (loQ > loP) {
        lo = q.lo;
        loClosed = q.loClosed;
      } else {
        lo = p.lo;
        loClosed = p.loClosed && q.loClosed;
      }
      let hi: Point | null;
      let hiClosed: boolean;
      if (hiP < hiQ) {
        hi = p.hi;
        hiClosed = p.hiClosed;
      } else if (hiQ < hiP) {
        hi = q.hi;
        hiClosed = q.hiClosed;
      } else {
        hi = p.hi;
        hiClosed = p.hiClosed && q.hiClosed;
      }
      const l = lo ? lo.value : -Infinity;
      const h = hi ? hi.value : Infinity;
      if (l < h || (l === h && loClosed && hiClosed)) out.push({ lo, hi, loClosed, hiClosed });
    }
  }
  return out;
}

function solveSingle(L: Expr, R: Expr, op: Ineq, x: string): { intervals: Interval[]; steps: Step[]; method: string; table?: TableData } {
  const lin = linearInequalitySteps(L, R, op, x);
  if (lin) {
    const v = evalReal(lin.bound);
    const p: Point = { value: v, expr: lin.bound };
    let intervals: Interval[];
    switch (lin.op) {
      case "<":
        intervals = [{ lo: null, hi: p, loClosed: false, hiClosed: false }];
        break;
      case "<=":
        intervals = [{ lo: null, hi: p, loClosed: false, hiClosed: true }];
        break;
      case ">":
        intervals = [{ lo: p, hi: null, loClosed: false, hiClosed: false }];
        break;
      case ">=":
        intervals = [{ lo: p, hi: null, loClosed: true, hiClosed: false }];
        break;
      default:
        intervals = [
          { lo: null, hi: p, loClosed: false, hiClosed: false },
          { lo: p, hi: null, loClosed: false, hiClosed: false },
        ];
    }
    return { intervals, steps: lin.steps, method: "Pertidaksamaan linear" };
  }
  const f = sub(L, R);
  const steps: Step[] = [];
  steps.push({ title: "Pindahkan semua suku ke satu ruas", after: `${toLatex(f)} ${REL_LATEX[op]} 0`, operation: "standard-form", reason: "Bandingkan satu fungsi f(x) dengan 0." });
  const sc = signChart(f, op, x);
  return { intervals: sc.intervals, steps: [...steps, ...sc.steps], method: "Metode garis bilangan (tabel tanda)", table: sc.table };
}

export function solveInequality(input: string, node: SNode, options: { variable?: string; warnings?: string[] } = {}): Solution {
  if (node.k !== "rel") throw new MathError("internal", "Bukan pertidaksamaan.", { module: "inequality" });
  const operands = node.operands.map((o) => toExpr(o));
  const vars = new Set(operands.flatMap((o) => [...freeSymbols(o)]));
  if (vars.size === 0) throw new MathError("invalid-input", "Pertidaksamaan tidak memuat variabel.", { module: "inequality" });
  if (vars.size > 1 && !options.variable) {
    throw new MathError("unsupported", "Pertidaksamaan dengan lebih dari satu variabel belum didukung.", {
      module: "inequality",
      hint: "Gunakan satu variabel, misalnya 2x + 3 > 7.",
    });
  }
  const x = chooseVariable(vars, options.variable);
  const ops = node.ops as RelOp[];
  if (ops.some((o) => o === "=")) throw new MathError("invalid-input", "Rantai relasi tidak boleh memuat '='.", { module: "inequality" });
  let intervals: Interval[] | null = null;
  const steps: Step[] = [];
  const tables: TableData[] = [];
  let method = "";
  for (let i = 0; i < ops.length; i++) {
    const r = solveSingle(operands[i], operands[i + 1], ops[i] as Ineq, x);
    if (ops.length > 1) {
      steps.push({ title: `Bagian ${i + 1}: $${toLatex(operands[i])} ${REL_LATEX[ops[i]]} ${toLatex(operands[i + 1])}$`, after: unionLatex(r.intervals), operation: "part", reason: r.method, substeps: r.steps });
    } else steps.push(...r.steps);
    if (r.table) tables.push(r.table);
    method = r.method;
    intervals = intervals === null ? r.intervals : intersect(intervals, r.intervals);
  }
  if (ops.length > 1) {
    steps.push({ title: "Iriskan penyelesaian semua bagian", after: unionLatex(intervals!), operation: "intersection", rule: { id: "compound", name: "Pertidaksamaan majemuk", formula: "a < f < b \\iff (a < f) \\land (f < b)" }, reason: "Kedua syarat harus dipenuhi sekaligus." });
    method = "Pertidaksamaan majemuk";
  }
  const result = intervals!;
  const answers: Answer[] = [
    { label: "Himpunan penyelesaian", latex: unionLatex(result), text: result.length ? result.map(intervalText).join(" ∪ ") : "∅", exact: result.every((iv) => (!iv.lo || iv.lo.expr) && (!iv.hi || iv.hi.expr)) },
  ];
  if (result.length) answers.push({ label: "Notasi pembentuk himpunan", latex: setBuilderLatex(result, x), text: setBuilderText(result, x), exact: true });

  // Verification: random points inside and outside solution intervals
  const checks: VerificationCheck[] = [];
  const holds = (t: number) =>
    ops.every((o, i) => {
      const a = evalReal(operands[i], { [x]: t });
      const b = evalReal(operands[i + 1], { [x]: t });
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return satisfies(a - b, o as Ineq) || (o.includes("=") && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a)));
    });
  const inSolution = (t: number) =>
    result.some((iv) => {
      const lo = iv.lo ? iv.lo.value : -Infinity;
      const hi = iv.hi ? iv.hi.value : Infinity;
      return (t > lo || (iv.loClosed && t === lo)) && (t < hi || (iv.hiClosed && t === hi));
    });
  let tested = 0;
  let mismatch: number | null = null;
  const edges = result.flatMap((iv) => [iv.lo?.value, iv.hi?.value]).filter((v): v is number => v !== undefined);
  const samples = [-1000, -37.3, -7.1, -2.6, -1.3, -0.4, 0.3, 1.7, 3.9, 8.2, 41.7, 1000, ...edges.map((e) => e - 1e-6), ...edges.map((e) => e + 1e-6)];
  for (const t of samples) {
    const truth = holds(t);
    const claim = inSolution(t);
    tested++;
    if (truth !== claim) {
      mismatch = t;
      break;
    }
  }
  checks.push({
    description: "Uji pertidaksamaan asli pada titik-titik sampel di dalam dan di luar himpunan penyelesaian",
    passed: mismatch === null,
    method: "Pengujian numerik titik sampel",
    detail: mismatch === null ? `${tested} titik uji konsisten dengan himpunan penyelesaian.` : `Tidak konsisten di x = ${mismatch}.`,
  });
  for (const e of edges) {
    const truth = holds(e);
    const claim = inSolution(e);
    checks.push({ description: `Periksa titik batas $${toLatex(rawSym(x))} = ${formatNumber(e, 8)}$`, passed: truth === claim, method: "Pengujian numerik titik batas", detail: truth ? "Titik batas memenuhi (termasuk)." : "Titik batas tidak memenuhi (tidak termasuk)." });
  }
  const numberLine = result.length && operands.length === 2 && vars.size === 1
    ? { kind: "function" as const, variable: x, functions: [{ expr: toText(sub(operands[0], operands[1])), label: `f(${x}) = ${toText(sub(operands[0], operands[1]))}` }], points: edges.map((e) => ({ x: e, y: 0, label: formatNumber(e, 5) })) }
    : undefined;
  return makeSolution({
    kind: "inequality",
    title: `Pertidaksamaan — ${method}`,
    input,
    inputLatex: syntaxToLatex(node),
    answers,
    method: { name: method, description: method === "Pertidaksamaan linear" ? "Operasi yang sama pada kedua ruas; tanda dibalik bila dikali/dibagi bilangan negatif." : "Tentukan titik kritis, uji tanda di setiap interval, lalu gabungkan interval yang memenuhi." },
    steps,
    verification: aggregateVerification(checks),
    module: "inequality",
    assumptions: [`${x} bilangan real.`],
    notes: options.warnings ?? [],
    tables,
    plot: numberLine,
    references: [REFERENCES.openstaxAlgebra],
  });
}

export { add, neg, num, frac, PERIOD_SYMBOL };
