/** Input syntax guide. Every example is solved in tests (src/lib/guide.test.ts). */
export interface GuideRow {
  syntax: string;
  meaning: string;
  example: string;
}

export interface GuideSection {
  title: string;
  note?: string;
  rows: GuideRow[];
}

export const GUIDE: GuideSection[] = [
  {
    title: "Operasi dasar",
    note: "Perkalian boleh ditulis tanpa tanda: 2x, 3(x + 1), x y. Gunakan titik untuk desimal (2.5).",
    rows: [
      { syntax: "+  -  *  /", meaning: "tambah, kurang, kali, bagi", example: "3/4 + 5/6" },
      { syntax: "^", meaning: "pangkat", example: "2^10" },
      { syntax: "sqrt(x), cbrt(x), root(x, n)", meaning: "akar kuadrat, akar pangkat tiga, akar pangkat n", example: "sqrt(72) + root(16, 4)" },
      { syntax: "abs(x) atau |x|", meaning: "nilai mutlak", example: "abs(-7) + |2 - 5|" },
      { syntax: "n!", meaning: "faktorial", example: "10!" },
      { syntax: "x%", meaning: "persen (x/100)", example: "15% * 240" },
      { syntax: "nCr(n, r), nPr(n, r)", meaning: "kombinasi dan permutasi", example: "nCr(10, 3)" },
    ],
  },
  {
    title: "Konstanta & fungsi",
    note: "Sudut tanpa tanda ° dianggap radian.",
    rows: [
      { syntax: "pi, e, i", meaning: "π, bilangan Euler, satuan imajiner", example: "e^(i pi)" },
      { syntax: "sin, cos, tan, sec, csc, cot", meaning: "fungsi trigonometri", example: "sin(pi/6) + cos(60°)" },
      { syntax: "asin, acos, atan (atau arcsin …)", meaning: "invers trigonometri", example: "atan(1)" },
      { syntax: "ln(x), log(x), log(x, b)", meaning: "logaritma natural, basis 10, basis b", example: "log(81, 3)" },
      { syntax: "exp(x)", meaning: "eˣ", example: "ln(exp(5))" },
      { syntax: "gcd, lcm (atau fpb, kpk)", meaning: "FPB dan KPK", example: "fpb(84, 36)" },
    ],
  },
  {
    title: "Aljabar & persamaan",
    note: "Kata perintah bahasa Indonesia maupun Inggris dikenali di awal soal.",
    rows: [
      { syntax: "… = …", meaning: "persamaan", example: "2x + 5 = 15" },
      { syntax: "<, >, <=, >=", meaning: "pertidaksamaan", example: "x^2 - 4 <= 0" },
      { syntax: "persamaan; persamaan", meaning: "sistem persamaan (pisahkan dengan titik koma)", example: "x + y = 5; x - y = 1" },
      { syntax: "faktorkan …", meaning: "faktorisasi", example: "faktorkan x^2 - 5x + 6" },
      { syntax: "jabarkan …", meaning: "penjabaran", example: "jabarkan (x + 1)^3" },
      { syntax: "sederhanakan …", meaning: "penyederhanaan", example: "sederhanakan (x^2 - 1)/(x - 1)" },
      { syntax: "…, x = nilai", meaning: "substitusi nilai", example: "x^2 + 3x, x = 2" },
      { syntax: "… untuk y", meaning: "selesaikan untuk variabel tertentu", example: "2x + 3y = 6 untuk y" },
    ],
  },
  {
    title: "Kalkulus",
    rows: [
      { syntax: "d/dx (…)", meaning: "turunan", example: "d/dx (x^2 sin(x))" },
      { syntax: "d^2/dx^2 (…)", meaning: "turunan kedua", example: "d^2/dx^2 (x^4)" },
      { syntax: "turunan …", meaning: "turunan (kata perintah)", example: "turunan ln(x^2 + 1)" },
      { syntax: "integral …  atau  ∫ … dx", meaning: "integral tak tentu", example: "integral x e^x" },
      { syntax: "integral from a to b of …", meaning: "integral tentu", example: "integral from 0 to pi of sin(x)" },
      { syntax: "integral … dari a sampai b", meaning: "integral tentu (bahasa Indonesia)", example: "integral x^2 dari 0 sampai 3" },
      { syntax: "lim x->a …", meaning: "limit (x->a+ / x->a- untuk sepihak, inf untuk tak hingga)", example: "lim x->inf (1 + 1/x)^x" },
      { syntax: "taylor(f, x, a, n)", meaning: "deret Taylor orde n di sekitar a", example: "taylor(cos(x), x, 0, 6)" },
      { syntax: "extrema(f)", meaning: "titik kritis dan ekstrem lokal", example: "extrema(x^3 - 12x)" },
      { syntax: "implicit(persamaan)", meaning: "turunan implisit dy/dx", example: "implicit(x^2 + y^2 = 25)" },
      { syntax: "sum(suku, k, a, b)", meaning: "notasi sigma (b boleh n atau inf)", example: "sum(k^3, k, 1, n)" },
    ],
  },
  {
    title: "Matriks & vektor",
    rows: [
      { syntax: "[[a, b], [c, d]]", meaning: "matriks (baris demi baris)", example: "[[1, 2], [3, 4]] * [[2, 0], [1, 2]]" },
      { syntax: "det, inv, transpose, rank, trace", meaning: "operasi matriks", example: "inv([[4, 7], [2, 6]])" },
      { syntax: "rref(A)", meaning: "bentuk eselon baris tereduksi", example: "rref([[1, 2, -1], [2, 3, 1], [3, 5, 0]])" },
      { syntax: "eigen(A)", meaning: "nilai & vektor eigen", example: "eigen([[2, 1], [1, 2]])" },
      { syntax: "dot, cross, norm", meaning: "operasi vektor", example: "cross([1, 0, 0], [0, 1, 0])" },
    ],
  },
  {
    title: "Teori bilangan, kompleks & statistik",
    rows: [
      { syntax: "isprime(n), primefactors(n), divisors(n)", meaning: "bilangan prima dan pembagi", example: "primefactors(2024)" },
      { syntax: "modinv(a, m), modpow(a, b, m)", meaning: "aritmetika modular", example: "modpow(3, 200, 13)" },
      { syntax: "a + bi", meaning: "bilangan kompleks", example: "(2 + 3i)(4 - i)" },
      { syntax: "angka, angka, …", meaning: "statistik deskriptif dari data", example: "4, 8, 15, 16, 23, 42" },
      { syntax: "(x, y), (x, y), …", meaning: "regresi linear dari data berpasangan", example: "(1, 2), (2, 4.1), (3, 5.9), (4, 8.2)" },
    ],
  },
];
