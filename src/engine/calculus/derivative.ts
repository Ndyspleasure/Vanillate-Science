/**
 * Symbolic differentiation with a step tree that mirrors the rules actually applied.
 *
 * Rules: constant, identity, sum, constant multiple, power, product, quotient, chain,
 * exponential, logarithmic, trigonometric, inverse trigonometric, hyperbolic, absolute
 * value, and logarithmic differentiation for u^v.
 * Reference: OpenStax Calculus Volume 1, chapter "Derivatives".
 */
import { tick } from "../core/budget";
import { MathError } from "../core/errors";
import { together, expand } from "../expr/expand";
import { toLatex } from "../expr/print";
import {
  add,
  div,
  fn,
  mul,
  neg,
  num,
  pow,
  sub,
  ONE,
  ZERO,
  E,
  HALF,
  MINUS_ONE,
} from "../expr/simplify";
import { containsSymbol, exprSize, rawSym, type Expr } from "../expr/types";
import type { Step } from "../steps/types";

export interface DiffResult {
  value: Expr;
  step: Step;
}

const dd = (x: string) => `\\frac{d}{d${toLatex(rawSym(x))}}`;
const dOf = (x: string, e: Expr) => `${dd(x)}\\left[${toLatex(e)}\\right]`;

function leaf(
  e: Expr,
  x: string,
  value: Expr,
  title: string,
  rule: Step["rule"],
  reason: string,
): DiffResult {
  return {
    value,
    step: {
      title,
      before: dOf(x, e),
      after: toLatex(value),
      operation: `diff-${rule?.id ?? "leaf"}`,
      rule,
      reason,
    },
  };
}

/** Split a product into x-free coefficient and x-dependent factors. */
function splitConstant(e: Expr, x: string): { c: Expr; rest: Expr[] } {
  const fs = e.type === "mul" ? e.factors : [e];
  const c = fs.filter((f) => !containsSymbol(f, x));
  const rest = fs.filter((f) => containsSymbol(f, x));
  return { c: c.length ? mul(...c) : ONE, rest };
}

function isDenominatorFactor(f: Expr): boolean {
  return f.type === "pow" && f.exp.type === "num" && f.exp.value.isNegative();
}

export function differentiate(e: Expr, x: string, depth = 0): DiffResult {
  tick("differentiate");
  if (depth > 60)
    throw new MathError("limit-exceeded", "Ekspresi terlalu dalam untuk diturunkan.", {
      module: "derivative",
    });
  if (!containsSymbol(e, x)) {
    return leaf(
      e,
      x,
      ZERO,
      "Turunan konstanta",
      { id: "constant", name: "Aturan konstanta", formula: "\\frac{d}{dx}c = 0" },
      `${toLatex(e)} tidak bergantung pada ${x}.`,
    );
  }
  if (e.type === "sym") {
    return leaf(
      e,
      x,
      ONE,
      "Turunan variabel",
      { id: "identity", name: "Turunan x", formula: "\\frac{d}{dx}x = 1" },
      `Turunan ${x} terhadap dirinya sendiri adalah 1.`,
    );
  }
  switch (e.type) {
    case "add": {
      const parts = e.terms.map((t) => differentiate(t, x, depth + 1));
      const value = add(...parts.map((p) => p.value));
      return {
        value,
        step: {
          title: "Aturan jumlah",
          before: dOf(x, e),
          after: `${e.terms.map((t) => dOf(x, t)).join(" + ")} = ${toLatex(value)}`,
          operation: "diff-sum",
          rule: { id: "sum", name: "Aturan jumlah/selisih", formula: "(f \\pm g)' = f' \\pm g'" },
          reason: "Turunan dari jumlah adalah jumlah turunan masing-masing suku.",
          substeps: parts.map((p) => p.step),
        },
      };
    }
    case "mul": {
      const { c, rest } = splitConstant(e, x);
      if (!(c.type === "num" && c.value.isOne())) {
        const inner = rest.length === 1 ? rest[0] : mul(...rest);
        const d = differentiate(inner, x, depth + 1);
        const value = mul(c, d.value);
        return {
          value,
          step: {
            title: "Aturan kelipatan konstanta",
            before: dOf(x, e),
            after: `${toLatex(c)} \\cdot ${dOf(x, inner)} = ${toLatex(value)}`,
            operation: "diff-constant-multiple",
            rule: {
              id: "constant-multiple",
              name: "Aturan kelipatan konstanta",
              formula: "(c f)' = c f'",
            },
            reason: `Konstanta $${toLatex(c)}$ dapat dikeluarkan dari turunan.`,
            substeps: [d.step],
          },
        };
      }
      const numer = rest.filter((f) => !isDenominatorFactor(f));
      const denomFactors = rest.filter(isDenominatorFactor);
      if (denomFactors.length && numer.length) {
        const f = numer.length === 1 ? numer[0] : mul(...numer);
        const g = mul(
          ...denomFactors.map((d) =>
            pow(
              (d as { base: Expr }).base,
              num((d as { exp: { value: import("../core/rational").Rational } }).exp.value.neg()),
            ),
          ),
        );
        const df = differentiate(f, x, depth + 1);
        const dg = differentiate(g, x, depth + 1);
        const value = div(sub(mul(df.value, g), mul(f, dg.value)), pow(g, num(2)));
        return {
          value,
          step: {
            title: "Aturan hasil bagi",
            before: dOf(x, e),
            after: `\\frac{${toLatex(df.value)} \\cdot ${wrapLatex(g)} - ${wrapLatex(f)} \\cdot ${wrapLatex(dg.value)}}{${wrapLatex(g)}^{2}} = ${toLatex(value)}`,
            operation: "diff-quotient",
            rule: {
              id: "quotient",
              name: "Aturan hasil bagi",
              formula: "\\left(\\frac{f}{g}\\right)' = \\frac{f'g - fg'}{g^2}",
              conditions: "g(x) ≠ 0",
            },
            reason: `Ekspresi berbentuk pecahan f/g dengan f = $${toLatex(f)}$ dan g = $${toLatex(g)}$.`,
            substeps: [df.step, dg.step],
          },
        };
      }
      // product rule f * g
      const f = rest[0];
      const g = rest.length === 2 ? rest[1] : mul(...rest.slice(1));
      const df = differentiate(f, x, depth + 1);
      const dg = differentiate(g, x, depth + 1);
      const value = add(mul(df.value, g), mul(f, dg.value));
      return {
        value,
        step: {
          title: "Aturan perkalian",
          before: dOf(x, e),
          after: `${wrapLatex(df.value)} \\cdot ${wrapLatex(g)} + ${wrapLatex(f)} \\cdot ${wrapLatex(dg.value)} = ${toLatex(value)}`,
          operation: "diff-product",
          rule: { id: "product", name: "Aturan perkalian", formula: "(fg)' = f'g + fg'" },
          reason: `Ekspresi merupakan hasil kali f = $${toLatex(f)}$ dan g = $${toLatex(g)}$.`,
          substeps: [df.step, dg.step],
        },
      };
    }
    case "pow": {
      const baseHas = containsSymbol(e.base, x);
      const expHas = containsSymbol(e.exp, x);
      if (baseHas && !expHas) {
        const n = e.exp;
        const outer = mul(n, pow(e.base, sub(n, ONE)));
        if (e.base.type === "sym" && e.base.name === x) {
          return leaf(
            e,
            x,
            outer,
            "Aturan pangkat",
            { id: "power", name: "Aturan pangkat", formula: "\\frac{d}{dx}x^{n} = n x^{n-1}" },
            `Turunkan pangkat ${toLatex(n)} menjadi koefisien dan kurangi pangkat dengan 1.`,
          );
        }
        const du = differentiate(e.base, x, depth + 1);
        const value = mul(outer, du.value);
        const isSqrt = n.type === "num" && n.value.equals(HALF.value);
        return {
          value,
          step: {
            title: isSqrt ? "Aturan rantai (akar kuadrat)" : "Aturan rantai dengan aturan pangkat",
            before: dOf(x, e),
            after: `${toLatex(outer)} \\cdot ${dOf(x, e.base)} = ${toLatex(value)}`,
            operation: "diff-chain-power",
            rule: {
              id: "chain-power",
              name: "Aturan rantai",
              formula: "\\frac{d}{dx}u^{n} = n u^{n-1} \\cdot u'",
            },
            reason: `Fungsi luar adalah pangkat $${toLatex(n)}$, fungsi dalam u = $${toLatex(e.base)}$.`,
            substeps: [du.step],
          },
        };
      }
      if (!baseHas && expHas) {
        const isE = e.base.type === "sym" && e.base.name === "e";
        const outer = isE ? e : mul(e, fn("ln", e.base));
        if (e.exp.type === "sym" && e.exp.name === x) {
          return leaf(
            e,
            x,
            outer,
            isE ? "Turunan fungsi eksponensial natural" : "Turunan fungsi eksponensial",
            {
              id: isE ? "exp" : "exp-base",
              name: isE ? "Turunan eˣ" : "Turunan aˣ",
              formula: isE ? "\\frac{d}{dx}e^{x} = e^{x}" : "\\frac{d}{dx}a^{x} = a^{x}\\ln a",
            },
            isE
              ? "eˣ adalah fungsi yang turunannya sama dengan dirinya sendiri."
              : "Turunan aˣ adalah aˣ dikali ln a.",
          );
        }
        const du = differentiate(e.exp, x, depth + 1);
        const value = mul(outer, du.value);
        return {
          value,
          step: {
            title: "Aturan rantai (eksponensial)",
            before: dOf(x, e),
            after: `${toLatex(outer)} \\cdot ${dOf(x, e.exp)} = ${toLatex(value)}`,
            operation: "diff-chain-exp",
            rule: {
              id: "chain-exp",
              name: "Aturan rantai",
              formula: isE
                ? "\\frac{d}{dx}e^{u} = e^{u} u'"
                : "\\frac{d}{dx}a^{u} = a^{u}\\ln a \\cdot u'",
            },
            reason: `Fungsi dalam u = $${toLatex(e.exp)}$.`,
            substeps: [du.step],
          },
        };
      }
      // u^v: logarithmic differentiation
      const du = differentiate(e.base, x, depth + 1);
      const dv = differentiate(e.exp, x, depth + 1);
      const value = mul(e, add(mul(dv.value, fn("ln", e.base)), mul(e.exp, div(du.value, e.base))));
      return {
        value,
        step: {
          title: "Turunan logaritmik",
          before: dOf(x, e),
          after: `${toLatex(e)}\\left(${toLatex(dv.value)}\\ln\\left(${toLatex(e.base)}\\right) + ${wrapLatex(e.exp)}\\frac{${toLatex(du.value)}}{${toLatex(e.base)}}\\right) = ${toLatex(value)}`,
          operation: "diff-logarithmic",
          rule: {
            id: "log-diff",
            name: "Turunan logaritmik",
            formula: "\\frac{d}{dx}u^{v} = u^{v}\\left(v'\\ln u + v\\frac{u'}{u}\\right)",
            conditions: "u > 0",
          },
          reason:
            "Basis dan eksponen sama-sama bergantung pada x; ambil ln kedua ruas y = u^v lalu turunkan.",
          assumptions: [`${toLatex(e.base)} > 0`],
          substeps: [du.step, dv.step],
        },
      };
    }
    case "fn":
      return diffFunction(e, x, depth);
    default:
      throw new MathError("internal", "Jenis ekspresi tidak dikenal untuk turunan.", {
        module: "derivative",
      });
  }
}

function wrapLatex(e: Expr): string {
  return e.type === "add" ? `\\left(${toLatex(e)}\\right)` : toLatex(e);
}

const FN_RULES: Record<
  string,
  { outer: (u: Expr) => Expr; formula: string; name: string; conditions?: string }
> = {
  sin: {
    outer: (u) => fn("cos", u),
    formula: "\\frac{d}{dx}\\sin u = \\cos u \\cdot u'",
    name: "Turunan sinus",
  },
  cos: {
    outer: (u) => neg(fn("sin", u)),
    formula: "\\frac{d}{dx}\\cos u = -\\sin u \\cdot u'",
    name: "Turunan kosinus",
  },
  tan: {
    outer: (u) => pow(fn("sec", u), num(2)),
    formula: "\\frac{d}{dx}\\tan u = \\sec^2 u \\cdot u'",
    name: "Turunan tangen",
  },
  cot: {
    outer: (u) => neg(pow(fn("csc", u), num(2))),
    formula: "\\frac{d}{dx}\\cot u = -\\csc^2 u \\cdot u'",
    name: "Turunan kotangen",
  },
  sec: {
    outer: (u) => mul(fn("sec", u), fn("tan", u)),
    formula: "\\frac{d}{dx}\\sec u = \\sec u \\tan u \\cdot u'",
    name: "Turunan sekan",
  },
  csc: {
    outer: (u) => neg(mul(fn("csc", u), fn("cot", u))),
    formula: "\\frac{d}{dx}\\csc u = -\\csc u \\cot u \\cdot u'",
    name: "Turunan kosekan",
  },
  asin: {
    outer: (u) => pow(sub(ONE, pow(u, num(2))), num(-0.5)),
    formula: "\\frac{d}{dx}\\arcsin u = \\frac{u'}{\\sqrt{1 - u^2}}",
    name: "Turunan arcsin",
    conditions: "|u| < 1",
  },
  acos: {
    outer: (u) => neg(pow(sub(ONE, pow(u, num(2))), num(-0.5))),
    formula: "\\frac{d}{dx}\\arccos u = -\\frac{u'}{\\sqrt{1 - u^2}}",
    name: "Turunan arccos",
    conditions: "|u| < 1",
  },
  atan: {
    outer: (u) => pow(add(ONE, pow(u, num(2))), MINUS_ONE),
    formula: "\\frac{d}{dx}\\arctan u = \\frac{u'}{1 + u^2}",
    name: "Turunan arctan",
  },
  acot: {
    outer: (u) => neg(pow(add(ONE, pow(u, num(2))), MINUS_ONE)),
    formula: "\\frac{d}{dx}\\operatorname{arccot} u = -\\frac{u'}{1 + u^2}",
    name: "Turunan arccot",
  },
  sinh: {
    outer: (u) => fn("cosh", u),
    formula: "\\frac{d}{dx}\\sinh u = \\cosh u \\cdot u'",
    name: "Turunan sinh",
  },
  cosh: {
    outer: (u) => fn("sinh", u),
    formula: "\\frac{d}{dx}\\cosh u = \\sinh u \\cdot u'",
    name: "Turunan cosh",
  },
  tanh: {
    outer: (u) => pow(fn("sech", u), num(2)),
    formula: "\\frac{d}{dx}\\tanh u = \\operatorname{sech}^2 u \\cdot u'",
    name: "Turunan tanh",
  },
  asinh: {
    outer: (u) => pow(add(pow(u, num(2)), ONE), num(-0.5)),
    formula: "\\frac{d}{dx}\\operatorname{arsinh} u = \\frac{u'}{\\sqrt{u^2 + 1}}",
    name: "Turunan arsinh",
  },
  acosh: {
    outer: (u) => pow(sub(pow(u, num(2)), ONE), num(-0.5)),
    formula: "\\frac{d}{dx}\\operatorname{arcosh} u = \\frac{u'}{\\sqrt{u^2 - 1}}",
    name: "Turunan arcosh",
    conditions: "u > 1",
  },
  atanh: {
    outer: (u) => pow(sub(ONE, pow(u, num(2))), MINUS_ONE),
    formula: "\\frac{d}{dx}\\operatorname{artanh} u = \\frac{u'}{1 - u^2}",
    name: "Turunan artanh",
    conditions: "|u| < 1",
  },
  ln: {
    outer: (u) => pow(u, MINUS_ONE),
    formula: "\\frac{d}{dx}\\ln u = \\frac{u'}{u}",
    name: "Turunan logaritma natural",
    conditions: "u > 0",
  },
  abs: {
    outer: (u) => div(u, fn("abs", u)),
    formula: "\\frac{d}{dx}|u| = \\frac{u}{|u|} \\cdot u'",
    name: "Turunan nilai mutlak",
    conditions: "u ≠ 0",
  },
};

function diffFunction(e: Expr & { type: "fn" }, x: string, depth: number): DiffResult {
  let rule = FN_RULES[e.name];
  let u = e.args[0];
  if (e.name === "log") {
    const b = e.args[1];
    if (containsSymbol(b, x)) {
      // log_b(u) = ln u / ln b
      return differentiate(div(fn("ln", u), fn("ln", b)), x, depth + 1);
    }
    rule = {
      outer: (v) => pow(mul(v, fn("ln", b)), MINUS_ONE),
      formula: "\\frac{d}{dx}\\log_b u = \\frac{u'}{u \\ln b}",
      name: "Turunan logaritma basis b",
      conditions: "u > 0",
    };
    u = e.args[0];
  }
  if (!rule) {
    throw new MathError("unsupported", `Turunan fungsi ${e.name} belum didukung.`, {
      module: "derivative",
      operation: e.name,
    });
  }
  const outer = rule.outer(u);
  const ruleRef = {
    id: `fn-${e.name}`,
    name: rule.name,
    formula: rule.formula,
    conditions: rule.conditions,
  };
  if (u.type === "sym" && u.name === x) {
    return leaf(
      e,
      x,
      outer,
      rule.name,
      ruleRef,
      `Gunakan rumus turunan ${e.name}.${rule.conditions ? ` Berlaku untuk ${rule.conditions.replace(/u/g, x)}.` : ""}`,
    );
  }
  const du = differentiate(u, x, depth + 1);
  const value = mul(outer, du.value);
  return {
    value,
    step: {
      title: `Aturan rantai: ${rule.name.toLowerCase()}`,
      before: dOf(x, e),
      after: `${wrapLatex(outer)} \\cdot ${dOf(x, u)} = ${toLatex(value)}`,
      operation: "diff-chain-fn",
      rule: ruleRef,
      reason: `Fungsi luar ${e.name}, fungsi dalam u = $${toLatex(u)}$. Kalikan turunan fungsi luar dengan turunan fungsi dalam.`,
      substeps: [du.step],
    },
  };
}

/** Choose the most compact equivalent presentation of a derivative. */
export function tidy(e: Expr): Expr {
  const candidates: Expr[] = [e];
  try {
    candidates.push(expand(e));
  } catch {
    // ignore
  }
  try {
    const { numer, denom } = together(e);
    const t = div(expand(numer), denom);
    candidates.push(t);
  } catch {
    // ignore
  }
  return candidates.reduce((best, c) => (exprSize(c) < exprSize(best) ? c : best));
}

export { E };
