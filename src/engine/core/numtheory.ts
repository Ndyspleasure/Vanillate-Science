/**
 * Integer number theory primitives on BigInt: primality, factorization, perfect powers.
 *
 * References:
 * - Miller–Rabin with the first 13 prime bases is deterministic for n < 3.317e24
 *   (Sorenson & Webster, "Strong pseudoprimes to twelve prime bases", Math. Comp. 86 (2017)).
 * - Pollard's rho with Brent's cycle detection (R. P. Brent, "An improved Monte Carlo
 *   factorization algorithm", BIT 20 (1980)).
 */
import { tick } from "./budget";
import { MathError } from "./errors";
import { bigAbs, bigGcd, bigPow, exactIntRoot, bitLength } from "./rational";

const SMALL_PRIMES: number[] = (() => {
  const limit = 1000;
  const sieve = new Uint8Array(limit + 1);
  const primes: number[] = [];
  for (let i = 2; i <= limit; i++) {
    if (!sieve[i]) {
      primes.push(i);
      for (let j = i * i; j <= limit; j += i) sieve[j] = 1;
    }
  }
  return primes;
})();

const MR_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];
/** Below this bound the Miller–Rabin test with MR_BASES is deterministic. */
export const MR_DETERMINISTIC_BOUND = 3317044064679887385961981n;

export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    e >>= 1n;
    b = (b * b) % mod;
  }
  return result;
}

export function isProbablePrime(n: bigint): boolean {
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES) {
    const bp = BigInt(p);
    if (n === bp) return true;
    if (n % bp === 0n) return false;
  }
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }
  outer: for (const a of MR_BASES) {
    tick("miller-rabin");
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let r = 1; r < s; r++) {
      x = (x * x) % n;
      if (x === n - 1n) continue outer;
    }
    return false;
  }
  return true;
}

function pollardBrent(n: bigint): bigint {
  if (n % 2n === 0n) return 2n;
  for (let c = 1n; c < 50n; c++) {
    let y = 2n;
    let r = 1n;
    let q = 1n;
    let g = 1n;
    let x = 2n;
    let ys = 2n;
    const m = 64n;
    const f = (v: bigint) => (v * v + c) % n;
    while (g === 1n) {
      x = y;
      for (let i = 0n; i < r; i++) y = f(y);
      let k = 0n;
      while (k < r && g === 1n) {
        tick("pollard-rho");
        ys = y;
        const lim = m < r - k ? m : r - k;
        for (let i = 0n; i < lim; i++) {
          y = f(y);
          q = (q * bigAbs(x - y)) % n;
        }
        g = bigGcd(q, n);
        k += m;
      }
      r *= 2n;
      if (r > 1n << 26n) break;
    }
    if (g === n) {
      do {
        ys = f(ys);
        g = bigGcd(bigAbs(x - ys), n);
      } while (g === 1n);
    }
    if (g !== n && g !== 1n) return g;
  }
  throw new MathError("limit-exceeded", "Faktorisasi bilangan terlalu sulit.", {
    module: "numtheory",
    operation: "pollard-rho",
    cause: "Algoritma Pollard rho tidak menemukan faktor dalam batas iterasi.",
  });
}

/**
 * Prime factorization of |n| (n != 0). Returns [prime, exponent] pairs sorted by prime.
 * Throws limit-exceeded for numbers above ~2^200 that resist factorization.
 */
export function factorInteger(n: bigint): Array<[bigint, number]> {
  n = bigAbs(n);
  if (n === 0n) throw new MathError("domain-error", "0 tidak memiliki faktorisasi prima.", { module: "numtheory" });
  const result = new Map<bigint, number>();
  const add = (p: bigint, k = 1) => result.set(p, (result.get(p) ?? 0) + k);
  for (const p of SMALL_PRIMES) {
    const bp = BigInt(p);
    if (bp * bp > n) break;
    while (n % bp === 0n) {
      add(bp);
      n /= bp;
    }
  }
  if (n > 1n) {
    if (bitLength(n) > 220) {
      throw new MathError("limit-exceeded", "Bilangan terlalu besar untuk difaktorkan.", {
        module: "numtheory",
        operation: "factor",
        cause: "Faktorisasi prima dibatasi hingga sekitar 66 digit.",
      });
    }
    const stack = [n];
    while (stack.length) {
      const m = stack.pop()!;
      if (m === 1n) continue;
      if (isProbablePrime(m)) {
        add(m);
        continue;
      }
      // perfect power shortcut
      let handled = false;
      for (let k = 2; k <= 64 && !handled; k++) {
        const r = exactIntRoot(m, k);
        if (r !== null && r > 1n) {
          for (let i = 0; i < k; i++) stack.push(r);
          handled = true;
        }
      }
      if (handled) continue;
      const d = pollardBrent(m);
      stack.push(d, m / d);
    }
  }
  return [...result.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * Write |n| = outside^q * inside with inside free of q-th powers.
 * Used for radical simplification: sqrt(72) = 6 sqrt(2).
 */
export function extractPower(n: bigint, q: number): { outside: bigint; inside: bigint } {
  n = bigAbs(n);
  if (n <= 1n) return { outside: 1n, inside: n };
  let factors: Array<[bigint, number]>;
  try {
    factors = factorInteger(n);
  } catch {
    // Fall back to trial division by small primes only.
    let outside = 1n;
    let inside = n;
    for (const p of SMALL_PRIMES) {
      const pq = bigPow(BigInt(p), q);
      while (inside % pq === 0n) {
        inside /= pq;
        outside *= BigInt(p);
      }
    }
    const r = exactIntRoot(inside, q);
    if (r !== null) return { outside: outside * r, inside: 1n };
    return { outside, inside };
  }
  let outside = 1n;
  let inside = 1n;
  for (const [p, e] of factors) {
    outside *= bigPow(p, Math.floor(e / q));
    inside *= bigPow(p, e % q);
  }
  return { outside, inside };
}

/** If n = b^k for integer b and k >= 2, return the largest such k with base. */
export function perfectPower(n: bigint): { base: bigint; exp: number } | null {
  const a = bigAbs(n);
  if (a < 4n) return null;
  const maxK = bitLength(a);
  for (let k = maxK; k >= 2; k--) {
    const r = exactIntRoot(n, k);
    if (r !== null && bigAbs(r) > 1n) return { base: r, exp: k };
  }
  return null;
}

/** Extended Euclid: returns g, x, y with a x + b y = g = gcd(a, b). */
export function extendedGcd(a: bigint, b: bigint): { g: bigint; x: bigint; y: bigint } {
  let [oldR, r] = [a, b];
  let [oldS, s] = [1n, 0n];
  let [oldT, t] = [0n, 1n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
    [oldT, t] = [t, oldT - q * t];
  }
  if (oldR < 0n) return { g: -oldR, x: -oldS, y: -oldT };
  return { g: oldR, x: oldS, y: oldT };
}

export function factorial(n: number): bigint {
  if (!Number.isInteger(n) || n < 0) throw new MathError("domain-error", "Faktorial hanya terdefinisi untuk bilangan bulat tak negatif.", { module: "numtheory", operation: "factorial" });
  if (n > 5000) throw new MathError("limit-exceeded", "Faktorial terlalu besar untuk dihitung secara eksak (maks 5000!).", { module: "numtheory", operation: "factorial" });
  let r = 1n;
  for (let i = 2; i <= n; i++) r *= BigInt(i);
  return r;
}

export function binomial(n: bigint, k: bigint): bigint {
  if (k < 0n || n < 0n || k > n) return 0n;
  if (k > n - k) k = n - k;
  if (k > 100000n) throw new MathError("limit-exceeded", "Koefisien binomial terlalu besar.", { module: "numtheory" });
  let r = 1n;
  for (let i = 1n; i <= k; i++) {
    r = (r * (n - k + i)) / i;
  }
  return r;
}

export function divisors(n: bigint): bigint[] {
  n = bigAbs(n);
  if (n === 0n) return [];
  let divs = [1n];
  for (const [p, e] of factorInteger(n)) {
    const next: bigint[] = [];
    let pk = 1n;
    for (let k = 0; k <= e; k++) {
      for (const d of divs) next.push(d * pk);
      pk *= p;
    }
    divs = next;
    if (divs.length > 100000) throw new MathError("limit-exceeded", "Terlalu banyak pembagi.", { module: "numtheory" });
  }
  return divs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
