import { describe, expect, it } from "vitest";
import { parse } from "./parser";
import { toExpr } from "./convert";
import { toText } from "../expr/print";
import { MathError } from "../core/errors";

const t = (s: string) => toText(toExpr(parse(s).statements[0]));

function errorOf(s: string): MathError {
  try {
    parse(s);
  } catch (e) {
    if (e instanceof MathError) return e;
    throw e;
  }
  throw new Error("expected parse error");
}

describe("parser", () => {
  it("respects operator precedence", () => {
    expect(t("2 + 3 * 4")).toBe("14");
    expect(t("2^3^2")).toBe("512");
    expect(t("-2^2")).toBe("-4");
    expect(t("(-2)^2")).toBe("4");
    expect(t("2^-1")).toBe("1/2");
    expect(t("10 - 4 - 3")).toBe("3");
    expect(t("12 / 3 / 2")).toBe("2");
  });

  it("supports implicit multiplication", () => {
    expect(t("2x")).toBe("2*x");
    expect(t("2(3)")).toBe("6");
    expect(t("(1+1)(2+3)")).toBe("10");
    expect(t("xy")).toBe("x*y");
    expect(t("2 pi")).toBe("2*pi");
    expect(t("3sin(x)")).toBe("3*sin(x)");
  });

  it("warns about ambiguous division with implicit multiplication", () => {
    const r = parse("1/2x");
    expect(toText(toExpr(r.statements[0]))).toBe("x/2");
    expect(r.warnings.some((w) => w.includes("ditafsirkan"))).toBe(true);
  });

  it("parses functions with and without parentheses", () => {
    expect(t("sin x")).toBe("sin(x)");
    expect(t("sin 2x")).toBe("sin(2*x)");
    expect(t("sinx")).toBe("sin(x)");
    expect(t("sin^2(x)")).toBe("sin(x)^2");
    expect(t("sin^-1(x)")).toBe("asin(x)");
    expect(t("ln x + 1")).toBe("ln(x) + 1");
    expect(t("sin x cos x")).toBe("cos(x)*sin(x)");
  });

  it("parses unicode notation", () => {
    expect(t("x² + 2×3")).toBe("x^2 + 6");
    expect(t("√16")).toBe("4");
    expect(t("√(x+1)")).toBe("sqrt(x + 1)");
    expect(t("6 ÷ 3 − 1")).toBe("1");
    expect(t("π")).toBe("pi");
    expect(t("∛27")).toBe("3");
  });

  it("parses absolute values and postfix operators", () => {
    expect(t("|-3|")).toBe("3");
    expect(t("|x|")).toBe("abs(x)");
    expect(t("2|x|")).toBe("2*abs(x)");
    expect(t("4!")).toBe("24");
    expect(t("50%")).toBe("1/2");
    expect(t("180°")).toBe("pi");
  });

  it("parses relations and systems", () => {
    const r = parse("x + y = 2, x - y = 0");
    expect(r.statements).toHaveLength(2);
    expect(r.statements[0].k).toBe("rel");
    const chain = parse("1 < 2x + 1 <= 5").statements[0];
    expect(chain.k === "rel" && chain.ops).toEqual(["<", "<="]);
  });

  it("parses calculus notation", () => {
    const d = parse("d/dx (x^2 sin x)").statements[0];
    expect(d.k).toBe("deriv");
    if (d.k === "deriv") {
      expect(d.variable).toBe("x");
      expect(d.order).toBe(1);
    }
    const d2 = parse("d^2/dx^2 x^3").statements[0];
    expect(d2.k === "deriv" && d2.order).toBe(2);
    const i1 = parse("∫ x^2 dx").statements[0];
    expect(i1.k === "integral" && i1.variable).toBe("x");
    const i2 = parse("∫_0^1 x^2 dx").statements[0];
    expect(i2.k === "integral" && i2.lower !== undefined && i2.upper !== undefined).toBe(true);
    const i3 = parse("int xdx").statements[0];
    expect(i3.k === "integral" && i3.variable).toBe("x");
    const lim = parse("lim x->0 sin(x)/x").statements[0];
    expect(lim.k === "limit" && lim.variable).toBe("x");
    const lim2 = parse("lim_{x->0^+} 1/x").statements[0];
    expect(lim2.k === "limit" && lim2.direction).toBe("+");
    const lim3 = parse("lim_{x->inf} (1 + 1/x)^x").statements[0];
    expect(lim3.k === "limit" && lim3.to.k === "sym").toBe(true);
    const lim4 = parse("lim x->0+ 1/x").statements[0];
    expect(lim4.k === "limit" && lim4.direction).toBe("+");
  });

  it("parses matrices", () => {
    const m = parse("[[1,2],[3,4]]").statements[0];
    expect(m.k === "list" && m.items.length).toBe(2);
    const m2 = parse("[1, 2; 3, 4]").statements[0];
    expect(m2.k === "list" && m2.items[0].k).toBe("list");
    const det = parse("det([[1,2],[3,4]])").statements[0];
    expect(det.k === "call" && det.name).toBe("det");
  });

  it("parses logarithms with bases", () => {
    expect(t("log_2(x)")).toBe("log_(2)(x)");
    expect(t("log(100)")).toBe("2");
    expect(t("log2(8)")).toBe("3");
    expect(t("ln(1)")).toBe("0");
  });

  it("reports unmatched parentheses with position", () => {
    const e = errorOf("2*(3+4");
    expect(e.kind).toBe("invalid-input");
    expect(e.message).toMatch(/Kurung buka '\(' tidak memiliki pasangan '\)'/);
    expect(e.span).toEqual({ start: 2, end: 3 });
    expect(errorOf("2+3)").message).toMatch(/Kurung tutup/);
  });

  it("reports other syntax errors clearly", () => {
    expect(errorOf("2 +").message).toMatch(/membutuhkan operand/);
    expect(errorOf("* 3").message).toMatch(/Operator/);
    expect(errorOf("2 $ 3").message).toMatch(/karakter/);
    expect(errorOf("").message).toMatch(/kosong/);
    expect(errorOf("2 3").message).toMatch(/Dua angka/);
    expect(errorOf("sin").message).toMatch(/argumen/);
  });

  it("guards against excessive nesting", () => {
    const deep = "(".repeat(300) + "1" + ")".repeat(300);
    expect(() => parse(deep)).toThrowError(MathError);
  });
});
