import { describe, expect, it } from "vitest";
import { Rational } from "../core/rational";
import { solveDescriptive, solveRegression } from "./descriptive";
import { solveAnova, solveBinomial, solveChiSquareGof, solveConfidenceInterval, solveNormal, solveOneSampleT, solvePoisson, solveProportionZ, solveTwoSampleT, solveInverseNormal, solveGeometric, solveExponentialDist } from "./distributions";

const R = (xs: number[]) => xs.map((x) => Rational.fromNumber(x));

describe("descriptive statistics", () => {
  it("computes exact summary statistics", () => {
    const s = solveDescriptive("", R([2, 4, 4, 4, 5, 5, 7, 9]));
    const get = (l: string) => s.answers.find((a) => a.label === l)!.text;
    expect(get("Rata-rata")).toBe("5");
    expect(get("Median")).toBe("4.5");
    expect(get("Modus")).toBe("4");
    expect(get("Variansi populasi σ²")).toBe("4");
    expect(get("Variansi sampel s²")).toBe("32/7");
    expect(s.verification.status).toBe("verified");
  });
  it("fits a regression line exactly", () => {
    const s = solveRegression("", R([1, 2, 3, 4]), R([2, 4.1, 5.9, 8.2]));
    expect(s.answers[1].text).toBe("2.04");
    expect(s.verification.status).toBe("verified");
  });
});

describe("distributions", () => {
  it("binomial is exact", () => {
    const s = solveBinomial({ n: 10, p: "0.5", k: 3, tail: "le" });
    expect(s.answers[0].text).toBe("11/64");
    expect(s.verification.status).toBe("verified");
  });
  it("poisson, normal, inverse normal, geometric, exponential", () => {
    expect(Number(solvePoisson({ lambda: "3", k: 2, tail: "eq" }).answers[0].approx)).toBeCloseTo(0.22404180765538775, 9);
    expect(Number(solveNormal({ mu: 100, sigma: 15, tail: "le", a: 130 }).answers[0].text)).toBeCloseTo(0.9772498680518208, 10);
    expect(solveNormal({ mu: 0, sigma: 1, tail: "between", a: -1.96, b: 1.96 }).verification.status).toBe("verified-numeric");
    expect(Number(solveInverseNormal({ p: 0.95, mu: 0, sigma: 1 }).answers[0].text)).toBeCloseTo(1.6448536269514729, 10);
    expect(solveGeometric({ p: "0.2", k: 3, tail: "eq" }).answers[0].text).toBe("16/125");
    expect(Number(solveExponentialDist({ rate: 0.5, tail: "le", a: 2 }).answers[0].text)).toBeCloseTo(1 - Math.exp(-1), 10);
  });
});

describe("inference", () => {
  it("one-sample t test", () => {
    const s = solveOneSampleT({ mean: 105, sd: 15, n: 36, mu0: 100, alternative: "two-sided", alpha: 0.05 });
    expect(Number(s.answers[0].text)).toBeCloseTo(2, 10);
    expect(Number(s.answers[2].text)).toBeCloseTo(0.05330, 4);
  });
  it("confidence intervals, Welch, proportion, chi-square, ANOVA", () => {
    const ci = solveConfidenceInterval({ mean: 50, sd: 10, n: 25, confidence: 0.95, sigmaKnown: true });
    expect(ci.answers[0].text).toBe("(46.08007203, 53.91992797)");
    expect(solveTwoSampleT({ mean1: 10, sd1: 2, n1: 30, mean2: 9, sd2: 2.5, n2: 35, alternative: "two-sided", alpha: 0.05 }).verification.status).not.toBe("failed");
    expect(Number(solveProportionZ({ x: 60, n: 100, p0: 0.5, alternative: "greater", alpha: 0.05 }).answers[1].text)).toBeCloseTo(2, 10);
    const chi = solveChiSquareGof({ observed: [50, 30, 20], probabilities: [0.5, 0.3, 0.2], alpha: 0.05 });
    expect(Number(chi.answers[0].text)).toBe(0);
    const an = solveAnova({ groups: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], alpha: 0.05 });
    expect(Number(an.answers[0].text)).toBeCloseTo(27, 10);
    expect(an.verification.status).toBe("verified");
  });
});
