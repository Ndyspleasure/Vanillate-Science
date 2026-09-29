import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Rational, bigIntRoot, exactIntRoot } from "./rational";
import { factorInteger, isProbablePrime, extractPower, extendedGcd, divisors } from "./numtheory";

const arbRational = fc
  .tuple(fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }), fc.bigInt({ min: 1n, max: 10n ** 12n }))
  .map(([n, d]) => Rational.of(n, d));

describe("Rational", () => {
  it("normalizes sign and gcd", () => {
    const r = Rational.of(6n, -4n);
    expect(r.num).toBe(-3n);
    expect(r.den).toBe(2n);
    expect(Rational.of(0n, -5n).toString()).toBe("0");
  });

  it("parses decimals exactly", () => {
    expect(Rational.parseDecimal("0.1")!.toString()).toBe("1/10");
    expect(Rational.parseDecimal("1.5e-3")!.toString()).toBe("3/2000");
    expect(Rational.parseDecimal("2E3")!.toString()).toBe("2000");
    expect(Rational.parseDecimal(".25")!.toString()).toBe("1/4");
    expect(Rational.parseDecimal("abc")).toBeNull();
  });

  it("converts from binary floating point via shortest decimal", () => {
    expect(Rational.fromNumber(0.1).toString()).toBe("1/10");
    expect(Rational.fromNumber(-2.5).toString()).toBe("-5/2");
  });

  it("detects repeating decimals", () => {
    expect(Rational.of(1, 3).toRepeatingDecimal()).toEqual({ integer: "0", nonRepeating: "", repeating: "3" });
    expect(Rational.of(1, 6).toRepeatingDecimal()).toEqual({ integer: "0", nonRepeating: "1", repeating: "6" });
    expect(Rational.of(1, 8).toRepeatingDecimal()).toEqual({ integer: "0", nonRepeating: "125", repeating: "" });
  });

  it("rounds half away from zero", () => {
    expect(Rational.of(5, 2).round()).toBe(3n);
    expect(Rational.of(-5, 2).round()).toBe(-3n);
    expect(Rational.of(2, 3).toFixedString(3)).toBe("0.667");
    expect(Rational.of(-1, 3).toFixedString(2)).toBe("-0.33");
  });

  it("converts huge rationals to numbers accurately", () => {
    const big = Rational.of(10n ** 400n + 1n, 3n * 10n ** 399n);
    expect(big.toNumber()).toBeCloseTo(10 / 3, 12);
  });

  it("throws on division by zero", () => {
    expect(() => Rational.ONE.div(Rational.ZERO)).toThrowError(/nol/);
  });

  it("satisfies field axioms (property)", () => {
    fc.assert(
      fc.property(arbRational, arbRational, arbRational, (a, b, c) => {
        expect(a.add(b).equals(b.add(a))).toBe(true);
        expect(a.mul(b.add(c)).equals(a.mul(b).add(a.mul(c)))).toBe(true);
        expect(a.sub(a).isZero()).toBe(true);
        if (!b.isZero()) expect(a.div(b).mul(b).equals(a)).toBe(true);
      }),
    );
  });

  it("floor/ceil are consistent (property)", () => {
    fc.assert(
      fc.property(arbRational, (a) => {
        const f = Rational.of(a.floor());
        expect(f.cmp(a) <= 0).toBe(true);
        expect(f.add(Rational.ONE).cmp(a) > 0).toBe(true);
        expect(a.ceil() - a.floor() <= 1n).toBe(true);
      }),
    );
  });
});

describe("number theory", () => {
  it("computes integer roots", () => {
    expect(bigIntRoot(10n ** 30n, 3)).toBe(10n ** 10n);
    expect(exactIntRoot(-27n, 3)).toBe(-3n);
    expect(exactIntRoot(26n, 3)).toBeNull();
  });

  it("tests primality", () => {
    expect(isProbablePrime(2n)).toBe(true);
    expect(isProbablePrime(561n)).toBe(false); // Carmichael number
    expect(isProbablePrime(1000000007n)).toBe(true);
    expect(isProbablePrime(2n ** 61n - 1n)).toBe(true);
    expect(isProbablePrime(3215031751n)).toBe(false); // strong pseudoprime to bases 2,3,5,7
  });

  it("factors integers", () => {
    expect(factorInteger(360n)).toEqual([
      [2n, 3],
      [3n, 2],
      [5n, 1],
    ]);
    const n = 1000000007n * 998244353n;
    expect(factorInteger(n)).toEqual([
      [998244353n, 1],
      [1000000007n, 1],
    ]);
  });

  it("extracts perfect powers for radicals", () => {
    expect(extractPower(72n, 2)).toEqual({ outside: 6n, inside: 2n });
    expect(extractPower(54n, 3)).toEqual({ outside: 3n, inside: 2n });
  });

  it("extended gcd satisfies Bezout identity (property)", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 9n), max: 10n ** 9n }), fc.bigInt({ min: -(10n ** 9n), max: 10n ** 9n }), (a, b) => {
        const { g, x, y } = extendedGcd(a, b);
        expect(a * x + b * y).toBe(g);
        expect(g >= 0n).toBe(true);
      }),
    );
  });

  it("lists divisors", () => {
    expect(divisors(12n)).toEqual([1n, 2n, 3n, 4n, 6n, 12n]);
  });
});
