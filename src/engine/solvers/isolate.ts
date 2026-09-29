/**
 * Isolation method: solve equations where the unknown occurs once by applying inverse
 * operations to both sides. Branches (±, periodic families, |u| = c) are tracked
 * explicitly together with the conditions under which each step is valid.
 */
import { Rational } from "../core/rational";
import { toLatex } from "../expr/print";
import { add, div, fn, mul, neg, num, pow, sub, E, PI, ZERO, constantSign, frac } from "../expr/simplify";
import { containsSymbol, isConstantExpr, rawSym, type Expr } from "../expr/types";
import { evalReal } from "../expr/evaluate";
import type { Step } from "../steps/types";

export const PERIOD_SYMBOL = "k";

export interface IsolationBranch {
  value: Expr;
  steps: Step[];
  conditions: string[];
  periodic: boolean;
}

export interface IsolationResult {
  branches: IsolationBranch[];
  noSolution: string[];
}

interface State {
  L: Expr;
  R: Expr;
  steps: Step[];
  conditions: string[];
  periodic: boolean;
}

const eqLatex = (L: Expr, R: Expr) => `${toLatex(L)} = ${toLatex(R)}`;

function isNumericConstant(e: Expr): boolean {
  return isConstantExpr(e) && !containsSymbol(e, PERIOD_SYMBOL);
}

/** Numeric value of a constant expression (NaN if not constant). */
function value(e: Expr): number {
  return isNumericConstant(e) ? evalReal(e) : NaN;
}

function describeTerm(e: Expr): string {
  return toLatex(e);
}

const K = rawSym(PERIOD_SYMBOL);

export function isolate(L0: Expr, R0: Expr, x: string, maxBranches = 8): IsolationResult | null {
  const queue: State[] = [{ L: L0, R: R0, steps: [], conditions: [], periodic: false }];
  const done: IsolationBranch[] = [];
  const noSolution: string[] = [];
  let guard = 0;
  while (queue.length) {
    if (++guard > 200) return null;
    const s = queue.shift()!;
    let { L, R } = s;
    if (!containsSymbol(L, x) && containsSymbol(R, x)) {
      [L, R] = [R, L];
      s.steps.push({ title: "Tukar kedua ruas", after: eqLatex(L, R), operation: "swap-sides", reason: "Agar variabel berada di ruas kiri.", rule: { id: "symmetry", name: "Sifat simetri kesamaan", formula: "a = b \\iff b = a" } });
    }
    if (containsSymbol(R, x)) return null;
    if (L.type === "sym" && L.name === x) {
      done.push({ value: R, steps: s.steps, conditions: s.conditions, periodic: s.periodic });
      continue;
    }
    const before = eqLatex(L, R);
    const push = (nL: Expr, nR: Expr, step: Omit<Step, "before" | "after">, extra: Partial<Pick<State, "conditions" | "periodic">> = {}) => {
      queue.push({
        L: nL,
        R: nR,
        steps: [...s.steps, { ...step, before, after: eqLatex(nL, nR) }],
        conditions: [...s.conditions, ...(extra.conditions ?? [])],
        periodic: s.periodic || !!extra.periodic,
      });
    };
    const fail = (reason: string) => noSolution.push(reason);

    switch (L.type) {
      case "add": {
        const withX = L.terms.filter((t) => containsSymbol(t, x));
        if (withX.length !== 1) return null;
        const others = L.terms.filter((t) => !containsSymbol(t, x));
        const o = add(...others);
        const negative = constantSign(o) === -1 || (o.type === "mul" && o.factors[0].type === "num" && o.factors[0].value.isNegative());
        push(withX[0], sub(R, o), {
          title: negative ? `Tambahkan ${describeTerm(neg(o))} ke kedua ruas` : `Kurangi kedua ruas dengan ${describeTerm(o)}`,
          operation: negative ? "add-both-sides" : "subtract-both-sides",
          rule: { id: "add-both", name: "Sifat penjumlahan kesamaan", formula: "a = b \\iff a + c = b + c" },
          reason: "Suku yang tidak memuat variabel dipindahkan ke ruas kanan.",
        });
        break;
      }
      case "mul": {
        const withX = L.factors.filter((f) => containsSymbol(f, x));
        if (withX.length !== 1) return null;
        const other = L.factors.filter((f) => !containsSymbol(f, x));
        const o = other.length === 1 ? other[0] : mul(...other);
        const isReciprocal =
          (o.type === "pow" && o.exp.type === "num" && o.exp.value.isMinusOne()) ||
          (o.type === "num" && (o.value.num === 1n || o.value.num === -1n) && o.value.den !== 1n);
        const cond: string[] = [];
        if (!isNumericConstant(o)) cond.push(`${toLatex(o)} \\ne 0`);
        push(withX[0], div(R, o), {
          title: isReciprocal ? `Kalikan kedua ruas dengan ${describeTerm(div(num(1), o))}` : `Bagi kedua ruas dengan ${describeTerm(o)}`,
          operation: isReciprocal ? "multiply-both-sides" : "divide-both-sides",
          rule: { id: "mul-both", name: "Sifat perkalian kesamaan", formula: "a = b \\iff \\frac{a}{c} = \\frac{b}{c},\\ c \\ne 0" },
          reason: "Faktor yang tidak memuat variabel dihilangkan dari ruas kiri.",
        }, { conditions: cond });
        break;
      }
      case "pow": {
        const baseHasX = containsSymbol(L.base, x);
        const expHasX = containsSymbol(L.exp, x);
        if (baseHasX && expHasX) return null;
        if (baseHasX) {
          if (L.exp.type !== "num") return null;
          const n = L.exp.value;
          const rv = value(R);
          if (n.isInteger()) {
            const ni = Number(n.num);
            if (ni < 0) {
              if (R.type === "num" && R.value.isZero()) {
                fail(`${eqLatex(L, R)}: bentuk pecahan dengan pembilang 1 tidak pernah bernilai 0.`);
                break;
              }
              push(pow(L.base, num(-ni)), div(num(1), R), {
                title: "Ambil kebalikan kedua ruas",
                operation: "reciprocal-both-sides",
                rule: { id: "reciprocal", name: "Kebalikan kedua ruas", formula: "a = b \\iff \\frac{1}{a} = \\frac{1}{b},\\ a, b \\ne 0" },
                reason: "Pangkat negatif berarti pecahan; kedua ruas dibalik.",
              });
              break;
            }
            if (ni % 2 === 1) {
              push(L.base, pow(R, frac(1, ni)), {
                title: `Tarik akar pangkat ${ni} dari kedua ruas`,
                operation: "odd-root",
                rule: { id: "odd-root", name: "Akar pangkat ganjil", formula: "u^{n} = c \\iff u = \\sqrt[n]{c}\\ (n \\text{ ganjil})" },
                reason: "Pangkat ganjil bersifat satu-satu pada bilangan real, sehingga hanya ada satu akar real.",
              });
              break;
            }
            // even power
            if (!Number.isNaN(rv) && rv < -1e-15) {
              fail(`${eqLatex(L, R)}: bilangan real yang dipangkatkan genap tidak mungkin bernilai negatif.`);
              break;
            }
            const root = pow(R, frac(1, ni));
            const rule = { id: "even-root", name: "Sifat akar kuadrat / akar genap", formula: "u^{2} = c \\iff u = \\pm\\sqrt{c},\\ c \\ge 0" };
            const cond = Number.isNaN(rv) ? [`${toLatex(R)} \\ge 0`] : [];
            if (R.type === "num" && R.value.isZero()) {
              push(L.base, ZERO, { title: `Tarik akar pangkat ${ni}`, operation: "even-root", rule, reason: "Satu-satunya bilangan yang pangkat genapnya 0 adalah 0." });
            } else {
              push(L.base, root, { title: `Tarik akar pangkat ${ni} (cabang positif)`, operation: "even-root-plus", rule, reason: "Pangkat genap memiliki dua akar real: positif dan negatif." }, { conditions: cond });
              push(L.base, neg(root), { title: `Tarik akar pangkat ${ni} (cabang negatif)`, operation: "even-root-minus", rule, reason: "Pangkat genap memiliki dua akar real: positif dan negatif." }, { conditions: cond });
            }
            break;
          }
          // rational exponent p/q
          const p = n.num;
          const q = n.den;
          if (q % 2n === 0n && !Number.isNaN(rv) && rv < -1e-15) {
            fail(`${eqLatex(L, R)}: akar pangkat genap dari bilangan real selalu tak negatif.`);
            break;
          }
          const inv = Rational.of(q, p < 0n ? -p : p);
          const raised = pow(p < 0n ? div(num(1), R) : R, num(inv));
          const title = n.num === 1n && q === 2n ? "Kuadratkan kedua ruas" : `Pangkatkan kedua ruas dengan ${inv.toString()}`;
          const rule = { id: "raise-power", name: "Memangkatkan kedua ruas", formula: "\\sqrt{u} = c \\Rightarrow u = c^{2}", conditions: "Dapat memunculkan solusi palsu; setiap kandidat harus diperiksa pada persamaan awal." };
          const cond = q % 2n === 0n && Number.isNaN(rv) ? [`${toLatex(R)} \\ge 0`] : [];
          if (p % 2n === 0n) {
            push(L.base, raised, { title: `${title} (cabang positif)`, operation: "raise-power", rule, reason: "Menghilangkan akar/pangkat pecahan." }, { conditions: cond });
            push(L.base, neg(raised), { title: `${title} (cabang negatif)`, operation: "raise-power", rule, reason: "Menghilangkan akar/pangkat pecahan." }, { conditions: cond });
          } else {
            push(L.base, raised, { title, operation: "raise-power", rule, reason: "Menghilangkan akar/pangkat pecahan dari ruas kiri." }, { conditions: cond });
          }
          break;
        }
        // exponent contains x
        const b = L.base;
        const bv = value(b);
        if (Number.isNaN(bv) || bv <= 0 || bv === 1) return null;
        const rv = value(R);
        if (!Number.isNaN(rv) && rv <= 0) {
          fail(`${eqLatex(L, R)}: fungsi eksponensial dengan basis positif selalu bernilai positif.`);
          break;
        }
        const isE = b.type === "sym" && b.name === "e";
        const logR = isE ? fn("ln", R) : fn("log", R, b);
        push(L.exp, logR, {
          title: isE ? "Ambil logaritma natural (ln) kedua ruas" : `Ambil logaritma basis ${toLatex(b)} kedua ruas`,
          operation: "take-log",
          rule: { id: "log-def", name: "Definisi logaritma", formula: "b^{u} = c \\iff u = \\log_{b} c,\\ b > 0,\\ b \\ne 1,\\ c > 0" },
          reason: "Logaritma adalah invers dari eksponensial.",
        }, { conditions: Number.isNaN(rv) ? [`${toLatex(R)} > 0`] : [] });
        break;
      }
      case "fn": {
        if (L.args.length === 0) return null;
        const argIdx = L.args.findIndex((a) => containsSymbol(a, x));
        if (L.args.some((a, i) => i !== argIdx && containsSymbol(a, x))) return null;
        const u = L.args[argIdx];
        const rv = value(R);
        const rule = (id: string, name: string, formula: string) => ({ id, name, formula });
        switch (L.name) {
          case "ln":
            push(u, pow(E, R), { title: "Terapkan fungsi eksponensial pada kedua ruas", operation: "exponentiate", rule: rule("ln-def", "Definisi logaritma natural", "\\ln u = c \\iff u = e^{c}"), reason: "Fungsi e^x adalah invers dari ln x." });
            break;
          case "log": {
            const b = L.args[1] ?? num(10);
            if (argIdx !== 0) return null;
            push(u, pow(b, R), { title: `Tulis dalam bentuk eksponen basis ${toLatex(b)}`, operation: "exponentiate", rule: rule("log-def", "Definisi logaritma", "\\log_{b} u = c \\iff u = b^{c}"), reason: "Logaritma basis b adalah invers dari b^x." });
            break;
          }
          case "sin":
          case "cos": {
            if (!Number.isNaN(rv) && Math.abs(rv) > 1 + 1e-15) {
              fail(`${eqLatex(L, R)}: nilai ${L.name} selalu berada di antara −1 dan 1.`);
              break;
            }
            const period = mul(num(2), PI, K);
            const r = L.name === "sin" ? rule("sin-general", "Solusi umum persamaan sinus", "\\sin u = \\sin\\alpha \\iff u = \\alpha + 2k\\pi \\ \\lor\\ u = \\pi - \\alpha + 2k\\pi") : rule("cos-general", "Solusi umum persamaan kosinus", "\\cos u = \\cos\\alpha \\iff u = \\pm\\alpha + 2k\\pi");
            const alpha = fn(L.name === "sin" ? "asin" : "acos", R);
            const b1 = add(alpha, period);
            const b2 = L.name === "sin" ? add(sub(PI, alpha), period) : add(neg(alpha), period);
            const reason = `Fungsi ${L.name} periodik dengan periode 2π, sehingga ada tak hingga banyak solusi (k bilangan bulat).`;
            push(u, b1, { title: `Gunakan invers ${L.name} dan periodisitas`, operation: "inverse-trig", rule: r, reason }, { periodic: true });
            if (toLatex(b1) !== toLatex(b2)) push(u, b2, { title: `Cabang kedua solusi ${L.name}`, operation: "inverse-trig", rule: r, reason }, { periodic: true });
            break;
          }
          case "tan":
            push(u, add(fn("atan", R), mul(PI, K)), { title: "Gunakan invers tangen dan periodisitas", operation: "inverse-trig", rule: rule("tan-general", "Solusi umum persamaan tangen", "\\tan u = \\tan\\alpha \\iff u = \\alpha + k\\pi"), reason: "Fungsi tan periodik dengan periode π." }, { periodic: true });
            break;
          case "cot":
            if (R.type === "num" && R.value.isZero()) push(u, add(div(PI, num(2)), mul(PI, K)), { title: "cot u = 0", operation: "inverse-trig", reason: "cot u = 0 tepat ketika cos u = 0." }, { periodic: true });
            else push(u, add(fn("atan", div(num(1), R)), mul(PI, K)), { title: "Ubah ke tangen lalu gunakan invers", operation: "inverse-trig", rule: rule("cot", "Identitas kotangen", "\\cot u = c \\iff \\tan u = \\frac{1}{c}"), reason: "cot u = 1/tan u." }, { periodic: true });
            break;
          case "sec":
            push(fn("cos", u), div(num(1), R), { title: "Ubah sekan menjadi kosinus", operation: "reciprocal-trig", reason: "sec u = 1/cos u.", rule: rule("sec", "Identitas sekan", "\\sec u = \\frac{1}{\\cos u}") });
            break;
          case "csc":
            push(fn("sin", u), div(num(1), R), { title: "Ubah kosekan menjadi sinus", operation: "reciprocal-trig", reason: "csc u = 1/sin u.", rule: rule("csc", "Identitas kosekan", "\\csc u = \\frac{1}{\\sin u}") });
            break;
          case "asin":
            if (!Number.isNaN(rv) && Math.abs(rv) > Math.PI / 2 + 1e-12) {
              fail(`${eqLatex(L, R)}: nilai arcsin berada pada [−π/2, π/2].`);
              break;
            }
            push(u, fn("sin", R), { title: "Terapkan sinus pada kedua ruas", operation: "apply-inverse", reason: "sin adalah invers arcsin pada daerah hasil arcsin." });
            break;
          case "acos":
            if (!Number.isNaN(rv) && (rv < -1e-12 || rv > Math.PI + 1e-12)) {
              fail(`${eqLatex(L, R)}: nilai arccos berada pada [0, π].`);
              break;
            }
            push(u, fn("cos", R), { title: "Terapkan kosinus pada kedua ruas", operation: "apply-inverse", reason: "cos adalah invers arccos pada daerah hasil arccos." });
            break;
          case "atan":
            if (!Number.isNaN(rv) && Math.abs(rv) >= Math.PI / 2) {
              fail(`${eqLatex(L, R)}: nilai arctan berada pada (−π/2, π/2).`);
              break;
            }
            push(u, fn("tan", R), { title: "Terapkan tangen pada kedua ruas", operation: "apply-inverse", reason: "tan adalah invers arctan." });
            break;
          case "abs": {
            if (!Number.isNaN(rv) && rv < -1e-15) {
              fail(`${eqLatex(L, R)}: nilai mutlak tidak pernah negatif.`);
              break;
            }
            const r = rule("abs-eq", "Persamaan nilai mutlak", "|u| = c \\iff u = c \\lor u = -c,\\ c \\ge 0");
            const cond = Number.isNaN(rv) ? [`${toLatex(R)} \\ge 0`] : [];
            if (R.type === "num" && R.value.isZero()) push(u, ZERO, { title: "|u| = 0 berarti u = 0", operation: "abs-zero", rule: r, reason: "Hanya 0 yang nilai mutlaknya 0." });
            else {
              push(u, R, { title: "Kasus positif dari nilai mutlak", operation: "abs-case", rule: r, reason: "Isi nilai mutlak bisa bernilai c atau −c." }, { conditions: cond });
              push(u, neg(R), { title: "Kasus negatif dari nilai mutlak", operation: "abs-case", rule: r, reason: "Isi nilai mutlak bisa bernilai c atau −c." }, { conditions: cond });
            }
            break;
          }
          case "sinh":
            push(u, fn("asinh", R), { title: "Terapkan arsinh", operation: "apply-inverse", reason: "sinh bersifat satu-satu." });
            break;
          case "tanh":
            if (!Number.isNaN(rv) && Math.abs(rv) >= 1) {
              fail(`${eqLatex(L, R)}: nilai tanh berada pada (−1, 1).`);
              break;
            }
            push(u, fn("atanh", R), { title: "Terapkan artanh", operation: "apply-inverse", reason: "tanh bersifat satu-satu." });
            break;
          case "cosh":
            if (!Number.isNaN(rv) && rv < 1) {
              fail(`${eqLatex(L, R)}: nilai cosh selalu ≥ 1.`);
              break;
            }
            push(u, fn("acosh", R), { title: "Terapkan arcosh (cabang positif)", operation: "apply-inverse", reason: "cosh genap; ada dua solusi ±arcosh(c)." });
            push(u, neg(fn("acosh", R)), { title: "Terapkan arcosh (cabang negatif)", operation: "apply-inverse", reason: "cosh genap; ada dua solusi ±arcosh(c)." });
            break;
          default:
            return null;
        }
        break;
      }
      default:
        return null;
    }
    if (queue.length + done.length > maxBranches) return null;
  }
  return { branches: done, noSolution };
}
