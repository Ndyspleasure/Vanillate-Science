/**
 * Conversion from the syntax tree (SNode) to canonical expressions (Expr).
 */
import { invalidInput, MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { add, div, fn, frac, HALF, I, mul, neg, num, pow, sub, PI, E, KNOWN_FUNCTIONS } from "../expr/simplify";
import { rawSym, type Expr } from "../expr/types";
import type { SNode } from "./syntax";

export interface ConvertOptions {
  /** Allow the symbol "inf" (only meaningful for limit targets / integral bounds). */
  allowInfinity?: boolean;
}

export const INFINITY_SYMBOL = "inf";

export function toExpr(node: SNode, options: ConvertOptions = {}): Expr {
  const rec = (n: SNode) => toExpr(n, options);
  switch (node.k) {
    case "num":
      return num(node.value);
    case "sym":
      if (node.name === "pi") return PI;
      if (node.name === "e") return E;
      if (node.name === "i") return I;
      if (node.name === "inf") {
        if (!options.allowInfinity) {
          throw invalidInput("Simbol tak hingga (∞) hanya dapat digunakan pada limit atau batas integral.", {
            module: "convert",
            span: node.span,
          });
        }
        return rawSym(INFINITY_SYMBOL);
      }
      return rawSym(node.name);
    case "neg":
      return neg(rec(node.arg));
    case "group":
      return rec(node.arg);
    case "bin": {
      const l = rec(node.left);
      const r = rec(node.right);
      switch (node.op) {
        case "+":
          return add(l, r);
        case "-":
          return sub(l, r);
        case "*":
          return mul(l, r);
        case "/":
          if (r.type === "num" && r.value.isZero()) {
            throw new MathError("division-by-zero", "Pembagian dengan nol tidak terdefinisi.", {
              module: "convert",
              span: node.right.span,
              cause: "Penyebut bernilai 0.",
            });
          }
          return div(l, r);
        case "^":
          return pow(l, r);
      }
      break;
    }
    case "postfix": {
      const a = rec(node.arg);
      if (node.op === "!") return fn("factorial", a);
      if (node.op === "%") return mul(a, frac(1, 100));
      return mul(a, div(PI, num(180)));
    }
    case "abs":
      return fn("abs", rec(node.arg));
    case "call":
      return convertCall(node.name, node.args.map(rec), node);
    case "rel":
      throw invalidInput("Relasi (=, <, >) tidak dapat digunakan sebagai ekspresi di sini.", { module: "convert", span: node.span });
    case "list":
      throw invalidInput("Daftar/matriks tidak dapat digunakan sebagai ekspresi skalar di sini.", { module: "convert", span: node.span });
    case "deriv":
    case "integral":
    case "limit":
      throw invalidInput("Operator kalkulus bersarang belum didukung di dalam ekspresi lain.", {
        module: "convert",
        span: node.span,
        hint: "Tuliskan turunan/integral/limit sebagai soal tersendiri.",
      });
  }
  throw new MathError("internal", "Node sintaks tidak dikenal.", { module: "convert" });
}

export function convertCall(name: string, args: Expr[], node: SNode): Expr {
  const arity = (min: number, max = min) => {
    if (args.length < min || args.length > max) {
      throw invalidInput(`Fungsi ${name} menerima ${min === max ? min : `${min}–${max}`} argumen, tetapi diberikan ${args.length}.`, {
        module: "convert",
        span: node.span,
      });
    }
  };
  switch (name) {
    case "sqrt":
      arity(1);
      return pow(args[0], HALF);
    case "cbrt":
      arity(1);
      return pow(args[0], frac(1, 3));
    case "root":
    case "nthroot": {
      arity(2);
      const n = args[1];
      if (n.type === "num" && n.value.isZero()) throw invalidInput("Indeks akar tidak boleh 0.", { module: "convert", span: node.span });
      return pow(args[0], div(num(1), n));
    }
    case "exp":
      arity(1);
      return pow(E, args[0]);
    case "log10":
      arity(1);
      return fn("log", args[0], num(10));
    case "log2":
      arity(1);
      return fn("log", args[0], num(2));
    case "log":
      arity(1, 2);
      return fn("log", args[0], args[1] ?? num(10));
    case "nPr":
    case "perm":
      arity(2);
      return div(fn("factorial", args[0]), fn("factorial", sub(args[0], args[1])));
    default:
      if (!(name in KNOWN_FUNCTIONS)) {
        throw invalidInput(`Fungsi '${name}' tidak dapat digunakan di dalam ekspresi.`, {
          module: "convert",
          span: node.span,
          hint: "Perintah seperti det(), solve(), diff() harus ditulis sebagai soal tersendiri.",
        });
      }
      return fn(name, ...args);
  }
}

export function isInfinity(e: Expr): -1 | 1 | 0 {
  if (e.type === "sym" && e.name === INFINITY_SYMBOL) return 1;
  if (e.type === "mul" && e.factors.length === 2 && e.factors[0].type === "num" && e.factors[0].value.isNegative() && e.factors[1].type === "sym" && e.factors[1].name === INFINITY_SYMBOL) return -1;
  return 0;
}

export { Rational };
