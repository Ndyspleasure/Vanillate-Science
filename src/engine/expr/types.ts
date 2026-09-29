/**
 * Canonical expression tree ("structured representation").
 *
 * Expressions are immutable. Canonical (automatically simplified) expressions are only
 * produced by the smart constructors in `./simplify.ts`; the raw constructors here are for
 * internal use by those constructors and by the printer.
 *
 * Conventions:
 *  - subtraction a - b is add(a, mul(-1, b)); division a / b is mul(a, pow(b, -1));
 *  - sqrt(x) is pow(x, 1/2); exp(x) is pow(e, x);
 *  - reserved symbols: "pi" (π), "e" (Euler's number), "i" (imaginary unit).
 */
import { Rational } from "../core/rational";

export type Expr = Num | Sym | Add | Mul | Pow | Fn;

export interface Num {
  readonly type: "num";
  readonly value: Rational;
}
export interface Sym {
  readonly type: "sym";
  readonly name: string;
}
export interface Add {
  readonly type: "add";
  readonly terms: readonly Expr[];
}
export interface Mul {
  readonly type: "mul";
  readonly factors: readonly Expr[];
}
export interface Pow {
  readonly type: "pow";
  readonly base: Expr;
  readonly exp: Expr;
}
export interface Fn {
  readonly type: "fn";
  readonly name: string;
  readonly args: readonly Expr[];
}

export const CONSTANT_SYMBOLS = new Set(["pi", "e", "i"]);

export function isNum(e: Expr): e is Num {
  return e.type === "num";
}
export function isSym(e: Expr, name?: string): e is Sym {
  return e.type === "sym" && (name === undefined || e.name === name);
}
export function isAdd(e: Expr): e is Add {
  return e.type === "add";
}
export function isMul(e: Expr): e is Mul {
  return e.type === "mul";
}
export function isPow(e: Expr): e is Pow {
  return e.type === "pow";
}
export function isFn(e: Expr, name?: string): e is Fn {
  return e.type === "fn" && (name === undefined || e.name === name);
}

export function isZeroExpr(e: Expr): boolean {
  return e.type === "num" && e.value.isZero();
}
export function isOneExpr(e: Expr): boolean {
  return e.type === "num" && e.value.isOne();
}
export function isInteger(e: Expr): e is Num {
  return e.type === "num" && e.value.isInteger();
}

// ---------------------------------------------------------------------------
// Raw constructors (no simplification)
// ---------------------------------------------------------------------------

export function rawNum(v: Rational): Num {
  return { type: "num", value: v };
}
export function rawSym(name: string): Sym {
  return { type: "sym", name };
}
export function rawAdd(terms: readonly Expr[]): Add {
  return { type: "add", terms };
}
export function rawMul(factors: readonly Expr[]): Mul {
  return { type: "mul", factors };
}
export function rawPow(base: Expr, exp: Expr): Pow {
  return { type: "pow", base, exp };
}
export function rawFn(name: string, args: readonly Expr[]): Fn {
  return { type: "fn", name, args };
}

// ---------------------------------------------------------------------------
// Structural keys, equality and canonical ordering
// ---------------------------------------------------------------------------

const keyCache = new WeakMap<Expr, string>();

/** Stable structural serialization; equal keys <=> structurally equal expressions. */
export function exprKey(e: Expr): string {
  const cached = keyCache.get(e);
  if (cached !== undefined) return cached;
  let k: string;
  switch (e.type) {
    case "num":
      k = `n:${e.value.toString()}`;
      break;
    case "sym":
      k = `s:${e.name}`;
      break;
    case "add":
      k = `+(${e.terms.map(exprKey).join(",")})`;
      break;
    case "mul":
      k = `*(${e.factors.map(exprKey).join(",")})`;
      break;
    case "pow":
      k = `^(${exprKey(e.base)},${exprKey(e.exp)})`;
      break;
    case "fn":
      k = `f:${e.name}(${e.args.map(exprKey).join(",")})`;
      break;
  }
  keyCache.set(e, k);
  return k;
}

export function exprEquals(a: Expr, b: Expr): boolean {
  return a === b || exprKey(a) === exprKey(b);
}

const TYPE_RANK: Record<Expr["type"], number> = { num: 0, sym: 1, pow: 2, mul: 3, fn: 4, add: 5 };

/** Canonical total order used for sorting operands of add/mul. Numbers first. */
export function compareExpr(a: Expr, b: Expr): number {
  if (a === b) return 0;
  const ra = TYPE_RANK[a.type];
  const rb = TYPE_RANK[b.type];
  if (a.type === "num" && b.type === "num") return a.value.cmp(b.value);
  if (ra !== rb) return ra - rb;
  const ka = exprKey(a);
  const kb = exprKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Traversal helpers
// ---------------------------------------------------------------------------

export function children(e: Expr): readonly Expr[] {
  switch (e.type) {
    case "add":
      return e.terms;
    case "mul":
      return e.factors;
    case "pow":
      return [e.base, e.exp];
    case "fn":
      return e.args;
    default:
      return [];
  }
}

/** Free (non-constant) symbol names in an expression. */
export function freeSymbols(e: Expr, out = new Set<string>()): Set<string> {
  if (e.type === "sym") {
    if (!CONSTANT_SYMBOLS.has(e.name)) out.add(e.name);
  } else {
    for (const c of children(e)) freeSymbols(c, out);
  }
  return out;
}

export function containsSymbol(e: Expr, name: string): boolean {
  if (e.type === "sym") return e.name === name;
  for (const c of children(e)) if (containsSymbol(c, name)) return true;
  return false;
}

/** True if `e` contains the sub-expression `sub` (structural). */
export function containsExpr(e: Expr, sub: Expr): boolean {
  if (exprEquals(e, sub)) return true;
  for (const c of children(e)) if (containsExpr(c, sub)) return true;
  return false;
}

export function isConstantExpr(e: Expr): boolean {
  return freeSymbols(e).size === 0;
}

export function exprSize(e: Expr): number {
  let n = 1;
  for (const c of children(e)) n += exprSize(c);
  return n;
}

export function exprDepth(e: Expr): number {
  let d = 0;
  for (const c of children(e)) d = Math.max(d, exprDepth(c));
  return d + 1;
}

/** Count occurrences of symbol `name`. */
export function countSymbol(e: Expr, name: string): number {
  if (e.type === "sym") return e.name === name ? 1 : 0;
  let n = 0;
  for (const c of children(e)) n += countSymbol(c, name);
  return n;
}

export function hasFunction(e: Expr, pred: (f: Fn) => boolean): boolean {
  if (e.type === "fn" && pred(e)) return true;
  return children(e).some((c) => hasFunction(c, pred));
}
