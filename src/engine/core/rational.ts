/**
 * Exact rational arithmetic on BigInt.
 *
 * Invariants: denominator > 0 and gcd(|num|, den) = 1. All values are immutable.
 * Used for every numeric literal in the engine so that exact mode never silently
 * turns into floating point (CLAUDE.md §18).
 */
import { checkBigIntSize, MAX_BIGINT_BITS } from "./budget";
import { MathError } from "./errors";

export function bigAbs(a: bigint): bigint {
  return a < 0n ? -a : a;
}

export function bigGcd(a: bigint, b: bigint): bigint {
  a = bigAbs(a);
  b = bigAbs(b);
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

export function bigLcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  return bigAbs((a / bigGcd(a, b)) * b);
}

export function bitLength(a: bigint): number {
  a = bigAbs(a);
  if (a === 0n) return 0;
  return a.toString(2).length;
}

export function bigPow(base: bigint, exp: number): bigint {
  if (exp < 0) throw new Error("bigPow: negative exponent");
  const estimate = bitLength(base) * exp;
  if (estimate > MAX_BIGINT_BITS + 64 && bigAbs(base) > 1n) {
    throw new MathError("limit-exceeded", "Bilangan terlalu besar untuk dihitung secara eksak.", {
      module: "rational",
      operation: "pow",
      cause: `Perpangkatan menghasilkan sekitar ${estimate} bit.`,
      hint: "Gunakan mode aproksimasi atau kecilkan eksponen.",
    });
  }
  let result = 1n;
  let b = base;
  let e = exp;
  while (e > 0) {
    if (e & 1) result *= b;
    e >>= 1;
    if (e > 0) b *= b;
  }
  return result;
}

/** Floor of the exact n-th root of a non-negative BigInt. */
export function bigIntRoot(a: bigint, n: number): bigint {
  if (a < 0n) throw new Error("bigIntRoot: negative");
  if (a < 2n || n === 1) return a;
  const bn = BigInt(n);
  // Initial guess from floating point, then Newton iterations on integers.
  let x = BigInt(Math.floor(Math.pow(Number(a) || Number.MAX_VALUE, 1 / n))) + 1n;
  if (bitLength(a) > 1000) x = 1n << BigInt(Math.ceil(bitLength(a) / n) + 1);
  for (;;) {
    const y = ((bn - 1n) * x + a / bigPow(x, n - 1)) / bn;
    if (y >= x) break;
    x = y;
  }
  while (bigPow(x, n) > a) x -= 1n;
  while (bigPow(x + 1n, n) <= a) x += 1n;
  return x;
}

/** Exact n-th root if `a` is a perfect n-th power, otherwise null. */
export function exactIntRoot(a: bigint, n: number): bigint | null {
  if (a < 0n) {
    if (n % 2 === 0) return null;
    const r = exactIntRoot(-a, n);
    return r === null ? null : -r;
  }
  const r = bigIntRoot(a, n);
  return bigPow(r, n) === a ? r : null;
}

export class Rational {
  readonly num: bigint;
  readonly den: bigint;

  private constructor(num: bigint, den: bigint) {
    this.num = num;
    this.den = den;
  }

  static readonly ZERO = new Rational(0n, 1n);
  static readonly ONE = new Rational(1n, 1n);
  static readonly MINUS_ONE = new Rational(-1n, 1n);
  static readonly TWO = new Rational(2n, 1n);
  static readonly HALF = new Rational(1n, 2n);

  static of(num: bigint | number, den: bigint | number = 1n): Rational {
    const n = typeof num === "number" ? Rational.intFromNumber(num) : num;
    const d = typeof den === "number" ? Rational.intFromNumber(den) : den;
    if (d === 0n) {
      throw new MathError("division-by-zero", "Pembagian dengan nol tidak terdefinisi.", {
        module: "rational",
        operation: "construct",
      });
    }
    return Rational.normalize(n, d);
  }

  private static intFromNumber(x: number): bigint {
    if (!Number.isInteger(x)) throw new Error(`Rational.of expects integers, got ${x}`);
    return BigInt(x);
  }

  private static normalize(n: bigint, d: bigint): Rational {
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    if (n === 0n) return Rational.ZERO_INTERNAL();
    const g = bigGcd(n, d);
    if (g !== 1n) {
      n /= g;
      d /= g;
    }
    return new Rational(n, d);
  }

  private static ZERO_INTERNAL(): Rational {
    return Rational.ZERO ?? new Rational(0n, 1n);
  }

  /**
   * Parse a decimal literal exactly: "12", "0.125", "1.5e-3", ".5", "2E10".
   * Returns null when the string is not a valid decimal literal.
   */
  static parseDecimal(text: string): Rational | null {
    const m = /^([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text.trim());
    if (!m) return null;
    const [, sign, intPart = "", fracPart = "", expPart] = m;
    if (intPart === "" && fracPart === "") return null;
    const digits = (intPart + fracPart).replace(/^0+(?=\d)/, "") || "0";
    let exp = -fracPart.length + (expPart ? parseInt(expPart, 10) : 0);
    if (Math.abs(exp) > 10_000) {
      throw new MathError("limit-exceeded", "Eksponen notasi ilmiah terlalu besar.", {
        module: "rational",
        operation: "parse-decimal",
        cause: `Eksponen ${exp} berada di luar batas aman (±10000).`,
      });
    }
    let n = BigInt(digits);
    let d = 1n;
    if (exp > 0) n *= 10n ** BigInt(exp);
    else if (exp < 0) {
      d = 10n ** BigInt(-exp);
      exp = 0;
    }
    if (sign === "-") n = -n;
    return Rational.normalize(n, d);
  }

  /**
   * Convert a finite JS number to the rational of its shortest decimal representation.
   * 0.1 -> 1/10 (not the binary 3602879701896397/36028797018963968).
   */
  static fromNumber(x: number): Rational {
    if (!Number.isFinite(x)) {
      throw new MathError(
        "numerical-instability",
        "Nilai numerik tidak berhingga atau tidak terdefinisi.",
        {
          module: "rational",
          operation: "from-number",
        },
      );
    }
    if (Number.isInteger(x) && Math.abs(x) <= Number.MAX_SAFE_INTEGER)
      return Rational.of(BigInt(x));
    const r = Rational.parseDecimal(x.toString());
    if (!r) throw new Error(`Cannot convert ${x} to rational`);
    return r;
  }

  isZero(): boolean {
    return this.num === 0n;
  }
  isOne(): boolean {
    return this.num === 1n && this.den === 1n;
  }
  isMinusOne(): boolean {
    return this.num === -1n && this.den === 1n;
  }
  isInteger(): boolean {
    return this.den === 1n;
  }
  isNegative(): boolean {
    return this.num < 0n;
  }
  isPositive(): boolean {
    return this.num > 0n;
  }
  sign(): -1 | 0 | 1 {
    return this.num < 0n ? -1 : this.num > 0n ? 1 : 0;
  }

  add(o: Rational): Rational {
    if (this.den === o.den) return Rational.normalize(this.num + o.num, this.den);
    const r = Rational.normalize(this.num * o.den + o.num * this.den, this.den * o.den);
    checkBigIntSize(r.den, "add");
    return r;
  }
  sub(o: Rational): Rational {
    return this.add(o.neg());
  }
  mul(o: Rational): Rational {
    const r = Rational.normalize(this.num * o.num, this.den * o.den);
    checkBigIntSize(r.num, "mul");
    checkBigIntSize(r.den, "mul");
    return r;
  }
  div(o: Rational): Rational {
    if (o.isZero()) {
      throw new MathError("division-by-zero", "Pembagian dengan nol tidak terdefinisi.", {
        module: "rational",
        operation: "div",
      });
    }
    return Rational.normalize(this.num * o.den, this.den * o.num);
  }
  neg(): Rational {
    return new Rational(-this.num, this.den);
  }
  abs(): Rational {
    return this.num < 0n ? this.neg() : this;
  }
  inv(): Rational {
    return Rational.ONE.div(this);
  }
  /** Integer power (exponent may be negative). */
  pow(e: number | bigint): Rational {
    const k = typeof e === "bigint" ? e : BigInt(e);
    if (k === 0n) return Rational.ONE;
    if (k > BigInt(MAX_BIGINT_BITS) || k < -BigInt(MAX_BIGINT_BITS)) {
      if (this.isZero() || this.num === this.den || this.num === -this.den) {
        // 0^k, 1^k, (-1)^k are cheap
        if (this.isZero()) {
          if (k < 0n)
            throw new MathError(
              "division-by-zero",
              "0 dipangkatkan bilangan negatif tidak terdefinisi.",
              { module: "rational", operation: "pow" },
            );
          return Rational.ZERO;
        }
        if (this.isOne()) return Rational.ONE;
        return k % 2n === 0n ? Rational.ONE : Rational.MINUS_ONE;
      }
      throw new MathError("limit-exceeded", "Eksponen terlalu besar untuk dihitung secara eksak.", {
        module: "rational",
        operation: "pow",
      });
    }
    const n = Number(k < 0n ? -k : k);
    const r = new Rational(bigPow(this.num, n), bigPow(this.den, n));
    return k < 0n ? r.inv() : r;
  }

  cmp(o: Rational): -1 | 0 | 1 {
    const l = this.num * o.den;
    const r = o.num * this.den;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  equals(o: Rational): boolean {
    return this.num === o.num && this.den === o.den;
  }
  lt(o: Rational): boolean {
    return this.cmp(o) < 0;
  }
  gt(o: Rational): boolean {
    return this.cmp(o) > 0;
  }

  floor(): bigint {
    const q = this.num / this.den;
    return this.num < 0n && q * this.den !== this.num ? q - 1n : q;
  }
  ceil(): bigint {
    return -this.neg().floor();
  }
  /** Round half away from zero. */
  round(): bigint {
    const twice = new Rational(
      this.num * 2n + (this.num < 0n ? -this.den : this.den),
      this.den * 2n,
    );
    return this.num < 0n ? twice.ceil() : twice.floor();
  }
  /** Truncated integer part and remainder (for mixed numbers). */
  mixed(): { whole: bigint; rest: Rational } {
    const whole = this.num / this.den;
    return { whole, rest: Rational.normalize(this.num - whole * this.den, this.den) };
  }

  /** Accurate conversion to double (correct for huge numerators/denominators). */
  toNumber(): number {
    const n = this.num;
    const d = this.den;
    const LIMIT = 1n << 53n;
    if (bigAbs(n) < LIMIT && d < LIMIT) return Number(n) / Number(d);
    const shift = bitLength(d) - bitLength(n) + 64;
    const scaled = shift >= 0 ? (n << BigInt(shift)) / d : n / (d << BigInt(-shift));
    return Number(scaled) * Math.pow(2, -shift / 2) * Math.pow(2, -shift / 2);
  }

  toString(): string {
    return this.den === 1n ? this.num.toString() : `${this.num}/${this.den}`;
  }

  /** True when the decimal expansion terminates (denominator = 2^a 5^b). */
  hasTerminatingDecimal(): boolean {
    let d = this.den;
    while (d % 2n === 0n) d /= 2n;
    while (d % 5n === 0n) d /= 5n;
    return d === 1n;
  }

  /** Exact decimal string with at most `maxFractionDigits`, rounded half away from zero. */
  toFixedString(maxFractionDigits: number): string {
    const neg = this.num < 0n;
    const n = bigAbs(this.num);
    const scale = 10n ** BigInt(maxFractionDigits);
    let q = (n * scale) / this.den;
    const r = (n * scale) % this.den;
    if (r * 2n >= this.den) q += 1n;
    let s = q.toString().padStart(maxFractionDigits + 1, "0");
    if (maxFractionDigits > 0) {
      s = `${s.slice(0, -maxFractionDigits)}.${s.slice(-maxFractionDigits)}`;
      s = s.replace(/\.?0+$/, "");
    }
    if (s === "") s = "0";
    return neg && s !== "0" ? `-${s}` : s;
  }

  /**
   * Decimal expansion with repeating part detection, e.g. 1/3 -> "0.(3)", 1/6 -> "0.1(6)".
   * Returns null if the repetend is longer than `maxDigits`.
   */
  toRepeatingDecimal(
    maxDigits = 60,
  ): { integer: string; nonRepeating: string; repeating: string } | null {
    const neg = this.num < 0n;
    const n = bigAbs(this.num);
    const intPart = n / this.den;
    let rem = n % this.den;
    const seen = new Map<string, number>();
    const digits: string[] = [];
    while (rem !== 0n && !seen.has(rem.toString())) {
      if (digits.length > maxDigits) return null;
      seen.set(rem.toString(), digits.length);
      rem *= 10n;
      digits.push((rem / this.den).toString());
      rem %= this.den;
    }
    const integer = (neg ? "-" : "") + intPart.toString();
    if (rem === 0n) return { integer, nonRepeating: digits.join(""), repeating: "" };
    const start = seen.get(rem.toString())!;
    return {
      integer,
      nonRepeating: digits.slice(0, start).join(""),
      repeating: digits.slice(start).join(""),
    };
  }
}

export const R = Rational.of;
