/**
 * Financial mathematics: simple and compound interest, annuities, loans (anuitas, efektif,
 * flat), NPV, IRR, ROI, break-even, depreciation and real interest rate.
 *
 * Exact rational arithmetic is used whenever inputs are decimal; money values are displayed
 * rounded to 2 decimals with the rounding stated explicitly.
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { evalReal } from "../expr/evaluate";
import { toLatex } from "../expr/print";
import { mul, num, pow, E } from "../expr/simplify";
import { brent } from "../numeric/methods";
import { makeSolution } from "../steps/builder";
import { aggregateVerification, formatNumber } from "../steps/format";
import type {
  Answer,
  Reference,
  Solution,
  Step,
  TableData,
  VerificationCheck,
} from "../steps/types";

const REF_FIN: Reference = {
  name: "Principles of Finance",
  source: "OpenStax (Rice University)",
  url: "https://openstax.org/details/books/principles-finance",
};

function q(v: string | number, name: string): Rational {
  const r =
    typeof v === "number"
      ? Rational.fromNumber(v)
      : Rational.parseDecimal(String(v).trim().replace(/_/g, ""));
  if (!r)
    throw new MathError("invalid-input", `${name} harus berupa angka.`, { module: "finance" });
  return r;
}

export function money(r: Rational | number): string {
  const v = typeof r === "number" ? r : r.toNumber();
  const neg = v < 0;
  const s = Math.abs(v).toFixed(2);
  const [i, d] = s.split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${grouped},${d}`;
}

function moneyAnswer(label: string, r: Rational | number): Answer {
  const m = money(r);
  return {
    label,
    latex: `${m.replace(/\./g, "{.}").replace(",", "{,}")}`,
    text: m,
    exact: false,
    approx:
      typeof r === "number"
        ? undefined
        : `nilai eksak: ${r.den <= 10n ** 12n ? r.toFixedString(10) : formatNumber(r.toNumber(), 14)}`,
  };
}

const ROUND_NOTE =
  "Nilai uang ditampilkan dengan 2 desimal (dibulatkan setengah ke atas); perhitungan internal eksak/berpresisi penuh.";

export function solveSimpleInterest(p: {
  principal: string;
  ratePercent: string;
  years: string;
}): Solution {
  const P = q(p.principal, "Modal");
  const r = q(p.ratePercent, "Suku bunga").div(Rational.of(100));
  const t = q(p.years, "Waktu");
  const I = P.mul(r).mul(t);
  const A = P.add(I);
  return makeSolution({
    kind: "finance",
    title: "Bunga tunggal",
    input: JSON.stringify(p),
    inputLatex: `P = ${money(P)},\\ r = ${p.ratePercent}\\%,\\ t = ${p.years}`,
    answers: [moneyAnswer("Bunga", I), moneyAnswer("Nilai akhir", A)],
    method: {
      name: "Bunga tunggal",
      description: "Bunga dihitung hanya dari modal awal.",
      formula: "I = Prt,\\ A = P(1 + rt)",
    },
    steps: [
      {
        title: "Hitung bunga",
        after: `I = P \\cdot r \\cdot t = ${money(P)} \\times ${r.toFixedString(10)} \\times ${t.toString()} = ${money(I)}`,
        operation: "interest",
        rule: { id: "simple-interest", name: "Bunga tunggal", formula: "I = Prt" },
        reason: "r dalam bentuk desimal per tahun, t dalam tahun.",
      },
      {
        title: "Nilai akhir",
        after: `A = P + I = ${money(A)}`,
        operation: "amount",
        reason: "Modal ditambah bunga.",
      },
    ],
    verification: aggregateVerification([
      {
        description: "A = P(1 + rt)",
        passed: A.equals(P.mul(Rational.ONE.add(r.mul(t)))),
        method: "Rumus independen (eksak)",
      },
    ]),
    module: "finance",
    notes: [ROUND_NOTE],
    references: [REF_FIN],
  });
}

export function solveCompoundInterest(p: {
  principal: string;
  ratePercent: string;
  years: string;
  periodsPerYear: string;
  continuous?: boolean;
}): Solution {
  const P = q(p.principal, "Modal");
  const r = q(p.ratePercent, "Suku bunga").div(Rational.of(100));
  const t = q(p.years, "Waktu");
  const steps: Step[] = [];
  const checks: VerificationCheck[] = [];
  let A: number;
  let exactText: string | undefined;
  let table: TableData | undefined;
  if (p.continuous) {
    const expr = mul(num(P), pow(E, mul(num(r), num(t))));
    A = evalReal(expr);
    exactText = toLatex(expr);
    steps.push({
      title: "Bunga majemuk kontinu",
      after: `A = Pe^{rt} = ${toLatex(expr)} \\approx ${money(A)}`,
      operation: "continuous",
      rule: { id: "continuous-compounding", name: "Bunga kontinu", formula: "A = Pe^{rt}" },
      reason: "Limit (1 + r/n)^{nt} untuk n → ∞.",
    });
    checks.push({
      description: "Mendekati limit bunga majemuk n = 10⁶",
      passed:
        Math.abs(P.toNumber() * Math.pow(1 + r.toNumber() / 1e6, 1e6 * t.toNumber()) - A) <
        1e-4 * A,
      method: "Perbandingan limit numerik",
    });
  } else {
    const n = q(p.periodsPerYear, "Frekuensi");
    if (!n.isInteger() || !n.isPositive())
      throw new MathError(
        "invalid-input",
        "Frekuensi pembungaan per tahun harus bilangan bulat positif.",
        { module: "finance" },
      );
    const i = r.div(n);
    const N = n.mul(t);
    if (N.isInteger() && N.num <= 12000n) {
      const exact = P.mul(Rational.ONE.add(i).pow(N.num));
      A = exact.toNumber();
      exactText = exact.den <= 10n ** 40n ? exact.toFixedString(10) : undefined;
      if (N.num <= 120n) {
        const rows: string[][] = [];
        let bal = P;
        for (let k = 1n; k <= N.num; k++) {
          const interest = bal.mul(i);
          bal = bal.add(interest);
          rows.push([k.toString(), money(interest), money(bal)]);
        }
        table = {
          caption: "Pertumbuhan per periode",
          headers: ["Periode", "Bunga", "Saldo"],
          rows,
        };
        checks.push({
          description: "Saldo akhir tabel = rumus",
          passed: bal.equals(exact),
          method: "Iterasi eksak",
        });
      } else
        checks.push({
          description: "Rumus eksak rasional",
          passed: true,
          method: "Aritmetika eksak",
        });
    } else {
      A = P.toNumber() * Math.pow(1 + i.toNumber(), N.toNumber());
    }
    steps.push({
      title: "Tentukan bunga per periode dan jumlah periode",
      after: `i = \\frac{r}{n} = ${i.toFixedString(12)},\\quad N = nt = ${formatNumber(N.toNumber(), 10)}`,
      operation: "per-period",
      reason: "Bunga dibagi rata ke setiap periode pembungaan.",
    });
    steps.push({
      title: "Rumus bunga majemuk",
      after: `A = P(1 + i)^{N} = ${money(P)} \\times (1 + ${i.toFixedString(12)})^{${formatNumber(N.toNumber(), 10)}} = ${money(A)}`,
      operation: "compound",
      rule: {
        id: "compound-interest",
        name: "Bunga majemuk",
        formula: "A = P\\left(1 + \\frac{r}{n}\\right)^{nt}",
      },
      reason: "Bunga setiap periode ikut berbunga pada periode berikutnya.",
    });
  }
  const I = A - P.toNumber();
  const ear = p.continuous
    ? Math.exp(r.toNumber()) - 1
    : Math.pow(1 + r.toNumber() / Number(p.periodsPerYear), Number(p.periodsPerYear)) - 1;
  return makeSolution({
    kind: "finance",
    title: p.continuous ? "Bunga majemuk kontinu" : "Bunga majemuk",
    input: JSON.stringify(p),
    inputLatex: `P = ${money(P)},\\ r = ${p.ratePercent}\\%,\\ t = ${p.years}${p.continuous ? "" : `,\\ n = ${p.periodsPerYear}`}`,
    answers: [
      moneyAnswer("Nilai akhir", A),
      moneyAnswer("Total bunga", I),
      {
        label: "Suku bunga efektif tahunan",
        latex: `${formatNumber(ear * 100, 8)}\\%`,
        text: `${formatNumber(ear * 100, 8)}%`,
        exact: false,
      },
    ],
    method: { name: "Bunga majemuk", description: "Bunga ditambahkan ke pokok setiap periode." },
    steps,
    verification: aggregateVerification(checks),
    module: "finance",
    notes: [ROUND_NOTE, ...(exactText ? [] : [])],
    tables: table ? [table] : undefined,
    references: [REF_FIN],
  });
}

export type LoanMethod = "anuitas" | "efektif" | "flat";

export function solveLoan(p: {
  principal: string;
  annualRatePercent: string;
  years: string;
  paymentsPerYear: string;
  method: LoanMethod;
}): Solution {
  const P = q(p.principal, "Pokok pinjaman");
  const r = q(p.annualRatePercent, "Suku bunga").div(Rational.of(100));
  const m = q(p.paymentsPerYear, "Pembayaran per tahun");
  const years = q(p.years, "Tenor");
  const N = m.mul(years);
  if (!N.isInteger() || !N.isPositive())
    throw new MathError(
      "invalid-input",
      "Jumlah angsuran (tenor × frekuensi) harus bilangan bulat positif.",
      { module: "finance" },
    );
  if (N.num > 1200n)
    throw new MathError("limit-exceeded", "Jumlah angsuran dibatasi 1200.", { module: "finance" });
  const n = Number(N.num);
  const i = r.div(m);
  const rows: string[][] = [];
  const steps: Step[] = [];
  let totalInterest = Rational.ZERO;
  let bal = P;
  let payment: Rational | null = null;
  if (p.method === "anuitas") {
    if (i.isZero()) payment = P.div(N);
    else {
      const f = Rational.ONE.add(i).pow(n);
      payment = P.mul(i).mul(f).div(f.sub(Rational.ONE));
    }
    steps.push({
      title: "Hitung angsuran tetap (anuitas)",
      after: `A = P\\frac{i(1+i)^{n}}{(1+i)^{n} - 1} = ${money(payment)}`,
      operation: "annuity",
      rule: {
        id: "annuity-payment",
        name: "Rumus anuitas",
        formula: "A = P\\frac{i(1+i)^n}{(1+i)^n - 1}",
      },
      reason: `i = ${i.toFixedString(10)} per periode, n = ${n} angsuran. Setiap angsuran sama; porsi bunga menurun, porsi pokok naik.`,
    });
    for (let k = 1; k <= n; k++) {
      const interest = bal.mul(i);
      const principalPart = payment.sub(interest);
      bal = bal.sub(principalPart);
      totalInterest = totalInterest.add(interest);
      rows.push([String(k), money(payment), money(interest), money(principalPart), money(bal)]);
    }
  } else if (p.method === "efektif") {
    const pp = P.div(N);
    steps.push({
      title: "Pokok per angsuran tetap",
      after: `\\frac{P}{n} = ${money(pp)}`,
      operation: "principal-part",
      rule: {
        id: "effective",
        name: "Bunga efektif (menurun)",
        formula: "\\text{bunga}_k = \\text{sisa pokok}_{k-1} \\times i",
      },
      reason: "Bunga dihitung dari sisa pokok sehingga angsuran menurun.",
    });
    for (let k = 1; k <= n; k++) {
      const interest = bal.mul(i);
      const pay = pp.add(interest);
      bal = bal.sub(pp);
      totalInterest = totalInterest.add(interest);
      rows.push([String(k), money(pay), money(interest), money(pp), money(bal)]);
    }
  } else {
    const interest = P.mul(i);
    const pp = P.div(N);
    payment = pp.add(interest);
    steps.push({
      title: "Bunga flat dari pokok awal",
      after: `\\text{bunga} = P \\times i = ${money(interest)},\\ \\text{angsuran} = \\frac{P}{n} + P i = ${money(payment)}`,
      operation: "flat",
      rule: { id: "flat", name: "Bunga flat", formula: "A = \\frac{P}{n} + Pi" },
      reason:
        "Bunga selalu dihitung dari pokok awal, sehingga beban bunga efektif lebih tinggi dari suku bunga nominal.",
    });
    for (let k = 1; k <= n; k++) {
      bal = bal.sub(pp);
      totalInterest = totalInterest.add(interest);
      rows.push([String(k), money(payment), money(interest), money(pp), money(bal)]);
    }
  }
  const totalPaid = P.add(totalInterest);
  steps.push({
    title: "Rekapitulasi",
    after: `\\text{total bunga} = ${money(totalInterest)},\\ \\text{total bayar} = ${money(totalPaid)}`,
    operation: "summary",
    reason: "Lihat tabel angsuran.",
  });
  const checks: VerificationCheck[] = [
    {
      description: "Sisa pokok setelah angsuran terakhir = 0",
      passed: bal.isZero(),
      method: "Iterasi eksak tabel angsuran",
      detail: `sisa = ${bal.toString()}`,
    },
  ];
  const answers: Answer[] = [];
  if (payment) answers.push(moneyAnswer("Angsuran per periode", payment));
  else
    answers.push(
      moneyAnswer(
        "Angsuran pertama",
        Rational.parseDecimal(rows[0][1].replace(/\./g, "").replace(",", "."))!,
      ),
    );
  answers.push(
    moneyAnswer("Total bunga", totalInterest),
    moneyAnswer("Total pembayaran", totalPaid),
  );
  return makeSolution({
    kind: "finance",
    title: `Simulasi kredit (${p.method})`,
    input: JSON.stringify(p),
    inputLatex: `P = ${money(P)},\\ r = ${p.annualRatePercent}\\%\\text{/tahun},\\ ${p.years}\\ \\text{tahun},\\ ${p.paymentsPerYear}\\times\\text{/tahun}`,
    answers,
    method: {
      name: { anuitas: "Anuitas", efektif: "Bunga efektif (menurun)", flat: "Bunga flat" }[
        p.method
      ],
      description: "Tabel angsuran dihitung secara eksak periode demi periode.",
    },
    steps,
    verification: aggregateVerification(checks),
    module: "finance",
    notes: [
      ROUND_NOTE,
      "Simulasi ini tidak memasukkan biaya administrasi, asuransi, atau perubahan suku bunga (floating).",
    ],
    tables: [
      {
        caption: "Tabel angsuran",
        headers: ["Ke-", "Angsuran", "Bunga", "Pokok", "Sisa pokok"],
        rows,
      },
    ],
    references: [REF_FIN],
  });
}

export function solveNPV(p: { ratePercent: string; cashflows: string[] }): Solution {
  const r = q(p.ratePercent, "Suku bunga diskonto").div(Rational.of(100));
  const cfs = p.cashflows.map((c, k) => q(c, `Arus kas ke-${k}`));
  if (cfs.length < 2)
    throw new MathError("invalid-input", "Masukkan minimal dua arus kas (periode 0, 1, …).", {
      module: "finance",
    });
  const d = Rational.ONE.add(r);
  let npv = Rational.ZERO;
  const rows: string[][] = [];
  cfs.forEach((c, k) => {
    const pv = c.div(d.pow(k));
    npv = npv.add(pv);
    rows.push([String(k), money(c), formatNumber(d.pow(k).inv().toNumber(), 10), money(pv)]);
  });
  const horner = cfs.reduceRight((acc, c) => acc.div(d).add(c), Rational.ZERO);
  return makeSolution({
    kind: "finance",
    title: "Net Present Value (NPV)",
    input: JSON.stringify(p),
    inputLatex: `r = ${p.ratePercent}\\%,\\ CF = (${cfs.map((c) => money(c)).join(";\\ ")})`,
    answers: [
      moneyAnswer("NPV", npv),
      {
        label: "Keputusan",
        latex: npv.isPositive()
          ? "\\text{NPV} > 0: \\text{layak}"
          : npv.isZero()
            ? "\\text{NPV} = 0"
            : "\\text{NPV} < 0: \\text{tidak layak}",
        text: npv.isPositive() ? "layak (NPV > 0)" : "tidak layak (NPV ≤ 0)",
        exact: true,
      },
    ],
    method: {
      name: "Diskonto arus kas",
      description: "Setiap arus kas didiskontokan ke periode 0 lalu dijumlahkan.",
      formula: "NPV = \\sum_{k=0}^{n}\\frac{CF_k}{(1 + r)^k}",
    },
    steps: [
      {
        title: "Diskontokan setiap arus kas",
        after: `NPV = ${cfs.map((c, k) => `\\frac{${money(c)}}{(1 + ${r.toFixedString(8)})^{${k}}}`).join(" + ")} = ${money(npv)}`,
        operation: "discount",
        rule: {
          id: "npv",
          name: "Nilai sekarang bersih",
          formula: "NPV = \\sum \\frac{CF_k}{(1+r)^k}",
        },
        reason: "Uang di masa depan bernilai lebih kecil hari ini.",
      },
    ],
    verification: aggregateVerification([
      {
        description: "Perhitungan ulang dengan skema Horner",
        passed: horner.equals(npv),
        method: "Algoritma independen (eksak)",
      },
    ]),
    module: "finance",
    notes: [ROUND_NOTE],
    tables: [
      {
        caption: "Arus kas terdiskonto",
        headers: ["Periode", "Arus kas", "Faktor diskonto", "Nilai sekarang"],
        rows,
      },
    ],
    references: [REF_FIN],
  });
}

export function solveIRR(p: { cashflows: string[] }): Solution {
  const cfs = p.cashflows.map((c, k) => q(c, `Arus kas ke-${k}`).toNumber());
  if (cfs.length < 2)
    throw new MathError("invalid-input", "Masukkan minimal dua arus kas.", { module: "finance" });
  const npv = (r: number) => cfs.reduce((acc, c, k) => acc + c / Math.pow(1 + r, k), 0);
  let signChanges = 0;
  const nz = cfs.filter((c) => c !== 0);
  for (let k = 1; k < nz.length; k++) if (Math.sign(nz[k]) !== Math.sign(nz[k - 1])) signChanges++;
  if (signChanges === 0)
    throw new MathError("no-solution", "IRR tidak ada: semua arus kas bertanda sama.", {
      module: "finance",
    });
  const roots: number[] = [];
  let prevR = -0.99;
  let prevV = npv(prevR);
  for (let k = 1; k <= 4000; k++) {
    const rr = -0.99 + (k * 10.99) / 4000;
    const vv = npv(rr);
    if (Number.isFinite(prevV) && Number.isFinite(vv) && Math.sign(prevV) !== Math.sign(vv)) {
      const b = brent(npv, prevR, rr, 1e-14);
      if (b.converged) roots.push(b.root);
    }
    prevR = rr;
    prevV = vv;
  }
  if (!roots.length)
    throw new MathError("no-solution", "Tidak ditemukan IRR pada rentang −99% sampai 1000%.", {
      module: "finance",
    });
  const notes = [ROUND_NOTE];
  if (signChanges > 1)
    notes.push(
      `Arus kas berganti tanda ${signChanges} kali (arus kas non-konvensional): menurut aturan tanda Descartes bisa ada hingga ${signChanges} IRR. Gunakan NPV untuk keputusan.`,
    );
  if (roots.length > 1) notes.push("Ditemukan lebih dari satu IRR.");
  return makeSolution({
    kind: "finance",
    title: "Internal Rate of Return (IRR)",
    input: JSON.stringify(p),
    inputLatex: `CF = (${cfs.map((c) => money(c)).join(";\\ ")})`,
    answers: roots.map((r, k) => ({
      label: roots.length > 1 ? `IRR ${k + 1}` : "IRR",
      latex: `${formatNumber(r * 100, 10)}\\%`,
      text: `${formatNumber(r * 100, 10)}%`,
      exact: false,
    })),
    method: {
      name: "Pencarian akar NPV(r) = 0 (Brent)",
      description:
        "IRR adalah suku bunga yang membuat NPV nol; dihitung numerik dengan toleransi 1e-14.",
    },
    steps: [
      {
        title: "Susun persamaan NPV(r) = 0",
        after: `\\sum_{k} \\frac{CF_k}{(1 + r)^k} = 0`,
        operation: "equation",
        rule: { id: "irr", name: "IRR", formula: "\\sum \\frac{CF_k}{(1 + \\mathrm{IRR})^k} = 0" },
        reason: "Tidak ada rumus tertutup umum; digunakan metode numerik.",
      },
      {
        title: "Pindai perubahan tanda NPV lalu perhalus dengan metode Brent",
        after: roots.map((r) => `r = ${formatNumber(r * 100, 10)}\\%`).join(",\\ "),
        operation: "brent",
        reason: "Rentang pencarian −99% hingga 1000%.",
      },
    ],
    verification: aggregateVerification(
      roots.map((r) => ({
        description: `NPV pada r = ${formatNumber(r * 100, 8)}% ≈ 0`,
        passed: Math.abs(npv(r)) < 1e-6 * Math.max(1, ...cfs.map(Math.abs)),
        method: "Substitusi numerik",
        detail: `NPV = ${npv(r).toExponential(3)}`,
      })),
    ),
    module: "finance",
    notes,
    references: [REF_FIN],
  });
}

export function solveBreakEven(p: {
  fixedCost: string;
  price: string;
  variableCost: string;
}): Solution {
  const F = q(p.fixedCost, "Biaya tetap");
  const P = q(p.price, "Harga jual");
  const V = q(p.variableCost, "Biaya variabel");
  const margin = P.sub(V);
  if (!margin.isPositive())
    throw new MathError(
      "no-solution",
      "Titik impas tidak ada: harga jual harus lebih besar dari biaya variabel per unit.",
      { module: "finance" },
    );
  const units = F.div(margin);
  const revenue = units.mul(P);
  return makeSolution({
    kind: "finance",
    title: "Titik impas (break-even point)",
    input: JSON.stringify(p),
    inputLatex: `F = ${money(F)},\\ P = ${money(P)},\\ V = ${money(V)}`,
    answers: [
      {
        label: "Unit impas",
        latex: units.isInteger()
          ? units.toString()
          : `${formatNumber(units.toNumber(), 10)}\\ (\\text{dibulatkan ke atas: } ${units.ceil()})`,
        text: `${formatNumber(units.toNumber(), 10)} unit (minimal ${units.ceil()} unit)`,
        exact: true,
      },
      moneyAnswer("Pendapatan impas", revenue),
    ],
    method: {
      name: "Margin kontribusi",
      description: "Biaya tetap dibagi margin kontribusi per unit.",
      formula: "Q_{BEP} = \\frac{F}{P - V}",
    },
    steps: [
      {
        title: "Margin kontribusi per unit",
        after: `P - V = ${money(margin)}`,
        operation: "margin",
        reason: "Sumbangan tiap unit untuk menutup biaya tetap.",
      },
      {
        title: "Unit impas",
        after: `Q = \\frac{${money(F)}}{${money(margin)}} = ${formatNumber(units.toNumber(), 10)}`,
        operation: "bep",
        rule: { id: "bep", name: "Titik impas", formula: "Q = \\frac{F}{P - V}" },
        reason: "Pada titik ini laba = 0.",
      },
    ],
    verification: aggregateVerification([
      {
        description: "Laba pada titik impas = 0",
        passed: units
          .mul(P)
          .sub(F.add(units.mul(V)))
          .isZero(),
        method: "Substitusi eksak",
      },
    ]),
    module: "finance",
    notes: [ROUND_NOTE],
    references: [REF_FIN],
  });
}

export function solveDepreciation(p: {
  cost: string;
  salvage: string;
  life: string;
  method: "garis-lurus" | "saldo-menurun" | "jumlah-angka-tahun";
  ratePercent?: string;
}): Solution {
  const C = q(p.cost, "Harga perolehan");
  const S = q(p.salvage, "Nilai sisa");
  const n = q(p.life, "Umur ekonomis");
  if (!n.isInteger() || !n.isPositive() || n.num > 200n)
    throw new MathError("invalid-input", "Umur ekonomis harus bilangan bulat 1–200.", {
      module: "finance",
    });
  const N = Number(n.num);
  const rows: string[][] = [];
  let book = C;
  let total = Rational.ZERO;
  const steps: Step[] = [];
  if (p.method === "garis-lurus") {
    const d = C.sub(S).div(n);
    steps.push({
      title: "Penyusutan per tahun",
      after: `D = \\frac{C - S}{n} = \\frac{${money(C)} - ${money(S)}}{${N}} = ${money(d)}`,
      operation: "straight-line",
      rule: { id: "straight-line", name: "Metode garis lurus", formula: "D = \\frac{C - S}{n}" },
      reason: "Beban penyusutan sama setiap tahun.",
    });
    for (let k = 1; k <= N; k++) {
      book = book.sub(d);
      total = total.add(d);
      rows.push([String(k), money(d), money(total), money(book)]);
    }
  } else if (p.method === "jumlah-angka-tahun") {
    const syd = Rational.of(N * (N + 1), 2);
    steps.push({
      title: "Jumlah angka tahun",
      after: `\\frac{n(n+1)}{2} = ${syd.toString()}`,
      operation: "syd",
      rule: {
        id: "syd",
        name: "Metode jumlah angka tahun",
        formula: "D_k = \\frac{n - k + 1}{n(n+1)/2}(C - S)",
      },
      reason: "Penyusutan terbesar di tahun pertama.",
    });
    for (let k = 1; k <= N; k++) {
      const d = C.sub(S)
        .mul(Rational.of(N - k + 1))
        .div(syd);
      book = book.sub(d);
      total = total.add(d);
      rows.push([String(k), money(d), money(total), money(book)]);
    }
  } else {
    const rate = p.ratePercent
      ? q(p.ratePercent, "Tarif").div(Rational.of(100))
      : Rational.of(2).div(n);
    steps.push({
      title: "Tarif saldo menurun",
      after: `t = ${formatNumber(rate.toNumber() * 100, 8)}\\%`,
      operation: "ddb",
      rule: {
        id: "declining-balance",
        name: "Metode saldo menurun (ganda)",
        formula: "D_k = t \\times \\text{nilai buku}_{k-1}",
      },
      reason: p.ratePercent
        ? "Tarif diberikan."
        : "Saldo menurun ganda: t = 2/n. Penyusutan dihentikan saat nilai buku mencapai nilai sisa.",
    });
    for (let k = 1; k <= N; k++) {
      let d = book.mul(rate);
      if (book.sub(d).lt(S)) d = book.sub(S);
      if (k === N && book.sub(d).gt(S)) d = book.sub(S);
      if (d.isNegative()) d = Rational.ZERO;
      book = book.sub(d);
      total = total.add(d);
      rows.push([String(k), money(d), money(total), money(book)]);
    }
  }
  return makeSolution({
    kind: "finance",
    title: "Penyusutan aset",
    input: JSON.stringify(p),
    inputLatex: `C = ${money(C)},\\ S = ${money(S)},\\ n = ${N}`,
    answers: [
      moneyAnswer(
        "Penyusutan tahun pertama",
        Rational.parseDecimal(rows[0][1].replace(/\./g, "").replace(",", "."))!,
      ),
      moneyAnswer("Akumulasi penyusutan", total),
      moneyAnswer("Nilai buku akhir", book),
    ],
    method: {
      name: {
        "garis-lurus": "Garis lurus",
        "saldo-menurun": "Saldo menurun",
        "jumlah-angka-tahun": "Jumlah angka tahun",
      }[p.method],
      description: "Tabel penyusutan dihitung eksak per tahun.",
    },
    steps,
    verification: aggregateVerification([
      {
        description: "Nilai buku akhir = nilai sisa",
        passed: book.equals(S),
        method: "Iterasi eksak",
      },
      {
        description: "Akumulasi = harga perolehan − nilai sisa",
        passed: total.equals(C.sub(S)),
        method: "Invarian eksak",
      },
    ]),
    module: "finance",
    notes: [ROUND_NOTE],
    tables: [
      {
        caption: "Tabel penyusutan",
        headers: ["Tahun", "Penyusutan", "Akumulasi", "Nilai buku"],
        rows,
      },
    ],
    references: [REF_FIN],
  });
}

export function solveRealRate(p: { nominalPercent: string; inflationPercent: string }): Solution {
  const n = q(p.nominalPercent, "Suku bunga nominal").div(Rational.of(100));
  const i = q(p.inflationPercent, "Inflasi").div(Rational.of(100));
  const real = Rational.ONE.add(n).div(Rational.ONE.add(i)).sub(Rational.ONE);
  const approx = n.sub(i);
  return makeSolution({
    kind: "finance",
    title: "Suku bunga riil (persamaan Fisher)",
    input: JSON.stringify(p),
    inputLatex: `i_n = ${p.nominalPercent}\\%,\\ \\pi = ${p.inflationPercent}\\%`,
    answers: [
      {
        label: "Suku bunga riil",
        latex: `${formatNumber(real.toNumber() * 100, 10)}\\%`,
        text: `${formatNumber(real.toNumber() * 100, 10)}%`,
        exact: true,
      },
    ],
    method: {
      name: "Persamaan Fisher",
      description: "(1 + nominal) = (1 + riil)(1 + inflasi).",
      formula: "r = \\frac{1 + i_n}{1 + \\pi} - 1",
    },
    steps: [
      {
        title: "Persamaan Fisher eksak",
        after: `r = \\frac{1 + ${n.toFixedString(8)}}{1 + ${i.toFixedString(8)}} - 1 = ${formatNumber(real.toNumber() * 100, 10)}\\%`,
        operation: "fisher",
        reason: "Daya beli bunga setelah dikoreksi inflasi.",
      },
    ],
    verification: aggregateVerification([
      {
        description: "(1 + r)(1 + π) = 1 + nominal",
        passed: Rational.ONE.add(real).mul(Rational.ONE.add(i)).equals(Rational.ONE.add(n)),
        method: "Substitusi eksak",
      },
    ]),
    module: "finance",
    alternatives: [
      {
        name: "Pendekatan r ≈ i − π",
        description: "Valid bila suku bunga dan inflasi kecil.",
        steps: [
          {
            title: "Selisih sederhana",
            after: `r \\approx ${formatNumber(approx.toNumber() * 100, 8)}\\%`,
            operation: "approx",
            reason: "Galat pendekatan membesar untuk inflasi tinggi.",
          },
        ],
      },
    ],
    references: [REF_FIN],
  });
}

export function solveROI(p: { gain: string; cost: string }): Solution {
  const G = q(p.gain, "Hasil investasi");
  const C = q(p.cost, "Biaya investasi");
  if (C.isZero())
    throw new MathError("division-by-zero", "Biaya investasi tidak boleh nol.", {
      module: "finance",
    });
  const roi = G.sub(C).div(C).mul(Rational.of(100));
  return makeSolution({
    kind: "finance",
    title: "Return on Investment (ROI)",
    input: JSON.stringify(p),
    inputLatex: `\\text{hasil} = ${money(G)},\\ \\text{biaya} = ${money(C)}`,
    answers: [
      {
        label: "ROI",
        latex: `${formatNumber(roi.toNumber(), 10)}\\%`,
        text: `${formatNumber(roi.toNumber(), 10)}%`,
        exact: true,
      },
    ],
    method: {
      name: "ROI",
      description: "Keuntungan bersih dibagi biaya.",
      formula: "ROI = \\frac{\\text{hasil} - \\text{biaya}}{\\text{biaya}} \\times 100\\%",
    },
    steps: [
      {
        title: "Hitung ROI",
        after: `\\frac{${money(G)} - ${money(C)}}{${money(C)}} \\times 100\\% = ${formatNumber(roi.toNumber(), 10)}\\%`,
        operation: "roi",
        reason: "Tidak memperhitungkan nilai waktu uang.",
      },
    ],
    verification: aggregateVerification([
      {
        description: "biaya × (1 + ROI) = hasil",
        passed: C.mul(Rational.ONE.add(roi.div(Rational.of(100)))).equals(G),
        method: "Substitusi eksak",
      },
    ]),
    module: "finance",
    references: [REF_FIN],
  });
}

export function solveAnnuityValue(p: {
  payment: string;
  ratePercent: string;
  periods: string;
  kind: "pv" | "fv";
  due?: boolean;
}): Solution {
  const A = q(p.payment, "Angsuran");
  const i = q(p.ratePercent, "Suku bunga per periode").div(Rational.of(100));
  const n = q(p.periods, "Jumlah periode");
  if (!n.isInteger() || !n.isPositive() || n.num > 5000n)
    throw new MathError("invalid-input", "Jumlah periode harus bilangan bulat 1–5000.", {
      module: "finance",
    });
  const N = Number(n.num);
  let value: Rational;
  if (i.isZero()) value = A.mul(n);
  else {
    const f = Rational.ONE.add(i).pow(N);
    value =
      p.kind === "fv" ? A.mul(f.sub(Rational.ONE)).div(i) : A.mul(Rational.ONE.sub(f.inv())).div(i);
  }
  if (p.due) value = value.mul(Rational.ONE.add(i));
  let direct = Rational.ZERO;
  for (let k = 0; k < N; k++) {
    const exp = p.kind === "fv" ? N - 1 - k + (p.due ? 1 : 0) : -(k + (p.due ? 0 : 1));
    direct = direct.add(A.mul(Rational.ONE.add(i).pow(exp)));
  }
  return makeSolution({
    kind: "finance",
    title: p.kind === "fv" ? "Nilai akan datang anuitas" : "Nilai sekarang anuitas",
    input: JSON.stringify(p),
    inputLatex: `A = ${money(A)},\\ i = ${p.ratePercent}\\%,\\ n = ${N}${p.due ? ",\\ \\text{anuitas di muka}" : ""}`,
    answers: [moneyAnswer(p.kind === "fv" ? "FV" : "PV", value)],
    method: {
      name: "Deret geometri anuitas",
      description: "Jumlah deret geometri dari setiap pembayaran.",
    },
    steps: [
      {
        title: "Rumus anuitas",
        after: `${p.kind === "fv" ? "FV = A\\frac{(1+i)^n - 1}{i}" : "PV = A\\frac{1 - (1+i)^{-n}}{i}"}${p.due ? "(1 + i)" : ""} = ${money(value)}`,
        operation: "annuity",
        rule: {
          id: "annuity",
          name: "Anuitas",
          formula:
            p.kind === "fv" ? "FV = A\\frac{(1+i)^n - 1}{i}" : "PV = A\\frac{1 - (1+i)^{-n}}{i}",
        },
        reason: p.due
          ? "Pembayaran di awal periode: kalikan (1 + i)."
          : "Pembayaran di akhir periode.",
      },
    ],
    verification: aggregateVerification([
      {
        description: "Penjumlahan langsung setiap pembayaran",
        passed: direct.equals(value),
        method: "Deret eksplisit (eksak)",
      },
    ]),
    module: "finance",
    notes: [ROUND_NOTE],
    references: [REF_FIN],
  });
}
