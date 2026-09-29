/**
 * Arithmetic with step-by-step order of operations (KaBaTaKu: Kurung, Pangkat,
 * Kali/Bagi, Tambah/Kurang).
 *
 * The syntax tree is reduced one operation at a time. Each step shows the whole expression
 * with the operation being evaluated highlighted, so the explanation is exactly what the
 * engine computed. Values are exact (rationals, radicals, π) and a decimal approximation is
 * added at the end. Verification re-evaluates the original input with an independent
 * floating-point evaluator.
 */
import { MathError } from "../core/errors";
import { Rational, bigLcm } from "../core/rational";
import { convertCall } from "../parse/convert";
import { syntaxToLatex } from "../parse/print-syntax";
import type { SNode } from "../parse/syntax";
import { evalComplex, approxEqual, gammaFn } from "../expr/evaluate";
import { toLatex } from "../expr/print";
import { add, div, fn, mul, neg, num, pow, sub, PI, E, frac } from "../expr/simplify";
import { type Expr } from "../expr/types";
import { makeSolution, REFERENCES } from "../steps/builder";
import { exactAnswer, formatNumber, aggregateVerification, rationalLatex } from "../steps/format";
import type { Answer, Solution, Step, VerificationCheck } from "../steps/types";

type ANode =
  | { k: "val"; value: Expr; latex: string }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "^"; left: ANode; right: ANode; implicit?: boolean }
  | { k: "neg"; arg: ANode }
  | { k: "group"; arg: ANode }
  | { k: "call"; name: string; args: ANode[] }
  | { k: "postfix"; op: "!" | "%" | "°"; arg: ANode }
  | { k: "abs"; arg: ANode };

const HIGHLIGHT = (s: string) => `{\\color{#0284c7}${s}}`;

/** True if the syntax tree contains only numbers, constants and operations (no variables). */
export function isArithmetic(n: SNode): boolean {
  switch (n.k) {
    case "num":
      return true;
    case "sym":
      return n.name === "pi" || n.name === "e";
    case "neg":
    case "group":
    case "abs":
    case "postfix":
      return isArithmetic(n.arg);
    case "bin":
      return isArithmetic(n.left) && isArithmetic(n.right);
    case "call":
      return !["solve", "diff", "integrate", "limit"].includes(n.name) && n.args.every(isArithmetic);
    default:
      return false;
  }
}

function fromSyntax(n: SNode): ANode {
  switch (n.k) {
    case "num":
      return { k: "val", value: num(n.value), latex: syntaxToLatex(n) };
    case "sym":
      return { k: "val", value: n.name === "pi" ? PI : E, latex: n.name === "pi" ? "\\pi" : "e" };
    case "neg":
      return { k: "neg", arg: fromSyntax(n.arg) };
    case "group":
      return { k: "group", arg: fromSyntax(n.arg) };
    case "abs":
      return { k: "abs", arg: fromSyntax(n.arg) };
    case "postfix":
      return { k: "postfix", op: n.op, arg: fromSyntax(n.arg) };
    case "bin":
      return { k: "bin", op: n.op, left: fromSyntax(n.left), right: fromSyntax(n.right), implicit: n.implicit };
    case "call":
      return { k: "call", name: n.name, args: n.args.map(fromSyntax) };
    default:
      throw new MathError("unsupported", "Bukan soal aritmetika.", { module: "arithmetic" });
  }
}

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 4 };

function nodePrec(n: ANode): number {
  if (n.k === "bin") return PREC[n.op];
  if (n.k === "neg") return 2;
  if (n.k === "val") {
    const v = n.value;
    if (v.type === "num" && v.value.isNegative()) return 2;
    if (v.type === "add") return 1;
    if (v.type === "mul") return 2;
  }
  return 5;
}

function wrap(s: string, cond: boolean) {
  return cond ? `\\left(${s}\\right)` : s;
}

function toLatexA(n: ANode, target: ANode | null): string {
  const rec = (m: ANode) => toLatexA(m, target);
  let s: string;
  switch (n.k) {
    case "val":
      s = n.latex;
      break;
    case "neg":
      s = `-${wrap(rec(n.arg), nodePrec(n.arg) <= 2 && !(n.arg.k === "val" && n.arg.value.type === "num" && !n.arg.value.value.isNegative()))}`;
      break;
    case "group":
      s = `\\left(${rec(n.arg)}\\right)`;
      break;
    case "abs":
      s = `\\left|${rec(n.arg)}\\right|`;
      break;
    case "postfix": {
      const a = wrap(rec(n.arg), nodePrec(n.arg) < 5);
      s = n.op === "!" ? `${a}!` : n.op === "%" ? `${a}\\%` : `${a}^{\\circ}`;
      break;
    }
    case "call": {
      const args = n.args.map(rec);
      if (n.name === "sqrt") s = `\\sqrt{${args[0]}}`;
      else if (n.name === "root" || n.name === "nthroot") s = `\\sqrt[${args[1]}]{${args[0]}}`;
      else if (n.name === "cbrt") s = `\\sqrt[3]{${args[0]}}`;
      else if (n.name === "log" && args.length > 1) s = `\\log_{${args[1]}}\\left(${args[0]}\\right)`;
      else if (n.name === "binomial") s = `\\binom{${args[0]}}{${args[1]}}`;
      else {
        const names: Record<string, string> = { sin: "\\sin", cos: "\\cos", tan: "\\tan", ln: "\\ln", log: "\\log", gcd: "\\operatorname{FPB}", lcm: "\\operatorname{KPK}", exp: "\\exp", asin: "\\arcsin", acos: "\\arccos", atan: "\\arctan" };
        s = `${names[n.name] ?? `\\operatorname{${n.name}}`}\\left(${args.join(", ")}\\right)`;
      }
      break;
    }
    case "bin": {
      const p = PREC[n.op];
      if (n.op === "^") {
        const base = rec(n.left);
        const needParen = n.left.k === "bin" || n.left.k === "neg" || (n.left.k === "val" && nodePrec(n.left) < 5) || (n.left.k === "val" && n.left.value.type === "num" && !n.left.value.value.isInteger());
        s = `${wrap(base, needParen)}^{${rec(n.right)}}`;
      } else {
        const l = wrap(rec(n.left), nodePrec(n.left) < p);
        const rightIsNegVal = n.right.k === "val" && n.right.value.type === "num" && n.right.value.value.isNegative();
        const r = wrap(rec(n.right), nodePrec(n.right) < p || (nodePrec(n.right) === p && (n.op === "-" || n.op === "/")) || n.right.k === "neg" || rightIsNegVal);
        const sym = n.op === "+" ? "+" : n.op === "-" ? "-" : n.op === "*" ? (n.implicit && !(/\d$/.test(l) && /^\d/.test(r)) ? "" : "\\times") : "\\div";
        s = sym ? `${l} ${sym} ${r}` : `${l} ${r}`;
      }
      break;
    }
  }
  return n === target ? HIGHLIGHT(s) : s;
}

interface Candidate {
  node: ANode;
  parent: ANode | null;
  depth: number; // parentheses depth
  rank: number;
  order: number;
}

function collectCandidates(n: ANode, parent: ANode | null, depth: number, out: Candidate[], counter: { i: number }): void {
  const isVal = (m: ANode) => m.k === "val";
  const push = (rank: number) => out.push({ node: n, parent, depth, rank, order: counter.i++ });
  switch (n.k) {
    case "val":
      return;
    case "group":
      collectCandidates(n.arg, n, depth + 1, out, counter);
      if (isVal(n.arg)) push(9);
      return;
    case "neg":
      collectCandidates(n.arg, n, depth, out, counter);
      if (isVal(n.arg)) push(8);
      return;
    case "abs":
      collectCandidates(n.arg, n, depth + 1, out, counter);
      if (isVal(n.arg)) push(6);
      return;
    case "postfix":
      collectCandidates(n.arg, n, depth, out, counter);
      if (isVal(n.arg)) push(6);
      return;
    case "call":
      n.args.forEach((a) => collectCandidates(a, n, depth + 1, out, counter));
      if (n.args.every(isVal)) push(6);
      return;
    case "bin":
      collectCandidates(n.left, n, depth, out, counter);
      collectCandidates(n.right, n, depth, out, counter);
      if (isVal(n.left) && isVal(n.right)) push(n.op === "^" ? 5 : n.op === "*" || n.op === "/" ? 3 : 2);
      return;
  }
}

function replaceNode(root: ANode, target: ANode, replacement: ANode): ANode {
  if (root === target) return replacement;
  switch (root.k) {
    case "val":
      return root;
    case "neg":
    case "group":
    case "abs":
    case "postfix":
      return { ...root, arg: replaceNode(root.arg, target, replacement) } as ANode;
    case "call":
      return { ...root, args: root.args.map((a) => replaceNode(a, target, replacement)) };
    case "bin":
      return { ...root, left: replaceNode(root.left, target, replacement), right: replaceNode(root.right, target, replacement) };
  }
}

function valLatex(e: Expr): string {
  return toLatex(e);
}

function describeFractionAddition(a: Rational, b: Rational, op: "+" | "-"): Step[] | undefined {
  if (a.isInteger() && b.isInteger()) return undefined;
  const l = bigLcm(a.den, b.den);
  const an = a.num * (l / a.den);
  const bn = b.num * (l / b.den);
  const resNum = op === "+" ? an + bn : an - bn;
  const res = Rational.of(resNum, l);
  const steps: Step[] = [
    {
      title: `Samakan penyebut menjadi KPK(${a.den}, ${b.den}) = ${l}`,
      after: `\\frac{${an}}{${l}} ${op} ${bn < 0n ? `\\left(\\frac{${bn}}{${l}}\\right)` : `\\frac{${bn}}{${l}}`}`,
      operation: "common-denominator",
      rule: { id: "fraction-add", name: "Penjumlahan pecahan", formula: "\\frac{a}{b} \\pm \\frac{c}{d} = \\frac{ad \\pm bc}{bd}" },
      reason: "Pecahan hanya dapat dijumlahkan/dikurangkan jika penyebutnya sama.",
    },
    {
      title: "Operasikan pembilangnya",
      after: `\\frac{${resNum}}{${l}}`,
      operation: "add-numerators",
      reason: `${an} ${op} ${bn < 0n ? `(${bn})` : bn} = ${resNum}.`,
    },
  ];
  if (res.den !== l) {
    steps.push({
      title: "Sederhanakan pecahan",
      after: rationalLatex(res),
      operation: "reduce-fraction",
      rule: { id: "reduce", name: "Menyederhanakan pecahan dengan FPB" },
      reason: `Bagi pembilang dan penyebut dengan FPB(${resNum < 0n ? -resNum : resNum}, ${l}) = ${(resNum < 0n ? -resNum : resNum) === 0n ? l : l / res.den}.`,
    });
  }
  return steps;
}

function describeFractionProduct(a: Rational, b: Rational, op: "*" | "/"): Step[] | undefined {
  if (a.isInteger() && b.isInteger() && op === "*") return undefined;
  if (op === "/" && a.isInteger() && b.isInteger()) return undefined;
  const steps: Step[] = [];
  let bb = b;
  if (op === "/") {
    bb = b.inv();
    steps.push({
      title: "Ubah pembagian menjadi perkalian dengan kebalikan",
      after: `${rationalLatex(a)} \\times ${rationalLatex(bb)}`,
      operation: "reciprocal",
      rule: { id: "fraction-div", name: "Pembagian pecahan", formula: "\\frac{a}{b} \\div \\frac{c}{d} = \\frac{a}{b} \\times \\frac{d}{c}" },
      reason: "Membagi dengan suatu bilangan sama dengan mengalikan dengan kebalikannya.",
    });
  }
  const n = a.num * bb.num;
  const d = a.den * bb.den;
  steps.push({
    title: "Kalikan pembilang dengan pembilang, penyebut dengan penyebut",
    after: `\\frac{${n}}{${d}}`,
    operation: "multiply-fractions",
    rule: { id: "fraction-mul", name: "Perkalian pecahan", formula: "\\frac{a}{b} \\times \\frac{c}{d} = \\frac{ac}{bd}" },
    reason: "Perkalian pecahan dilakukan terpisah pada pembilang dan penyebut.",
  });
  const res = Rational.of(n, d);
  if (res.den !== (d < 0n ? -d : d) || res.num !== n) {
    steps.push({ title: "Sederhanakan pecahan", after: rationalLatex(res), operation: "reduce-fraction", reason: "Bagi pembilang dan penyebut dengan FPB-nya." });
  }
  return steps;
}

function evaluateNode(n: ANode): { value: Expr; title: string; reason: string; rule?: Step["rule"]; substeps?: Step[] } {
  const v = (m: ANode) => (m as { value: Expr }).value;
  switch (n.k) {
    case "group":
      return { value: v(n.arg), title: "Hapus tanda kurung", reason: "Isi tanda kurung sudah berupa satu nilai." };
    case "neg":
      return { value: neg(v(n.arg)), title: "Terapkan tanda negatif", reason: "Tanda minus di depan membalik tanda nilai." };
    case "abs":
      return {
        value: fn("abs", v(n.arg)),
        title: "Hitung nilai mutlak",
        reason: "Nilai mutlak adalah jarak bilangan ke nol, selalu tak negatif.",
        rule: { id: "abs", name: "Nilai mutlak", formula: "|a| = a \\text{ jika } a \\ge 0,\\; -a \\text{ jika } a < 0" },
      };
    case "postfix": {
      const a = v(n.arg);
      if (n.op === "!") {
        return {
          value: fn("factorial", a),
          title: "Hitung faktorial",
          reason: "n! adalah hasil kali semua bilangan bulat positif dari 1 sampai n.",
          rule: { id: "factorial", name: "Faktorial", formula: "n! = 1 \\times 2 \\times \\cdots \\times n" },
        };
      }
      if (n.op === "%") return { value: mul(a, frac(1, 100)), title: "Ubah persen menjadi pecahan", reason: "p% berarti p/100.", rule: { id: "percent", name: "Persen", formula: "p\\% = \\frac{p}{100}" } };
      return { value: mul(a, div(PI, num(180))), title: "Ubah derajat ke radian", reason: "180° = π radian.", rule: { id: "deg-rad", name: "Konversi derajat–radian", formula: "\\theta_{\\text{rad}} = \\theta^{\\circ} \\cdot \\frac{\\pi}{180^{\\circ}}" } };
    }
    case "call": {
      const args = n.args.map(v);
      const value = convertCall(n.name === "log" && args.length === 1 ? "log10" : n.name, args, { k: "num", value: Rational.ONE, text: "", span: { start: 0, end: 0 } });
      const names: Record<string, string> = { sqrt: "akar kuadrat", cbrt: "akar pangkat tiga", root: "akar pangkat n", sin: "sinus", cos: "kosinus", tan: "tangen", ln: "logaritma natural", log: "logaritma", gcd: "FPB", lcm: "KPK", abs: "nilai mutlak", exp: "eksponensial" };
      return { value, title: `Hitung ${names[n.name] ?? n.name}`, reason: "Fungsi dievaluasi setelah argumennya menjadi satu nilai." };
    }
    case "bin": {
      const a = v(n.left);
      const b = v(n.right);
      const isRat = (e: Expr): e is Expr & { type: "num" } => e.type === "num";
      switch (n.op) {
        case "+":
          return {
            value: add(a, b),
            title: "Jumlahkan",
            reason: "Penjumlahan dan pengurangan dikerjakan terakhir, dari kiri ke kanan.",
            substeps: isRat(a) && isRat(b) ? describeFractionAddition(a.value, b.value, "+") : undefined,
          };
        case "-":
          return {
            value: sub(a, b),
            title: "Kurangkan",
            reason: "Penjumlahan dan pengurangan dikerjakan terakhir, dari kiri ke kanan.",
            substeps: isRat(a) && isRat(b) ? describeFractionAddition(a.value, b.value, "-") : undefined,
          };
        case "*":
          return {
            value: mul(a, b),
            title: "Kalikan",
            reason: "Perkalian dan pembagian dikerjakan sebelum penjumlahan dan pengurangan, dari kiri ke kanan.",
            substeps: isRat(a) && isRat(b) ? describeFractionProduct(a.value, b.value, "*") : undefined,
          };
        case "/":
          if (b.type === "num" && b.value.isZero()) {
            throw new MathError("division-by-zero", "Pembagian dengan nol tidak terdefinisi.", {
              module: "arithmetic",
              operation: "divide",
              cause: `Terjadi pembagian ${toLatex(a)} ÷ 0.`,
              hint: "Tidak ada bilangan yang jika dikalikan 0 menghasilkan bilangan bukan nol.",
            });
          }
          return {
            value: div(a, b),
            title: "Bagi",
            reason: "Perkalian dan pembagian dikerjakan sebelum penjumlahan dan pengurangan, dari kiri ke kanan.",
            substeps: isRat(a) && isRat(b) ? describeFractionProduct(a.value, b.value, "/") : undefined,
          };
        case "^":
          return {
            value: pow(a, b),
            title: "Hitung perpangkatan",
            reason: "Perpangkatan dikerjakan sebelum perkalian, pembagian, penjumlahan, dan pengurangan.",
            rule: { id: "power", name: "Perpangkatan", formula: "a^{n} = \\underbrace{a \\times a \\times \\cdots \\times a}_{n}" },
          };
      }
    }
  }
  throw new MathError("internal", "Node tidak dapat dievaluasi.", { module: "arithmetic" });
}

/** Independent floating-point evaluation of the syntax tree (verification path). */
export function floatEvalSyntax(n: SNode, env: Record<string, number> = {}): number {
  const r = (m: SNode) => floatEvalSyntax(m, env);
  switch (n.k) {
    case "num":
      return Number(n.text.startsWith(".") ? `0${n.text}` : n.text.endsWith(".") ? n.text.slice(0, -1) : n.text);
    case "sym":
      if (n.name in env) return env[n.name];
      return n.name === "pi" ? Math.PI : n.name === "e" ? Math.E : NaN;
    case "neg":
      return -r(n.arg);
    case "group":
      return r(n.arg);
    case "abs":
      return Math.abs(r(n.arg));
    case "postfix": {
      const a = r(n.arg);
      return n.op === "!" ? gammaFn(a + 1) : n.op === "%" ? a / 100 : (a * Math.PI) / 180;
    }
    case "bin": {
      const a = r(n.left);
      const b = r(n.right);
      switch (n.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "^":
          if (a < 0 && !Number.isInteger(b)) {
            // real odd roots: find denominator of b approximately
            const inv = 1 / b;
            if (Number.isInteger(Math.round(inv)) && Math.abs(inv - Math.round(inv)) < 1e-12 && Math.round(inv) % 2 !== 0) return -Math.pow(-a, b);
          }
          return Math.pow(a, b);
      }
      break;
    }
    case "call": {
      const a = n.args.map(r);
      const f: Record<string, (...x: number[]) => number> = {
        sqrt: Math.sqrt, cbrt: Math.cbrt, root: (x, k) => (x < 0 && k % 2 === 1 ? -Math.pow(-x, 1 / k) : Math.pow(x, 1 / k)),
        nthroot: (x, k) => (x < 0 && k % 2 === 1 ? -Math.pow(-x, 1 / k) : Math.pow(x, 1 / k)),
        sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
        sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log,
        log: (x, b = 10) => Math.log(x) / Math.log(b), log10: Math.log10, log2: Math.log2, abs: Math.abs,
        floor: Math.floor, ceil: Math.ceil, factorial: (x) => gammaFn(x + 1), min: Math.min, max: Math.max,
        cot: (x) => 1 / Math.tan(x), sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x),
        gcd: (x, y) => { let p = Math.abs(x), q = Math.abs(y); while (q) [p, q] = [q, p % q]; return p; },
        lcm: (x, y) => { let p = Math.abs(x), q = Math.abs(y); const pr = p * q; while (q) [p, q] = [q, p % q]; return pr / p; },
        mod: (x, y) => x - y * Math.floor(x / y),
        binomial: (x, y) => gammaFn(x + 1) / (gammaFn(y + 1) * gammaFn(x - y + 1)),
        nPr: (x, y) => gammaFn(x + 1) / gammaFn(x - y + 1),
        sign: Math.sign, round: (x) => Math.sign(x) * Math.round(Math.abs(x)),
      };
      return f[n.name] ? f[n.name](...a) : NaN;
    }
  }
  return NaN;
}

const MAX_STEPS = 150;

export function solveArithmetic(input: string, node: SNode, warnings: string[] = []): Solution {
  let tree = fromSyntax(node);
  const steps: Step[] = [];
  const inputLatex = toLatexA(tree, null);
  let silentFolds = 0;
  while (tree.k !== "val") {
    const cands: Candidate[] = [];
    collectCandidates(tree, null, 0, cands, { i: 0 });
    if (cands.length === 0) throw new MathError("internal", "Tidak ada operasi yang dapat dievaluasi.", { module: "arithmetic" });
    cands.sort((x, y) => y.depth - x.depth || y.rank - x.rank || x.order - y.order);
    // In a flat expression, * and / have priority over + and -, but among equal priority go left to right.
    const target = cands[0];
    const before = toLatexA(tree, target.node);
    const result = evaluateNode(target.node);
    const replacement: ANode = { k: "val", value: result.value, latex: valLatex(result.value) };
    // Silent simplifications: unwrap groups, fold unary minus of a number.
    const silent =
      target.node.k === "group" ||
      (target.node.k === "neg" && (target.node.arg as { value: Expr }).value.type === "num");
    tree = replaceNode(tree, target.node, replacement);
    if (silent) {
      silentFolds++;
      continue;
    }
    if (steps.length >= MAX_STEPS) continue;
    const orderNote = target.depth > 0 && target.node.k === "bin" ? "Operasi di dalam tanda kurung dikerjakan terlebih dahulu. " : "";
    steps.push({
      title: result.title,
      before,
      after: toLatexA(tree, replacement),
      operation: `evaluate-${target.node.k === "bin" ? target.node.op : target.node.k}`,
      rule: result.rule ?? { id: "order-of-operations", name: "Urutan operasi (KaBaTaKu)", formula: "\\text{Kurung} \\rightarrow \\text{Pangkat} \\rightarrow \\times,\\div \\rightarrow +,-" },
      reason: orderNote + result.reason,
      substeps: result.substeps,
    });
  }
  const value = tree.value;
  const answers: Answer[] = [exactAnswer(value, "Hasil")];
  if (value.type === "num" && !value.value.isInteger()) {
    const r = value.value;
    const rep = r.toRepeatingDecimal(40);
    if (rep) {
      const dec = rep.repeating ? `${rep.integer}.${rep.nonRepeating}\\overline{${rep.repeating}}` : `${rep.integer}.${rep.nonRepeating}`;
      answers.push({ label: "Bentuk desimal", latex: dec, text: rep.repeating ? `${rep.integer}.${rep.nonRepeating}(${rep.repeating})` : `${rep.integer}.${rep.nonRepeating}`, exact: true });
    }
    const { whole, rest } = r.mixed();
    if (whole !== 0n) {
      const restAbs = rest.abs();
      answers.push({ label: "Pecahan campuran", latex: `${whole}\\tfrac{${restAbs.num}}{${restAbs.den}}`, text: `${whole} ${restAbs.num}/${restAbs.den}`, exact: true });
    }
  }

  // Verification: independent floating-point evaluation of the original input.
  const checks: VerificationCheck[] = [];
  const independent = floatEvalSyntax(node);
  const exactNum = evalComplex(value);
  if (Number.isFinite(independent) && Number.isFinite(exactNum.re) && Math.abs(exactNum.im) < 1e-12) {
    const ok = approxEqual(independent, exactNum.re, 1e-9, 1e-12);
    checks.push({
      description: "Evaluasi ulang soal asli dengan aritmetika floating-point independen",
      latex: `${formatNumber(independent, 12)} \\approx ${formatNumber(exactNum.re, 12)}`,
      passed: ok,
      method: "Evaluasi numerik independen",
      detail: ok ? "Hasil eksak dan evaluasi numerik independen cocok (toleransi relatif 1e-9)." : "Hasil tidak cocok dengan evaluasi independen.",
    });
  } else if (Number.isNaN(independent) && Math.abs(exactNum.im) > 0) {
    checks.push({ description: "Hasil kompleks (evaluasi real independen tidak berlaku)", passed: true, method: "Pemeriksaan domain numerik", detail: "Soal menghasilkan bilangan kompleks." });
  }
  if (value.type === "num") {
    checks.push({ description: "Hasil berupa bilangan rasional eksak (tanpa pembulatan)", passed: true, method: "Aritmetika rasional eksak" });
  }

  return makeSolution({
    kind: "arithmetic",
    title: "Aritmetika",
    input,
    inputLatex,
    answers,
    method: {
      name: "Urutan operasi (KaBaTaKu)",
      description: "Kerjakan tanda kurung, lalu pangkat/akar, lalu perkalian/pembagian (kiri ke kanan), terakhir penjumlahan/pengurangan (kiri ke kanan). Semua perhitungan dilakukan secara eksak.",
    },
    steps: steps.length ? steps : [{ title: "Nilai sudah sederhana", after: toLatex(value), operation: "identity", reason: silentFolds ? "Hanya tanda kurung/tanda negatif yang perlu dirapikan." : "Input sudah berupa satu bilangan." }],
    verification: aggregateVerification(checks),
    module: "arithmetic",
    notes: [...warnings, ...(steps.length >= MAX_STEPS ? [`Hanya ${MAX_STEPS} langkah pertama yang ditampilkan.`] : [])],
    references: [REFERENCES.openstaxPrealgebra],
  });
}
