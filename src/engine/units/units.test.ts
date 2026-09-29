import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { num } from "../expr/simplify";
import { evalReal } from "../expr/evaluate";
import { toText } from "../expr/print";
import { Rational } from "../core/rational";
import { convertValue, solveUnitConversion } from "./convert";
import { COMMON_UNITS, dimEquals, DIMS, parseUnit } from "./units";

const conv = (v: string, a: string, b: string) =>
  toText(convertValue(num(Rational.parseDecimal(v)!), parseUnit(a), parseUnit(b)));

describe("unit parsing", () => {
  it("parses compound units and dimensions", () => {
    expect(dimEquals(parseUnit("km/h").dim, DIMS.speed)).toBe(true);
    expect(dimEquals(parseUnit("kg*m^2/s^2").dim, DIMS.energy)).toBe(true);
    expect(dimEquals(parseUnit("N·m").dim, DIMS.energy)).toBe(true);
    expect(dimEquals(parseUnit("J/(kg·K)").dim, DIMS.specificHeat)).toBe(true);
    expect(dimEquals(parseUnit("m2").dim, DIMS.area)).toBe(true);
    expect(dimEquals(parseUnit("cm³").dim, DIMS.volume)).toBe(true);
    expect(dimEquals(parseUnit("mol/L").dim, DIMS.concentration)).toBe(true);
    expect(dimEquals(parseUnit("kWh").dim, DIMS.energy)).toBe(true);
    expect(dimEquals(parseUnit("MPa").dim, DIMS.pressure)).toBe(true);
  });
  it("rejects unknown units", () => {
    expect(() => parseUnit("furlongz")).toThrowError(/tidak dikenali/);
  });
  it("every common unit parses", () => {
    for (const list of Object.values(COMMON_UNITS))
      for (const u of list) expect(() => parseUnit(u)).not.toThrow();
  });
});

describe("unit conversion", () => {
  it("uses exact factors", () => {
    expect(conv("1", "in", "cm")).toBe("127/50");
    expect(conv("100", "km/h", "m/s")).toBe("250/9");
    expect(conv("1", "mi", "km")).toBe("201168/125000".replace("201168/125000", "25146/15625"));
    expect(conv("1", "kWh", "J")).toBe("3600000");
    expect(conv("1", "atm", "Pa")).toBe("101325");
    expect(conv("1", "GiB", "MB")).toBe(
      "268435456/250000".replace("268435456/250000", "16777216/15625"),
    );
  });
  it("converts angles exactly with π", () => {
    expect(conv("180", "°", "rad")).toBe("pi");
    expect(conv("30", "°", "rad")).toBe("pi/6");
  });
  it("handles affine temperature scales", () => {
    expect(conv("100", "°C", "°F")).toBe("212");
    expect(conv("32", "°F", "°C")).toBe("0");
    expect(conv("0", "K", "°C")).toBe("-5463/20");
    expect(conv("-40", "°C", "°F")).toBe("-40");
  });
  it("rejects incompatible dimensions", () => {
    expect(() => conv("1", "m", "kg")).toThrowError(/Tidak dapat mengonversi/);
  });
  it("round-trips exactly (property)", () => {
    const pairs = [
      ["m", "ft"],
      ["kg", "lb"],
      ["J", "cal"],
      ["Pa", "psi"],
      ["°C", "°F"],
      ["L", "gal"],
      ["m/s", "mph"],
      ["W", "hp"],
    ];
    fc.assert(
      fc.property(
        fc.constantFrom(...pairs),
        fc.integer({ min: -10000, max: 10000 }),
        ([a, b], v) => {
          const x = num(Rational.of(v, 7));
          const there = convertValue(x, parseUnit(a), parseUnit(b));
          const back = convertValue(there, parseUnit(b), parseUnit(a));
          expect(Math.abs(evalReal(back) - v / 7)).toBeLessThan(1e-9 * Math.max(1, Math.abs(v)));
        },
      ),
    );
  });
  it("produces a verified solution", () => {
    const s = solveUnitConversion("72", "km/h", "m/s");
    expect(s.answers[0].text).toBe("20 m/s");
    expect(s.verification.status).toBe("verified");
  });
});
