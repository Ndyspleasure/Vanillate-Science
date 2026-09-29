import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { solve } from "./router";

function ok(input: string) {
  const r = solve(input);
  if (!r.ok) throw new Error(`${input}: ${r.error.message} (${r.error.cause ?? ""})`);
  return r.solution;
}

/** Golden regression bank: input -> [kind, first answer text]. */
const GOLDEN: Array<[string, string, string]> = [
  ["2 + 3 * 4", "arithmetic", "14"],
  ["(2 + 3) * 4", "arithmetic", "20"],
  ["1/3 + 1/6", "arithmetic", "1/2"],
  ["2^10", "arithmetic", "1024"],
  ["sqrt(50)", "arithmetic", "5*sqrt(2)"],
  ["sin(pi/6)", "arithmetic", "1/2"],
  ["12 : 4", "arithmetic", "3"],
  ["15% * 200", "arithmetic", "30"],
  ["(1 + 2i)(3 - i)", "complex", "5*i + 5"],
  ["2x + 5 = 15", "equation", "5"],
  ["x^2 - 5x + 6 = 0", "equation", "2"],
  ["selesaikan 3x - 7 = 11", "equation", "6"],
  ["2x + 3 > 7", "inequality", "(2, ∞)"],
  ["x + y = 3, x - y = 1", "system", "2"],
  ["sederhanakan 3x + 2x - 4", "simplify", "5*x - 4"],
  ["jabarkan (x+1)^2", "expand", "x^2 + 2*x + 1"],
  ["faktorkan x^2 - 9", "factor", "(x - 3)*(x + 3)"],
  ["faktorkan 360", "number-theory", "2³ × 3² × 5".replace("2³ × 3² × 5", "2^3 × 3^2 × 5")],
  ["gcd(48, 18)", "number-theory", "6"],
  ["kpk(4, 6)", "number-theory", "12"],
  ["d/dx x^3", "derivative", "3*x^2"],
  ["turunan dari sin(x)^2", "derivative", "2*cos(x)*sin(x)"],
  ["∫ 2x dx", "integral", "x^2 + C"],
  ["∫_0^1 x^2 dx", "integral", "1/3"],
  ["lim x->0 sin(x)/x", "limit", "1"],
  ["det([[1,2],[3,4]])", "matrix", "-2"],
  ["[[1,2],[3,4]] * [[0,1],[1,0]]", "matrix", "[[2,1],[4,3]]"],
  ["dot([1,2,3],[4,5,6])", "vector", "32"],
  ["2, 4, 4, 4, 5, 5, 7, 9", "statistics", "8"],
  ["(1, 2), (2, 4), (3, 6)", "statistics", "ŷ = 0 + 2x"],
  ["x^2 + 1, x = 3", "simplify", "10"],
  ["taylor(e^x, x, 0, 3)", "series", "x^3/6 + x^2/2 + x + 1"],
];

describe("router golden regression bank", () => {
  for (const [input, kind, first] of GOLDEN) {
    it(`${input}`, () => {
      const s = ok(input);
      expect(s.kind).toBe(kind);
      expect(s.answers[0].text).toBe(first);
      expect(s.verification.status).not.toBe("failed");
    });
  }
});

describe("router error handling", () => {
  it("returns structured errors instead of throwing", () => {
    const r = solve("2*(3+4");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("invalid-input");
      expect(r.error.message).toMatch(/Kurung buka/);
      expect(r.error.span).toBeDefined();
    }
    const d = solve("1/(2-2)");
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error.kind).toBe("division-by-zero");
  });
  it("reports unsupported problems honestly", () => {
    const r = solve("∫ e^(x^2) dx");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("unsupported");
  });
  it("never throws on random input (fuzz)", () => {
    const alphabet = fc.constantFrom(..."0123456789xyz+-*/^()[]{}|=<>!.,;πe√∫ sincolgtdqr".split(""));
    fc.assert(
      fc.property(fc.array(alphabet, { maxLength: 30 }).map((a) => a.join("")), (s) => {
        const r = solve(s, { timeMs: 1500 });
        expect(typeof r.ok).toBe("boolean");
        if (r.ok) {
          expect(Array.isArray(r.solution.steps)).toBe(true);
          expect(r.solution.answers.length).toBeGreaterThan(0);
        } else {
          expect(r.error.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 400 },
    );
  });
  it("solutions are serializable (worker boundary)", () => {
    const s = ok("x^2 - 2 = 0");
    expect(() => structuredClone(s)).not.toThrow();
    expect(JSON.parse(JSON.stringify(s)).answers.length).toBe(s.answers.length);
  });
});
