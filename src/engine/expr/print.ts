/**
 * Printers for canonical expressions: LaTeX (for KaTeX rendering) and plain text
 * (re-parseable ASCII). Display ordering differs from canonical ordering: polynomial
 * terms are shown by descending degree and constants last.
 */
import { Rational } from "../core/rational";
import { rawMul, rawNum, rawPow, freeSymbols, exprKey, type Expr } from "./types";

export interface PrintOptions {
  /** Custom LaTeX for symbols, e.g. { E_k: "E_k" }. */
  symbolLatex?: Record<string, string>;
  /** Variable used to order polynomial terms (defaults to automatic). */
  mainVariable?: string;
}

const GREEK = new Set([
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu", "xi",
  "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega", "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi",
  "Sigma", "Phi", "Psi", "Omega",
]);

export function symbolToLatex(name: string, options: PrintOptions = {}): string {
  const custom = options.symbolLatex?.[name];
  if (custom) return custom;
  if (name === "pi") return "\\pi";
  if (name === "inf") return "\\infty";
  const [base, ...subs] = name.split("_");
  let b: string;
  if (GREEK.has(base)) b = `\\${base}`;
  else if (base.length === 1) b = base;
  else b = `\\mathrm{${base}}`;
  if (subs.length) {
    const s = subs.join("_");
    return `${b}_{${GREEK.has(s) ? `\\${s}` : /^[A-Za-z0-9]+$/.test(s) ? s : `\\mathrm{${s}}`}}`;
  }
  return b;
}

// ---------------------------------------------------------------------------
// Display ordering
// ---------------------------------------------------------------------------

function termDegree(t: Expr, main?: string): number {
  const deg = (f: Expr): number => {
    if (f.type === "sym") return freeSymbols(f).size > 0 && (!main || f.name === main) ? 1 : 0;
    if (f.type === "pow" && f.base.type === "sym" && f.exp.type === "num" && (!main || f.base.name === main) && freeSymbols(f.base).size) {
      return f.exp.value.toNumber();
    }
    return 0;
  };
  if (t.type === "mul") return t.factors.reduce((s, f) => s + deg(f), 0);
  return deg(t);
}

export function displayOrderTerms(terms: readonly Expr[], main?: string): Expr[] {
  return [...terms].sort((a, b) => {
    const ca = freeSymbols(a).size === 0;
    const cb = freeSymbols(b).size === 0;
    if (ca !== cb) return ca ? 1 : -1;
    const na = a.type === "num";
    const nb = b.type === "num";
    if (na !== nb) return na ? 1 : -1;
    const da = termDegree(a, main);
    const db = termDegree(b, main);
    if (da !== db) return db - da;
    const ka = displayKey(a);
    const kb = displayKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

function displayKey(e: Expr): string {
  // sort by first symbol name, ignoring coefficients
  if (e.type === "mul") return e.factors.filter((f) => f.type !== "num").map(displayKey).join("");
  if (e.type === "sym") return e.name;
  if (e.type === "pow") return displayKey(e.base);
  return exprKey(e);
}

function factorRank(f: Expr): number {
  if (f.type === "num") return 0;
  if (f.type === "pow" && f.base.type === "num") return 1; // numeric radicals, 2^x
  if (f.type === "sym" && (f.name === "pi" || f.name === "e")) return 2;
  if (f.type === "sym" && f.name === "i") return 9;
  if (f.type === "sym") return 3;
  if (f.type === "pow" && f.base.type === "sym" && f.base.name !== "e") return 3;
  if (f.type === "fn") return 5;
  if (f.type === "pow" && f.base.type === "sym" && f.base.name === "e") return 6;
  if (f.type === "pow") return 7;
  if (f.type === "add") return 8;
  return 4;
}

export function displayOrderFactors(factors: readonly Expr[]): Expr[] {
  return [...factors].sort((a, b) => {
    const ra = factorRank(a);
    const rb = factorRank(b);
    if (ra !== rb) return ra - rb;
    const ka = displayKey(a);
    const kb = displayKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// Sign helpers
// ---------------------------------------------------------------------------

export function isNegativeTerm(t: Expr): boolean {
  if (t.type === "num") return t.value.isNegative();
  if (t.type === "mul" && t.factors[0].type === "num") return t.factors[0].value.isNegative();
  return false;
}

export function negateTerm(t: Expr): Expr {
  if (t.type === "num") return rawNum(t.value.neg());
  if (t.type === "mul" && t.factors[0].type === "num") {
    const c = t.factors[0].value.neg();
    const rest = t.factors.slice(1);
    if (c.isOne()) return rest.length === 1 ? rest[0] : rawMul(rest);
    return rawMul([rawNum(c), ...rest]);
  }
  return rawMul([rawNum(Rational.MINUS_ONE), t]);
}

/** Split a product into numerator and denominator factor lists (for fraction display). */
export function splitFraction(e: Expr): { sign: 1 | -1; coefNum: bigint; coefDen: bigint; numer: Expr[]; denom: Expr[] } {
  const factors = e.type === "mul" ? e.factors : [e];
  let coef = Rational.ONE;
  const numer: Expr[] = [];
  const denom: Expr[] = [];
  for (const f of factors) {
    if (f.type === "num") coef = coef.mul(f.value);
    else if (f.type === "pow" && f.exp.type === "num" && f.exp.value.isNegative()) {
      const pe = f.exp.value.neg();
      denom.push(pe.isOne() ? f.base : rawPow(f.base, rawNum(pe)));
    } else numer.push(f);
  }
  return {
    sign: coef.isNegative() ? -1 : 1,
    coefNum: coef.num < 0n ? -coef.num : coef.num,
    coefDen: coef.den,
    numer,
    denom,
  };
}

// ---------------------------------------------------------------------------
// LaTeX
// ---------------------------------------------------------------------------

const PREC = { add: 1, mul: 2, neg: 2, pow: 4, atom: 5 } as const;

const LATEX_FUNCTIONS: Record<string, string> = {
  sin: "\\sin", cos: "\\cos", tan: "\\tan", cot: "\\cot", sec: "\\sec", csc: "\\csc",
  asin: "\\arcsin", acos: "\\arccos", atan: "\\arctan", acot: "\\operatorname{arccot}",
  asec: "\\operatorname{arcsec}", acsc: "\\operatorname{arccsc}",
  sinh: "\\sinh", cosh: "\\cosh", tanh: "\\tanh", coth: "\\coth",
  sech: "\\operatorname{sech}", csch: "\\operatorname{csch}",
  asinh: "\\operatorname{arsinh}", acosh: "\\operatorname{arcosh}", atanh: "\\operatorname{artanh}",
  ln: "\\ln", sign: "\\operatorname{sgn}", gcd: "\\gcd", lcm: "\\operatorname{kpk}",
  min: "\\min", max: "\\max", gamma: "\\Gamma", mod: "\\operatorname{mod}", atan2: "\\operatorname{atan2}",
  re: "\\operatorname{Re}", im: "\\operatorname{Im}", arg: "\\arg", round: "\\operatorname{round}",
};
const POWERABLE = new Set(["sin", "cos", "tan", "cot", "sec", "csc", "sinh", "cosh", "tanh", "coth", "ln", "log"]);

function rationalLatex(r: Rational): string {
  if (r.isInteger()) return r.num.toString();
  const n = r.num < 0n ? -r.num : r.num;
  return `${r.isNegative() ? "-" : ""}\\frac{${n}}{${r.den}}`;
}

function wrap(s: string): string {
  return `\\left(${s}\\right)`;
}

export function toLatex(e: Expr, options: PrintOptions = {}): string {
  return latexPrec(e, 0, options);
}

function exprPrec(e: Expr): number {
  switch (e.type) {
    case "num":
      return e.value.isNegative() || !e.value.isInteger() ? PREC.mul : PREC.atom;
    case "sym":
      return PREC.atom;
    case "add":
      return PREC.add;
    case "mul":
      return isNegativeTerm(e) ? PREC.neg : PREC.mul;
    case "pow":
      if (e.exp.type === "num" && e.exp.value.isNegative()) return PREC.mul;
      if (e.exp.type === "num" && e.exp.value.num === 1n && !e.exp.value.isInteger()) return PREC.atom; // radicals
      return PREC.pow;
    case "fn":
      return PREC.atom;
  }
}

function latexPrec(e: Expr, parentPrec: number, o: PrintOptions): string {
  const s = latexRaw(e, o);
  return exprPrec(e) < parentPrec ? wrap(s) : s;
}

function latexRaw(e: Expr, o: PrintOptions): string {
  switch (e.type) {
    case "num":
      return rationalLatex(e.value);
    case "sym":
      return symbolToLatex(e.name, o);
    case "add": {
      const terms = displayOrderTerms(e.terms, o.mainVariable);
      let s = latexPrec(terms[0], PREC.add, o);
      for (const t of terms.slice(1)) {
        if (isNegativeTerm(t)) s += ` - ${latexPrec(negateTerm(t), PREC.mul, o)}`;
        else s += ` + ${latexPrec(t, PREC.add, o)}`;
      }
      return s;
    }
    case "mul":
      return latexProduct(e, o);
    case "pow":
      return latexPow(e.base, e.exp, o);
    case "fn":
      return latexFn(e.name, e.args, o);
  }
}

function latexProduct(e: Expr, o: PrintOptions): string {
  const { sign, coefNum, coefDen, numer, denom } = splitFraction(e);
  const numStr = latexFactorList(coefNum, numer, o, denom.length > 0 || coefDen !== 1n);
  const prefix = sign < 0 ? "-" : "";
  if (denom.length === 0 && coefDen === 1n) return prefix + numStr;
  const denStr = latexFactorList(coefDen, denom, o, true);
  return `${prefix}\\frac{${numStr}}{${denStr}}`;
}

function latexFactorList(coef: bigint, factors: Expr[], o: PrintOptions, inFraction: boolean): string {
  const parts: string[] = [];
  if (coef !== 1n || factors.length === 0) parts.push(coef.toString());
  const ordered = displayOrderFactors(factors);
  for (const f of ordered) {
    let s: string;
    if (f.type === "add") s = ordered.length === 1 && parts.length === 0 && inFraction ? latexRaw(f, o) : wrap(latexRaw(f, o));
    else s = latexPrec(f, PREC.mul + 0.5, o);
    parts.push(s);
  }
  let out = parts[0];
  for (let k = 1; k < parts.length; k++) {
    const prev = parts[k - 1];
    const cur = parts[k];
    const needDot = /[0-9}]$/.test(prev) && /^[0-9]/.test(cur);
    out += needDot ? ` \\cdot ${cur}` : ` ${cur}`;
  }
  return out;
}

function latexPow(base: Expr, exp: Expr, o: PrintOptions): string {
  if (exp.type === "num" && exp.value.isNegative()) return latexProduct(rawMul([rawPow(base, exp)]), o);
  if (exp.type === "num" && !exp.value.isInteger() && exp.value.num === 1n) {
    const inner = latexRaw(base, o);
    return exp.value.den === 2n ? `\\sqrt{${inner}}` : `\\sqrt[${exp.value.den}]{${inner}}`;
  }
  const expStr = latexRaw(exp, o);
  if (base.type === "fn" && POWERABLE.has(base.name) && exp.type === "num" && exp.value.isInteger() && exp.value.isPositive()) {
    const fnStr = latexFn(base.name, base.args, o);
    // insert the exponent after the function name: \sin^{2}\left(x\right)
    const m = /^(\\[a-z]+|\\operatorname\{[a-z]+\}|\\log_\{[^}]*\})(.*)$/.exec(fnStr);
    if (m) return `${m[1]}^{${expStr}}${m[2]}`;
  }
  let baseStr: string;
  if (base.type === "sym") baseStr = latexRaw(base, o);
  else if (base.type === "num" && base.value.isInteger() && !base.value.isNegative()) baseStr = latexRaw(base, o);
  else if (base.type === "fn" && (base.name === "abs" || base.name === "floor" || base.name === "ceil")) baseStr = latexRaw(base, o);
  else baseStr = wrap(latexRaw(base, o));
  return `${baseStr}^{${expStr}}`;
}

function latexFn(name: string, args: readonly Expr[], o: PrintOptions): string {
  const a = args.map((x) => latexRaw(x, o));
  switch (name) {
    case "abs":
      return `\\left|${a[0]}\\right|`;
    case "floor":
      return `\\left\\lfloor ${a[0]} \\right\\rfloor`;
    case "ceil":
      return `\\left\\lceil ${a[0]} \\right\\rceil`;
    case "factorial":
      return `${latexPrec(args[0], PREC.atom, o)}!`;
    case "binomial":
      return `\\binom{${a[0]}}{${a[1]}}`;
    case "conj":
      return `\\overline{${a[0]}}`;
    case "log": {
      const base = args[1];
      if (!base || (base.type === "num" && base.value.equals(Rational.of(10)))) return `\\log${wrap(a[0])}`;
      return `\\log_{${latexRaw(base, o)}}${wrap(a[0])}`;
    }
  }
  const cmd = LATEX_FUNCTIONS[name] ?? `\\operatorname{${name}}`;
  return `${cmd}${wrap(a.join(", "))}`;
}

// ---------------------------------------------------------------------------
// Plain text (re-parseable)
// ---------------------------------------------------------------------------

export function toText(e: Expr, options: PrintOptions = {}): string {
  return textPrec(e, 0, options);
}

function textPrec(e: Expr, parentPrec: number, o: PrintOptions): string {
  const s = textRaw(e, o);
  let p = exprPrec(e);
  if (e.type === "num" && !e.value.isInteger()) p = PREC.mul;
  if (e.type === "pow" && e.exp.type === "num" && e.exp.value.num === 1n && !e.exp.value.isInteger()) {
    p = e.exp.value.den === 2n ? PREC.atom : PREC.pow;
  }
  return p < parentPrec ? `(${s})` : s;
}

function textRaw(e: Expr, o: PrintOptions): string {
  switch (e.type) {
    case "num":
      return e.value.toString();
    case "sym":
      return e.name === "inf" ? "∞" : e.name;
    case "add": {
      const terms = displayOrderTerms(e.terms, o.mainVariable);
      let s = textPrec(terms[0], PREC.add, o);
      for (const t of terms.slice(1)) {
        if (isNegativeTerm(t)) s += ` - ${textPrec(negateTerm(t), PREC.mul + 0.5, o)}`;
        else s += ` + ${textPrec(t, PREC.add, o)}`;
      }
      return s;
    }
    case "mul": {
      const { sign, coefNum, coefDen, numer, denom } = splitFraction(e);
      const list = (coef: bigint, fs: Expr[]) => {
        const parts: string[] = [];
        if (coef !== 1n || fs.length === 0) parts.push(coef.toString());
        for (const f of displayOrderFactors(fs)) parts.push(textPrec(f, PREC.mul + 0.5, o));
        return parts.join("*");
      };
      const n = list(coefNum, numer);
      const prefix = sign < 0 ? "-" : "";
      if (denom.length === 0 && coefDen === 1n) return prefix + n;
      const d = list(coefDen, denom);
      const nWrapped = n;
      const dWrapped = denom.length + (coefDen !== 1n ? 1 : 0) > 1 || (denom.length === 1 && denom[0].type === "pow" && coefDen === 1n && !(denom[0].exp.type === "num" && denom[0].exp.value.den === 2n)) ? `(${d})` : d;
      return `${prefix}${nWrapped}/${dWrapped}`;
    }
    case "pow": {
      if (e.exp.type === "num" && e.exp.value.isNegative()) return textRaw(rawMul([e]), o);
      if (e.exp.type === "num" && e.exp.value.equals(Rational.HALF)) return `sqrt(${textRaw(e.base, o)})`;
      const b = textPrec(e.base, PREC.pow + 1, o);
      const x = e.exp.type === "num" && e.exp.value.isInteger() && !e.exp.value.isNegative() ? textRaw(e.exp, o) : `(${textRaw(e.exp, o)})`;
      return `${b}^${x}`;
    }
    case "fn": {
      const a = e.args.map((x) => textRaw(x, o));
      if (e.name === "factorial") return `${textPrec(e.args[0], PREC.atom, o)}!`;
      if (e.name === "log") {
        const base = e.args[1];
        if (!base || (base.type === "num" && base.value.equals(Rational.of(10)))) return `log(${a[0]})`;
        return `log_(${textRaw(base, o)})(${a[0]})`;
      }
      return `${e.name}(${a.join(", ")})`;
    }
  }
}
