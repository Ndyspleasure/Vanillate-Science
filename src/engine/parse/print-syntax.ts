/**
 * LaTeX rendering of the syntax tree, preserving the user's notation (input echo).
 */
import { symbolToLatex } from "../expr/print";
import type { SNode } from "./syntax";

const LATEX_FN: Record<string, string> = {
  sin: "\\sin", cos: "\\cos", tan: "\\tan", cot: "\\cot", sec: "\\sec", csc: "\\csc",
  asin: "\\arcsin", acos: "\\arccos", atan: "\\arctan", sinh: "\\sinh", cosh: "\\cosh", tanh: "\\tanh",
  ln: "\\ln", exp: "\\exp", det: "\\det", gcd: "\\operatorname{FPB}", lcm: "\\operatorname{KPK}",
  min: "\\min", max: "\\max",
};

const REL_LATEX: Record<string, string> = { "=": "=", "<": "<", ">": ">", "<=": "\\le", ">=": "\\ge", "!=": "\\ne" };

function prec(n: SNode): number {
  switch (n.k) {
    case "bin":
      return n.op === "+" || n.op === "-" ? 1 : n.op === "^" ? 4 : 2;
    case "neg":
      return 2;
    case "rel":
      return 0;
    default:
      return 5;
  }
}

function wrapIf(s: string, cond: boolean): string {
  return cond ? `\\left(${s}\\right)` : s;
}

export function syntaxToLatex(n: SNode, divStyle: "frac" | "div" = "frac"): string {
  const rec = (m: SNode) => syntaxToLatex(m, divStyle);
  switch (n.k) {
    case "num":
      return n.text.replace(/^\./, "0.").replace(/[eE]([+-]?\d+)$/, " \\times 10^{$1}");
    case "sym":
      return symbolToLatex(n.name);
    case "neg":
      return `-${wrapIf(rec(n.arg), prec(n.arg) <= 2 && n.arg.k !== "num")}`;
    case "group":
      return `\\left(${rec(n.arg)}\\right)`;
    case "bin": {
      const p = prec(n);
      if (n.op === "/" && divStyle === "frac") return `\\frac{${rec(n.left)}}{${rec(n.right)}}`;
      if (n.op === "^") {
        const base = rec(n.left);
        const needParen = !(n.left.k === "num" || n.left.k === "sym" || n.left.k === "group" || n.left.k === "call" || n.left.k === "abs");
        return `${wrapIf(base, needParen)}^{${rec(n.right)}}`;
      }
      const l = wrapIf(rec(n.left), prec(n.left) < p);
      const r = wrapIf(rec(n.right), prec(n.right) < p || (prec(n.right) === p && (n.op === "-" || n.op === "/")) || n.right.k === "neg");
      switch (n.op) {
        case "+":
          return `${l} + ${r}`;
        case "-":
          return `${l} - ${r}`;
        case "/":
          return `${l} \\div ${r}`;
        case "*":
          if (n.implicit) {
            const needTimes = /\d$/.test(l) && /^\d/.test(r);
            return needTimes ? `${l} \\cdot ${r}` : `${l} ${r}`;
          }
          return `${l} \\times ${r}`;
      }
      break;
    }
    case "call": {
      const args = n.args.map(rec);
      if (n.name === "sqrt") return `\\sqrt{${args[0]}}`;
      if (n.name === "root" || n.name === "nthroot") return `\\sqrt[${args[1]}]{${args[0]}}`;
      if (n.name === "cbrt") return `\\sqrt[3]{${args[0]}}`;
      if (n.name === "abs") return `\\left|${args[0]}\\right|`;
      if (n.name === "log") return args.length > 1 ? `\\log_{${args[1]}}\\left(${args[0]}\\right)` : `\\log\\left(${args[0]}\\right)`;
      if (n.name === "log10") return `\\log\\left(${args[0]}\\right)`;
      if (n.name === "log2") return `\\log_{2}\\left(${args[0]}\\right)`;
      if (n.name === "binomial") return `\\binom{${args[0]}}{${args[1]}}`;
      if (n.name === "factorial") return `${args[0]}!`;
      const cmd = LATEX_FN[n.name] ?? `\\operatorname{${n.name}}`;
      return `${cmd}\\left(${args.join(", ")}\\right)`;
    }
    case "postfix": {
      const a = wrapIf(rec(n.arg), prec(n.arg) < 5);
      if (n.op === "!") return `${a}!`;
      if (n.op === "%") return `${a}\\%`;
      return `${a}^{\\circ}`;
    }
    case "abs":
      return `\\left|${rec(n.arg)}\\right|`;
    case "rel": {
      let s = rec(n.operands[0]);
      n.ops.forEach((op, i) => {
        s += ` ${REL_LATEX[op]} ${rec(n.operands[i + 1])}`;
      });
      return s;
    }
    case "list": {
      const isMatrix = n.items.length > 0 && n.items.every((it) => it.k === "list");
      if (isMatrix) {
        const rows = n.items.map((r) => (r.k === "list" ? r.items.map(rec).join(" & ") : rec(r)));
        return `\\begin{pmatrix}${rows.join(" \\\\ ")}\\end{pmatrix}`;
      }
      const inner = n.items.map(rec).join(", ");
      return n.bracket === "(" ? `\\left(${inner}\\right)` : n.bracket === "{" ? `\\left\\{${inner}\\right\\}` : `\\left[${inner}\\right]`;
    }
    case "deriv": {
      const v = n.variable || "x";
      if (n.variable === "" ) return `\\left(${rec(n.expr)}\\right)${"'".repeat(n.order)}`;
      const d = n.order === 1 ? `\\frac{d}{d${v}}` : `\\frac{d^{${n.order}}}{d${v}^{${n.order}}}`;
      return `${d}\\left(${rec(n.expr)}\\right)`;
    }
    case "integral": {
      const v = n.variable || "x";
      const bounds = n.lower && n.upper ? `_{${rec(n.lower)}}^{${rec(n.upper)}}` : "";
      return `\\int${bounds} ${rec(n.expr)} \\, d${v}`;
    }
    case "limit": {
      const dir = n.direction ? `^{${n.direction}}` : "";
      return `\\lim_{${symbolToLatex(n.variable)} \\to ${rec(n.to)}${dir}} ${rec(n.expr)}`;
    }
  }
  return "";
}
