/**
 * Elementary number theory with steps: GCD (Euclid) and LCM, prime factorization,
 * primality, divisors, modular inverse (extended Euclid) and modular exponentiation.
 * Reference: K. H. Rosen, "Discrete Mathematics and Its Applications", chapter
 * "Number Theory and Cryptography".
 */
import { MathError } from "../core/errors";
import { bigAbs, bigGcd, bigLcm, bigIntRoot } from "../core/rational";
import {
  divisors,
  extendedGcd,
  factorInteger,
  isProbablePrime,
  modPow,
  MR_DETERMINISTIC_BOUND,
} from "../core/numtheory";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification } from "../steps/format";
import type { Answer, Solution, Step, TableData, VerificationCheck } from "../steps/types";

const MAX_DIGITS = 60;

function parseIntArg(v: bigint | number): bigint {
  return typeof v === "number" ? BigInt(v) : v;
}

function guardDigits(n: bigint) {
  if (bigAbs(n).toString().length > MAX_DIGITS) {
    throw new MathError("limit-exceeded", `Bilangan dibatasi hingga ${MAX_DIGITS} digit.`, {
      module: "number-theory",
    });
  }
}

function factorLatex(fs: Array<[bigint, number]>): string {
  return fs.map(([p, e]) => (e === 1 ? `${p}` : `${p}^{${e}}`)).join(" \\cdot ");
}

export function solveGcdLcm(input: string, kind: "gcd" | "lcm", values: bigint[]): Solution {
  if (values.length < 2)
    throw new MathError(
      "invalid-input",
      `${kind === "gcd" ? "FPB" : "KPK"} membutuhkan minimal dua bilangan.`,
      { module: "number-theory" },
    );
  values.forEach(guardDigits);
  if (values.some((v) => v === 0n) && kind === "lcm")
    throw new MathError(
      "domain-error",
      "KPK dengan 0 tidak didefinisikan secara bermakna (hasilnya 0).",
      { module: "number-theory" },
    );
  const steps: Step[] = [];
  const tables: TableData[] = [];
  let g = bigAbs(values[0]);
  // Euclid for each consecutive pair
  for (let i = 1; i < values.length; i++) {
    let a = g;
    let b = bigAbs(values[i]);
    const rows: string[][] = [];
    const start = [a, b];
    while (b !== 0n) {
      const q = a / b;
      const r = a % b;
      rows.push([a.toString(), b.toString(), q.toString(), r.toString()]);
      a = b;
      b = r;
    }
    tables.push({
      caption: `Algoritma Euklides untuk (${start[0]}, ${start[1]})`,
      headers: ["a", "b", "hasil bagi", "sisa"],
      rows,
    });
    steps.push({
      title: `Algoritma Euklides: FPB(${start[0]}, ${start[1]})`,
      after: `\\gcd(${start[0]}, ${start[1]}) = ${a}`,
      operation: "euclid",
      rule: {
        id: "euclid",
        name: "Algoritma Euklides",
        formula: "\\gcd(a, b) = \\gcd(b, a \\bmod b),\\ \\gcd(a, 0) = a",
      },
      reason: `Bagi berulang: ${rows.map((r) => `${r[0]} = ${r[2]}·${r[1]} + ${r[3]}`).join("; ")}.`,
    });
    g = a;
  }
  let result = g;
  if (kind === "lcm") {
    let l = bigAbs(values[0]);
    for (let i = 1; i < values.length; i++) {
      const b = bigAbs(values[i]);
      const gg = bigGcd(l, b);
      const nl = (l / gg) * b;
      steps.push({
        title: `KPK(${l}, ${b}) = ${l}·${b} / FPB`,
        after: `\\operatorname{KPK}(${l}, ${b}) = \\frac{${l} \\cdot ${b}}{${gg}} = ${nl}`,
        operation: "lcm-formula",
        rule: {
          id: "lcm",
          name: "Hubungan KPK dan FPB",
          formula: "\\operatorname{KPK}(a, b) = \\frac{|ab|}{\\operatorname{FPB}(a, b)}",
        },
        reason: "KPK dihitung dari FPB.",
      });
      l = nl;
    }
    result = l;
  }
  // alternative: prime factorization
  const small = values.every((v) => bigAbs(v).toString().length <= 30 && v !== 0n);
  const alternatives = [];
  if (small) {
    const facs = values.map((v) => factorInteger(v));
    const primes = [...new Set(facs.flatMap((f) => f.map(([p]) => p)))].sort((a, b) =>
      a < b ? -1 : 1,
    );
    const pick = primes
      .map((p) => {
        const exps = facs.map((f) => f.find(([q]) => q === p)?.[1] ?? 0);
        return [p, kind === "gcd" ? Math.min(...exps) : Math.max(...exps)] as [bigint, number];
      })
      .filter(([, e]) => e > 0);
    alternatives.push({
      name: "Faktorisasi prima",
      description:
        kind === "gcd"
          ? "Ambil faktor prima persekutuan dengan pangkat terkecil."
          : "Ambil semua faktor prima dengan pangkat terbesar.",
      steps: [
        ...values.map((v, i) => ({
          title: `Faktorisasi ${v}`,
          after: `${bigAbs(v)} = ${factorLatex(facs[i]) || "1"}`,
          operation: "factor",
          reason: "Pembagian berulang dengan bilangan prima.",
        })),
        {
          title:
            kind === "gcd"
              ? "Pangkat terkecil dari faktor persekutuan"
              : "Pangkat terbesar dari setiap faktor",
          after: `${factorLatex(pick) || "1"} = ${result}`,
          operation: "combine",
          reason:
            kind === "gcd"
              ? "FPB memuat faktor prima yang muncul di semua bilangan."
              : "KPK memuat setiap faktor prima yang muncul.",
        },
      ] as Step[],
    });
  }
  const checks: VerificationCheck[] = [];
  if (kind === "gcd") {
    checks.push({
      description: `${result} membagi habis semua bilangan`,
      passed: values.every((v) => result === 0n || v % result === 0n),
      method: "Pembagian eksak",
    });
    if (values.length === 2 && result !== 0n) {
      const { x, y } = extendedGcd(values[0], values[1]);
      checks.push({
        description: "Identitas Bézout: a·x + b·y = FPB",
        latex: `${values[0]} \\cdot (${x}) + ${values[1]} \\cdot (${y}) = ${values[0] * x + values[1] * y}`,
        passed: bigAbs(values[0] * x + values[1] * y) === result,
        method: "Algoritma Euklides diperluas",
      });
    }
  } else {
    checks.push({
      description: `${result} habis dibagi semua bilangan`,
      passed: values.every((v) => result % bigAbs(v) === 0n),
      method: "Pembagian eksak",
    });
    checks.push({
      description:
        "Tidak ada kelipatan persekutuan yang lebih kecil (KPK·FPB = |a·b| untuk dua bilangan)",
      passed:
        values.length !== 2 ||
        result * bigGcd(values[0], values[1]) === bigAbs(values[0] * values[1]),
      method: "Identitas KPK–FPB",
    });
  }
  const answers: Answer[] = [
    {
      label: kind === "gcd" ? "FPB" : "KPK",
      latex: result.toString(),
      text: result.toString(),
      exact: true,
    },
  ];
  return makeSolution({
    kind: "number-theory",
    title:
      kind === "gcd" ? "FPB (Faktor Persekutuan Terbesar)" : "KPK (Kelipatan Persekutuan Terkecil)",
    input,
    inputLatex: `${kind === "gcd" ? "\\operatorname{FPB}" : "\\operatorname{KPK}"}(${values.join(", ")})`,
    answers,
    method: {
      name: kind === "gcd" ? "Algoritma Euklides" : "KPK = |ab| / FPB",
      description: "Algoritma Euklides efisien untuk bilangan besar.",
    },
    steps,
    verification: aggregateVerification(checks),
    module: "number-theory",
    alternatives,
    tables,
    references: [REFERENCES.rosen],
  });
}

export function solvePrimeFactorization(input: string, n0: bigint | number): Solution {
  const n = parseIntArg(n0);
  guardDigits(n);
  if (n === 0n || bigAbs(n) === 1n)
    throw new MathError("domain-error", `${n} tidak memiliki faktorisasi prima.`, {
      module: "number-theory",
      cause: "Faktorisasi prima didefinisikan untuk bilangan bulat |n| ≥ 2.",
    });
  const fs = factorInteger(n);
  const steps: Step[] = [];
  let m = bigAbs(n);
  const rows: string[][] = [];
  for (const [p, e] of fs) {
    for (let k = 0; k < e; k++) {
      rows.push([m.toString(), p.toString(), (m / p).toString()]);
      m /= p;
    }
  }
  const bigFactor = fs.some(([p]) => p > 1000000n);
  steps.push({
    title: bigFactor
      ? "Faktorisasi dengan pembagian percobaan dan metode Pollard rho"
      : "Bagi berulang dengan bilangan prima terkecil",
    after: `${bigAbs(n)} = ${factorLatex(fs)}`,
    operation: "prime-factorization",
    rule: {
      id: "fta",
      name: "Teorema dasar aritmetika",
      formula: "n = p_1^{e_1} p_2^{e_2} \\cdots p_k^{e_k} \\text{ (tunggal)}",
    },
    reason:
      rows.length <= 40
        ? rows.map((r) => `${r[0]} ÷ ${r[1]} = ${r[2]}`).join("; ")
        : "Faktor besar ditemukan dengan algoritma Pollard rho (Brent).",
  });
  const product = fs.reduce((acc, [p, e]) => acc * p ** BigInt(e), 1n);
  const checks: VerificationCheck[] = [
    {
      description: "Hasil kali faktor sama dengan bilangan semula",
      latex: `${factorLatex(fs)} = ${product}`,
      passed: product === bigAbs(n),
      method: "Perkalian eksak",
    },
    {
      description: "Setiap faktor adalah bilangan prima",
      passed: fs.every(([p]) => isProbablePrime(p)),
      method: fs.every(([p]) => p < MR_DETERMINISTIC_BOUND)
        ? "Uji Miller–Rabin deterministik"
        : "Uji Miller–Rabin (probabilistik untuk bilangan sangat besar)",
    },
  ];
  const numDiv = fs.reduce((acc, [, e]) => acc * (e + 1), 1);
  return makeSolution({
    kind: "number-theory",
    title: "Faktorisasi prima",
    input,
    inputLatex: String(n),
    answers: [
      {
        label: "Faktorisasi prima",
        latex: `${n < 0n ? "-" : ""}${factorLatex(fs)}`,
        text: `${n < 0n ? "-" : ""}${fs.map(([p, e]) => (e === 1 ? `${p}` : `${p}^${e}`)).join(" × ")}`,
        exact: true,
      },
      { label: "Banyak pembagi positif", latex: String(numDiv), text: String(numDiv), exact: true },
    ],
    method: {
      name: "Pembagian percobaan (trial division)",
      description:
        "Bagi dengan bilangan prima terkecil secara berulang; faktor besar dicari dengan Pollard rho.",
    },
    steps,
    verification: aggregateVerification(checks),
    module: "number-theory",
    tables:
      rows.length <= 60
        ? [
            {
              caption: "Pohon faktor (pembagian berulang)",
              headers: ["n", "dibagi prima", "hasil"],
              rows,
            },
          ]
        : undefined,
    references: [REFERENCES.rosen],
  });
}

export function solveIsPrime(input: string, n0: bigint | number): Solution {
  const n = parseIntArg(n0);
  guardDigits(n);
  const steps: Step[] = [];
  let prime: boolean;
  let method: string;
  if (n < 2n) {
    prime = false;
    method = "Definisi";
    steps.push({
      title: "Bilangan prima didefinisikan untuk n ≥ 2",
      after: `${n} \\text{ bukan prima}`,
      operation: "definition",
      reason:
        "Bilangan prima adalah bilangan asli > 1 yang hanya habis dibagi 1 dan dirinya sendiri.",
    });
  } else if (n < 10n ** 12n) {
    const limit = bigIntRoot(n, 2);
    let found: bigint | null = null;
    for (let d = 2n; d <= limit; d += d === 2n ? 1n : 2n) {
      if (n % d === 0n) {
        found = d;
        break;
      }
    }
    prime = found === null;
    method = "Pembagian percobaan hingga √n";
    steps.push({
      title: `Uji pembagi hingga ⌊√${n}⌋ = ${limit}`,
      after: prime
        ? `\\text{tidak ada pembagi} \\Rightarrow ${n} \\text{ prima}`
        : `${n} = ${found} \\times ${n / found!}`,
      operation: "trial-division",
      rule: {
        id: "sqrt-bound",
        name: "Batas √n",
        formula: "n \\text{ komposit} \\Rightarrow \\exists d \\le \\sqrt{n},\\ d \\mid n",
      },
      reason: "Jika n komposit, salah satu faktornya pasti ≤ √n.",
    });
  } else {
    prime = isProbablePrime(n);
    method =
      n < MR_DETERMINISTIC_BOUND
        ? "Miller–Rabin deterministik (13 basis prima pertama)"
        : "Miller–Rabin (probabilistik)";
    steps.push({
      title: "Uji Miller–Rabin",
      after: prime ? `${n} \\text{ prima}` : `${n} \\text{ komposit}`,
      operation: "miller-rabin",
      rule: {
        id: "miller-rabin",
        name: "Uji keprimaan Miller–Rabin",
        formula: "n - 1 = 2^s d,\\ a^d \\equiv 1 \\text{ atau } a^{2^r d} \\equiv -1 \\pmod n",
      },
      reason:
        n < MR_DETERMINISTIC_BOUND
          ? "Untuk n < 3,3·10²⁴ pengujian dengan basis 2, 3, …, 41 bersifat deterministik (Sorenson & Webster, 2017)."
          : "Untuk bilangan sebesar ini hasil 'prima' bersifat probabilistik (peluang salah sangat kecil).",
    });
  }
  const checks: VerificationCheck[] = [];
  if (!prime && n >= 2n) {
    const f = factorInteger(n);
    checks.push({
      description: "Faktor nontrivial ditemukan",
      latex: `${n} = ${factorLatex(f)}`,
      passed: f.length > 1 || f[0][1] > 1,
      method: "Faktorisasi",
    });
  } else if (prime) {
    checks.push({
      description: "Konsistensi dengan uji Miller–Rabin",
      passed: isProbablePrime(n),
      method: "Uji independen",
    });
  }
  return makeSolution({
    kind: "number-theory",
    title: "Uji bilangan prima",
    input,
    inputLatex: String(n),
    answers: [
      {
        label: "Hasil",
        latex: prime ? `${n} \\text{ adalah bilangan prima}` : `${n} \\text{ bukan bilangan prima}`,
        text: prime ? "prima" : "bukan prima",
        exact: true,
      },
    ],
    method: { name: method, description: "" },
    steps,
    verification: aggregateVerification(checks, "Kesimpulan berasal dari definisi."),
    module: "number-theory",
    references: [REFERENCES.rosen],
  });
}

export function solveDivisors(input: string, n0: bigint | number): Solution {
  const n = parseIntArg(n0);
  guardDigits(n);
  if (n === 0n)
    throw new MathError(
      "domain-error",
      "Setiap bilangan bulat membagi 0; himpunan pembagi tak hingga.",
      { module: "number-theory" },
    );
  const ds = divisors(n);
  if (ds.length > 2000)
    throw new MathError("limit-exceeded", "Terlalu banyak pembagi untuk ditampilkan.", {
      module: "number-theory",
    });
  const fs = factorInteger(n);
  return makeSolution({
    kind: "number-theory",
    title: "Pembagi positif",
    input,
    inputLatex: String(n),
    answers: [
      {
        label: `Pembagi (${ds.length})`,
        latex: `\\{${ds.join(", ")}\\}`,
        text: ds.join(", "),
        exact: true,
      },
      {
        label: "Jumlah pembagi σ(n)",
        latex: ds.reduce((a, b) => a + b, 0n).toString(),
        text: ds.reduce((a, b) => a + b, 0n).toString(),
        exact: true,
      },
    ],
    method: {
      name: "Kombinasi faktor prima",
      description: "Setiap pembagi berbentuk p₁^a₁ ⋯ pₖ^aₖ dengan 0 ≤ aᵢ ≤ eᵢ.",
    },
    steps: [
      {
        title: "Faktorisasi prima",
        after: `${bigAbs(n)} = ${factorLatex(fs)}`,
        operation: "factor",
        reason: "Pembagi disusun dari faktor prima.",
      },
      {
        title: "Susun semua kombinasi pangkat",
        after: `d(n) = ${fs.map(([, e]) => `(${e}+1)`).join("")} = ${ds.length}`,
        operation: "divisors",
        rule: { id: "divisor-count", name: "Banyak pembagi", formula: "d(n) = \\prod (e_i + 1)" },
        reason: "Setiap pangkat dipilih bebas dari 0 sampai eᵢ.",
      },
    ],
    verification: aggregateVerification([
      {
        description: "Setiap bilangan dalam daftar membagi habis n",
        passed: ds.every((d) => n % d === 0n),
        method: "Pembagian eksak",
      },
      {
        description: "Banyak pembagi sesuai rumus ∏(eᵢ+1)",
        passed: ds.length === fs.reduce((a, [, e]) => a * (e + 1), 1),
        method: "Rumus independen",
      },
    ]),
    module: "number-theory",
    references: [REFERENCES.rosen],
  });
}

export function solveModInverse(input: string, a: bigint, m: bigint): Solution {
  if (m <= 1n)
    throw new MathError("invalid-input", "Modulus harus lebih besar dari 1.", {
      module: "number-theory",
    });
  const { g, x } = extendedGcd(((a % m) + m) % m, m);
  if (g !== 1n)
    throw new MathError(
      "no-solution",
      `Invers modular tidak ada karena FPB(${a}, ${m}) = ${g} ≠ 1.`,
      { module: "number-theory" },
    );
  const inv = ((x % m) + m) % m;
  return makeSolution({
    kind: "number-theory",
    title: "Invers modular",
    input,
    inputLatex: `${a}^{-1} \\pmod{${m}}`,
    answers: [{ label: "Invers", latex: inv.toString(), text: inv.toString(), exact: true }],
    method: { name: "Algoritma Euklides diperluas", description: "Cari x dengan a·x ≡ 1 (mod m)." },
    steps: [
      {
        title: "Algoritma Euklides diperluas",
        after: `${a} \\cdot ${x} + ${m} \\cdot y = 1 \\Rightarrow ${a}^{-1} \\equiv ${inv} \\pmod{${m}}`,
        operation: "extended-euclid",
        rule: { id: "bezout", name: "Identitas Bézout", formula: "ax + my = \\gcd(a, m)" },
        reason: "Jika FPB = 1, koefisien x adalah invers a modulo m.",
      },
    ],
    verification: aggregateVerification([
      {
        description: `${a} · ${inv} ≡ 1 (mod ${m})`,
        passed: (((a * inv) % m) + m) % m === 1n,
        method: "Aritmetika modular eksak",
      },
    ]),
    module: "number-theory",
    references: [REFERENCES.rosen],
  });
}

export function solveModPow(input: string, a: bigint, e: bigint, m: bigint): Solution {
  if (m <= 0n)
    throw new MathError("invalid-input", "Modulus harus positif.", { module: "number-theory" });
  if (e < 0n)
    throw new MathError("invalid-input", "Eksponen harus tak negatif.", {
      module: "number-theory",
    });
  const result = modPow(a, e, m);
  const bits = e.toString(2);
  const rows: string[][] = [];
  let acc = 1n;
  let base = ((a % m) + m) % m;
  for (let i = bits.length - 1; i >= 0; i--) {
    const bit = bits[i];
    if (bit === "1") acc = (acc * base) % m;
    rows.push([String(bits.length - 1 - i), bit, base.toString(), acc.toString()]);
    base = (base * base) % m;
  }
  return makeSolution({
    kind: "number-theory",
    title: "Perpangkatan modular",
    input,
    inputLatex: `${a}^{${e}} \\bmod ${m}`,
    answers: [{ label: "Hasil", latex: result.toString(), text: result.toString(), exact: true }],
    method: {
      name: "Kuadrat dan kali berulang (square-and-multiply)",
      description:
        "Eksponen ditulis dalam biner; kuadratkan basis di setiap bit dan kalikan bila bit = 1.",
    },
    steps: [
      {
        title: `Tulis eksponen dalam biner: ${e} = ${bits}₂`,
        after: `${a}^{${e}} \\bmod ${m} = ${result}`,
        operation: "square-multiply",
        rule: {
          id: "square-multiply",
          name: "Square-and-multiply",
          formula: "a^{2k} = (a^k)^2,\\ a^{2k+1} = a \\cdot (a^k)^2",
        },
        reason: `${bits.length} kuadrat modular.`,
      },
    ],
    verification: aggregateVerification(
      e < 5000n
        ? [
            {
              description: "Hitung langsung aᵉ lalu mod m",
              passed: ((a ** e % m) + m) % m === result,
              method: "Perhitungan langsung eksak",
            },
          ]
        : [],
    ),
    module: "number-theory",
    tables:
      rows.length <= 64
        ? [
            {
              caption: "Iterasi square-and-multiply",
              headers: ["bit ke-", "bit", "basis^(2^k) mod m", "akumulator"],
              rows,
            },
          ]
        : undefined,
    references: [REFERENCES.rosen],
  });
}

export { bigLcm };
