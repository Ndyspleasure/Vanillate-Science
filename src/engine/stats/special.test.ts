import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  betaI,
  chiSquareCdf,
  chiSquareInv,
  erf,
  erfc,
  fCdf,
  fInv,
  gammaP,
  lnGamma,
  normalCdf,
  normalInv,
  tCdf,
  tInv,
} from "./special";

// Reference values: standard tables / high-precision computations (Wolfram|Alpha, R).
describe("special functions", () => {
  it("erf and erfc", () => {
    expect(erf(0.5)).toBeCloseTo(0.5204998778130465, 14);
    expect(erf(1)).toBeCloseTo(0.8427007929497149, 14);
    expect(erf(2.5)).toBeCloseTo(0.999593047982555, 14);
    expect(erfc(5) / 1.5374597944280349e-12).toBeCloseTo(1, 10);
    expect(erfc(3.5) / 7.43098372341412e-7).toBeCloseTo(1, 10);
    expect(erf(-1)).toBeCloseTo(-0.8427007929497149, 14);
  });
  it("normal distribution", () => {
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517795, 13);
    expect(normalCdf(-1)).toBeCloseTo(0.15865525393145707, 13);
    expect(normalCdf(0)).toBe(0.5);
    expect(normalInv(0.975)).toBeCloseTo(1.959963984540054, 12);
    expect(normalInv(0.05)).toBeCloseTo(-1.6448536269514729, 12);
    expect(normalInv(1e-10)).toBeCloseTo(-6.361340902404056, 9);
  });
  it("normal quantile inverts the CDF (property)", () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-8, max: 1 - 1e-8, noNaN: true }), (p) => {
        expect(Math.abs(normalCdf(normalInv(p)) - p)).toBeLessThan(1e-12 * Math.max(1, 1 / p));
      }),
    );
  });
  it("gamma functions", () => {
    expect(lnGamma(10)).toBeCloseTo(Math.log(362880), 12);
    expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12);
    expect(gammaP(1, 1)).toBeCloseTo(1 - Math.exp(-1), 14);
    expect(gammaP(3, 10)).toBeCloseTo(0.9972306042844884, 13);
  });
  it("beta and t distributions", () => {
    expect(betaI(2, 3, 0.4)).toBeCloseTo(0.5248, 12);
    expect(tCdf(2.2281388519649385, 10)).toBeCloseTo(0.975, 10);
    expect(tInv(0.975, 10)).toBeCloseTo(2.2281388519649385, 10);
    expect(tInv(0.995, 3)).toBeCloseTo(5.840909309733351, 9);
    expect(tCdf(0, 7)).toBeCloseTo(0.5, 14);
  });
  it("chi-square and F distributions", () => {
    expect(chiSquareCdf(3.841458820694124, 1)).toBeCloseTo(0.95, 12);
    expect(chiSquareInv(0.95, 10)).toBeCloseTo(18.307038053275146, 9);
    expect(fCdf(3.325834530413011, 5, 10)).toBeCloseTo(0.95, 12);
    expect(fInv(0.95, 5, 10)).toBeCloseTo(3.325834530413011, 9);
  });
});
