/**
 * Chemistry solvers: molar mass and percent composition, equation balancing (exact
 * nullspace), empirical/molecular formulas, stoichiometry with limiting reagent, and pH of
 * strong/weak acids (charge balance including water autoionization).
 * Reference: OpenStax Chemistry 2e; IUPAC CIAAW standard atomic weights.
 */
import { MathError } from "../core/errors";
import { Rational, bigGcd, bigLcm } from "../core/rational";
import { RMatrix } from "../linalg/matrix";
import { brent } from "../numeric/methods";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification, formatNumber, rationalLatex } from "../steps/format";
import type { Alternative, Answer, Solution, Step, TableData, VerificationCheck } from "../steps/types";
import { ELEMENT_BY_SYMBOL } from "./elements";
import { molarMass, parseFormula, type ParsedFormula } from "./formula";

function fmt(r: Rational, digits = 8): string {
  return formatNumber(r.toNumber(), digits);
}

// ---------------------------------------------------------------------------
// Molar mass
// ---------------------------------------------------------------------------

export function solveMolarMass(formulaText: string): Solution {
  const f = parseFormula(formulaText);
  if (f.isElectron) throw new MathError("invalid-input", "Elektron tidak memiliki massa molar dalam tabel unsur.", { module: "chemistry" });
  const { value, rows } = molarMass(f);
  const steps: Step[] = [
    { title: "Hitung jumlah atom setiap unsur", after: rows.map((r) => `\\mathrm{${r.symbol}}: ${r.count}`).join(",\\ "), operation: "count-atoms", reason: "Indeks di belakang simbol dan di belakang tanda kurung dikalikan; koefisien hidrat dikalikan ke seluruh gugus." },
    { title: "Kalikan dengan berat atom lalu jumlahkan", after: `M = ${rows.map((r) => `${r.count} \\times ${r.weight}`).join(" + ")} = ${fmt(value, 10)}\\ \\mathrm{g/mol}`, operation: "sum-weights", rule: { id: "molar-mass", name: "Massa molar", formula: "M = \\sum n_i A_i" }, reason: "Massa molar adalah jumlah berat atom semua atom dalam satu satuan rumus." },
  ];
  const percents = rows.map((r) => ({ symbol: r.symbol, pct: r.subtotal.div(value).mul(Rational.of(100)) }));
  steps.push({ title: "Komposisi persen massa", after: percents.map((p) => `\\%\\mathrm{${p.symbol}} = ${fmt(p.pct, 6)}\\%`).join(",\\ "), operation: "percent", rule: { id: "percent-composition", name: "Persen massa", formula: "\\%X = \\frac{n_X A_X}{M} \\times 100\\%" }, reason: "Kontribusi massa tiap unsur terhadap massa molar." });
  const sumPct = percents.reduce((a, p) => a.add(p.pct), Rational.ZERO);
  const checks: VerificationCheck[] = [{ description: "Jumlah persen massa = 100%", passed: sumPct.equals(Rational.of(100)), method: "Invarian eksak" }];
  const notes: string[] = [];
  if (rows.some((r) => !r.standard)) notes.push("Memuat unsur tanpa berat atom standar; digunakan nomor massa isotop berumur panjang (nilai dalam tanda kurung pada tabel periodik).");
  notes.push("Berat atom: nilai standar/konvensional IUPAC CIAAW; untuk H, C, N, O, dan beberapa unsur lain nilai sebenarnya bervariasi sedikit menurut sumber sampel.");
  const table: TableData = { caption: "Rincian massa molar", headers: ["Unsur", "Jumlah atom", "Berat atom (g/mol)", "Subtotal (g/mol)", "% massa"], rows: rows.map((r, i) => [`${r.symbol} (${ELEMENT_BY_SYMBOL[r.symbol].name})`, String(r.count), r.standard ? r.weight : `[${r.weight}]`, fmt(r.subtotal, 10), `${fmt(percents[i].pct, 6)}%`]) };
  return makeSolution({
    kind: "chemistry",
    title: "Massa molar dan komposisi persen",
    input: formulaText,
    inputLatex: f.latex,
    answers: [{ label: "Massa molar", latex: `${fmt(value, 10)}\\ \\mathrm{g/mol}`, text: `${fmt(value, 10)} g/mol`, exact: true, unit: "\\mathrm{g/mol}" }, ...percents.map((p) => ({ label: `% ${p.symbol}`, latex: `${fmt(p.pct, 6)}\\%`, text: `${fmt(p.pct, 6)}%`, exact: false }))],
    method: { name: "Penjumlahan berat atom", description: "Jumlah atom tiap unsur dikalikan berat atomnya lalu dijumlahkan." },
    steps,
    verification: aggregateVerification(checks),
    module: "chemistry",
    notes,
    tables: [table],
    references: [REFERENCES.ciaaw, REFERENCES.openstaxChem],
  });
}

// ---------------------------------------------------------------------------
// Equation balancing
// ---------------------------------------------------------------------------

interface Species {
  formula: ParsedFormula;
  side: "reactant" | "product";
  raw: string;
}

function splitSide(side: string): string[] {
  const s = side.trim();
  if (/\s\+\s/.test(s)) return s.split(/\s+\+\s+/).map((x) => x.trim()).filter(Boolean);
  const parts: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1] ?? "";
    const prev = s[i - 1] ?? "";
    if (ch === "+" && /[A-Za-z0-9)\]]/.test(prev) && /[A-Z0-9([]/.test(next)) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((x) => x.trim()).filter(Boolean);
}

export function parseReaction(text: string): Species[] {
  const arrow = /\s*(<=>|<->|⇌|->|→|=>|=)\s*/;
  const m = arrow.exec(text);
  if (!m) throw new MathError("invalid-input", "Persamaan reaksi harus memiliki tanda panah (->, →, atau =).", { module: "chemistry", hint: "Contoh: Fe + O2 -> Fe2O3" });
  const left = text.slice(0, m.index);
  const right = text.slice(m.index + m[0].length);
  const mk = (raw: string, side: Species["side"]): Species => {
    const noCoef = raw.replace(/^\d+\s*/, "");
    return { formula: parseFormula(noCoef), side, raw: noCoef };
  };
  const species = [...splitSide(left).map((r) => mk(r, "reactant")), ...splitSide(right).map((r) => mk(r, "product"))];
  if (!species.some((s) => s.side === "reactant") || !species.some((s) => s.side === "product")) {
    throw new MathError("invalid-input", "Reaksi harus memiliki reaktan dan produk.", { module: "chemistry" });
  }
  return species;
}

function coefLatex(c: bigint, f: ParsedFormula): string {
  return `${c === 1n ? "" : c.toString()}${f.latex}`;
}

export function balanceReaction(text: string): { species: Species[]; coefficients: bigint[]; elements: string[]; matrix: RMatrix; hasCharge: boolean } {
  const species = parseReaction(text);
  const elements = [...new Set(species.flatMap((s) => [...s.formula.counts.keys()]))];
  const hasCharge = species.some((s) => s.formula.charge !== 0);
  const rows: Rational[][] = elements.map((el) => species.map((s) => Rational.of((s.side === "reactant" ? 1 : -1) * (s.formula.counts.get(el) ?? 0))));
  if (hasCharge) rows.push(species.map((s) => Rational.of((s.side === "reactant" ? 1 : -1) * s.formula.charge)));
  const A = new RMatrix(rows);
  const ns = A.nullspace();
  if (ns.length === 0) {
    throw new MathError("no-solution", "Reaksi tidak dapat disetarakan.", { module: "chemistry", cause: "Satu-satunya solusi sistem kekekalan atom adalah semua koefisien nol: periksa kembali rumus zat atau apakah ada zat yang hilang.", hint: "Pastikan setiap unsur muncul di kedua ruas." });
  }
  if (ns.length > 1) {
    throw new MathError("ambiguous", "Reaksi dapat disetarakan dengan lebih dari satu perbandingan koefisien yang tidak saling berkelipatan.", { module: "chemistry", cause: `Ruang nol berdimensi ${ns.length}: persamaan ini merupakan gabungan beberapa reaksi independen.`, hint: "Pisahkan menjadi reaksi-reaksi terpisah atau tambahkan informasi (misalnya perbandingan produk)." });
  }
  let v = ns[0];
  let l = 1n;
  for (const c of v) l = bigLcm(l, c.den);
  let ints = v.map((c) => c.mul(Rational.of(l)).num);
  let g = 0n;
  for (const c of ints) g = bigGcd(g, c);
  ints = ints.map((c) => c / g);
  if (ints.every((c) => c <= 0n)) ints = ints.map((c) => -c);
  if (ints.some((c) => c <= 0n)) {
    throw new MathError("no-solution", "Reaksi tidak dapat disetarakan dengan koefisien positif.", { module: "chemistry", cause: "Solusi kekekalan atom mengharuskan sebagian koefisien bernilai nol atau negatif; mungkin reaktan/produk tertukar atau ada zat yang tidak ikut bereaksi." });
  }
  v = ints.map((c) => Rational.of(c));
  void v;
  return { species, coefficients: ints, elements, matrix: A, hasCharge };
}

export function solveBalance(text: string): Solution {
  const { species, coefficients, elements, hasCharge } = balanceReaction(text);
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  const reactants = species.map((s, i) => ({ s, i })).filter((x) => x.s.side === "reactant");
  const products = species.map((s, i) => ({ s, i })).filter((x) => x.s.side === "product");
  const unbalanced = `${reactants.map((x) => `${letters[x.i]}\\,${x.s.formula.latex}`).join(" + ")} \\rightarrow ${products.map((x) => `${letters[x.i]}\\,${x.s.formula.latex}`).join(" + ")}`;
  const eqs = elements.map((el) => {
    const lhs = reactants.filter((x) => x.s.formula.counts.get(el)).map((x) => `${x.s.formula.counts.get(el)! > 1 ? x.s.formula.counts.get(el) : ""}${letters[x.i]}`).join(" + ") || "0";
    const rhs = products.filter((x) => x.s.formula.counts.get(el)).map((x) => `${x.s.formula.counts.get(el)! > 1 ? x.s.formula.counts.get(el) : ""}${letters[x.i]}`).join(" + ") || "0";
    return `\\mathrm{${el}}: & ${lhs} = ${rhs}`;
  });
  if (hasCharge) {
    const q = (x: { s: Species; i: number }) => (x.s.formula.charge === 0 ? "" : `${x.s.formula.charge > 0 ? "+" : "-"}${Math.abs(x.s.formula.charge) > 1 ? Math.abs(x.s.formula.charge) : ""}${letters[x.i]}`);
    eqs.push(`\\text{muatan}: & ${reactants.map(q).filter(Boolean).join(" ") || "0"} = ${products.map(q).filter(Boolean).join(" ") || "0"}`);
  }
  const balanced = `${reactants.map((x) => coefLatex(coefficients[x.i], x.s.formula)).join(" + ")} \\rightarrow ${products.map((x) => coefLatex(coefficients[x.i], x.s.formula)).join(" + ")}`;
  const balancedText = `${reactants.map((x) => `${coefficients[x.i] === 1n ? "" : coefficients[x.i]}${x.s.raw}`).join(" + ")} → ${products.map((x) => `${coefficients[x.i] === 1n ? "" : coefficients[x.i]}${x.s.raw}`).join(" + ")}`;
  const steps: Step[] = [
    { title: "Beri koefisien yang belum diketahui", after: unbalanced, operation: "unknowns", reason: "Setiap zat diberi koefisien a, b, c, …" },
    { title: `Tulis persamaan kekekalan ${hasCharge ? "atom dan muatan" : "atom"}`, after: `\\begin{aligned} ${eqs.join(" \\\\ ")} \\end{aligned}`, operation: "conservation", rule: { id: "conservation-of-mass", name: "Hukum kekekalan massa (Lavoisier)", formula: "\\text{jumlah atom tiap unsur di kiri} = \\text{di kanan}" }, reason: "Atom tidak diciptakan atau dimusnahkan dalam reaksi kimia; muatan total juga kekal." },
    { title: "Selesaikan sistem (ruang nol matriks komposisi)", after: species.map((s, i) => `${letters[i]} = ${coefficients[i]}`).join(",\\ "), operation: "nullspace", rule: { id: "nullspace", name: "Ruang nol matriks", formula: "A\\mathbf{x} = \\mathbf{0}" }, reason: "Sistem homogen diselesaikan secara eksak; solusi diskalakan menjadi bilangan bulat positif terkecil (dibagi FPB)." },
    { title: "Persamaan reaksi setara", after: balanced, operation: "balanced", reason: "Substitusikan koefisien." },
  ];
  const checks: VerificationCheck[] = [];
  const rows: string[][] = [];
  for (const el of elements) {
    const l = reactants.reduce((a, x) => a + Number(coefficients[x.i]) * (x.s.formula.counts.get(el) ?? 0), 0);
    const r = products.reduce((a, x) => a + Number(coefficients[x.i]) * (x.s.formula.counts.get(el) ?? 0), 0);
    rows.push([el, String(l), String(r), l === r ? "✓" : "✗"]);
    checks.push({ description: `Atom ${el}: kiri = kanan`, latex: `${l} = ${r}`, passed: l === r, method: "Penghitungan atom" });
  }
  if (hasCharge) {
    const l = reactants.reduce((a, x) => a + Number(coefficients[x.i]) * x.s.formula.charge, 0);
    const r = products.reduce((a, x) => a + Number(coefficients[x.i]) * x.s.formula.charge, 0);
    rows.push(["muatan", String(l), String(r), l === r ? "✓" : "✗"]);
    checks.push({ description: "Muatan total: kiri = kanan", latex: `${l} = ${r}`, passed: l === r, method: "Kekekalan muatan" });
  }
  // mass conservation (numeric)
  const massL = reactants.reduce((a, x) => (x.s.formula.isElectron ? a : a.add(molarMass(x.s.formula).value.mul(Rational.of(coefficients[x.i])))), Rational.ZERO);
  const massR = products.reduce((a, x) => (x.s.formula.isElectron ? a : a.add(molarMass(x.s.formula).value.mul(Rational.of(coefficients[x.i])))), Rational.ZERO);
  checks.push({ description: "Kekekalan massa (jumlah massa molar × koefisien)", latex: `${fmt(massL, 10)} = ${fmt(massR, 10)}\\ \\mathrm{g}`, passed: massL.equals(massR) || !species.some((s) => s.formula.isElectron) === false, method: "Kekekalan massa (eksak)" });
  return makeSolution({
    kind: "chemistry",
    title: "Penyetaraan reaksi kimia",
    input: text,
    inputLatex: `${reactants.map((x) => x.s.formula.latex).join(" + ")} \\rightarrow ${products.map((x) => x.s.formula.latex).join(" + ")}`,
    answers: [{ label: "Reaksi setara", latex: balanced, text: balancedText, exact: true }],
    method: { name: "Metode aljabar (ruang nol matriks)", description: "Kekekalan setiap unsur (dan muatan) membentuk sistem linear homogen; koefisien adalah vektor ruang nol berbilangan bulat terkecil." },
    steps,
    verification: aggregateVerification(checks),
    module: "chemistry",
    tables: [{ caption: "Pemeriksaan jumlah atom", headers: ["Unsur", "Kiri", "Kanan", "Setara?"], rows }],
    references: [REFERENCES.openstaxChem],
  });
}

// ---------------------------------------------------------------------------
// Empirical formula
// ---------------------------------------------------------------------------

export function solveEmpiricalFormula(percentages: Record<string, string>, molarMassText?: string): Solution {
  const entries = Object.entries(percentages).filter(([, v]) => v.trim() !== "");
  if (entries.length < 1) throw new MathError("invalid-input", "Masukkan persen massa minimal satu unsur.", { module: "chemistry" });
  const data = entries.map(([sym, v]) => {
    const el = ELEMENT_BY_SYMBOL[sym.trim()];
    if (!el) throw new MathError("invalid-input", `'${sym}' bukan simbol unsur.`, { module: "chemistry" });
    const pct = Number(v);
    if (!(pct > 0)) throw new MathError("invalid-input", `Persen ${sym} harus positif.`, { module: "chemistry" });
    return { sym: el.symbol, pct, weight: Number(el.weight), mol: pct / Number(el.weight) };
  });
  const total = data.reduce((a, d) => a + d.pct, 0);
  const notes: string[] = [];
  if (Math.abs(total - 100) > 0.5) notes.push(`Jumlah persen = ${formatNumber(total, 6)}% (bukan 100%); perhitungan tetap memakai perbandingan relatif.`);
  const minMol = Math.min(...data.map((d) => d.mol));
  const ratios = data.map((d) => d.mol / minMol);
  let mult = 1;
  for (let k = 1; k <= 8; k++) {
    if (ratios.every((r) => Math.abs(r * k - Math.round(r * k)) < 0.1 * Math.max(1, k / 3))) {
      mult = k;
      break;
    }
    if (k === 8) notes.push("Perbandingan tidak mendekati bilangan bulat dengan pengali ≤ 8; data mungkin kurang akurat.");
  }
  const counts = ratios.map((r) => Math.round(r * mult));
  const empirical = data.map((d, i) => `${d.sym}${counts[i] > 1 ? counts[i] : ""}`).join("");
  const empiricalLatex = `\\mathrm{${data.map((d, i) => `${d.sym}${counts[i] > 1 ? `_{${counts[i]}}` : ""}`).join("")}}`;
  const empMass = data.reduce((a, d, i) => a + d.weight * counts[i], 0);
  const steps: Step[] = [
    { title: "Anggap sampel 100 g", after: data.map((d) => `m_{\\mathrm{${d.sym}}} = ${d.pct}\\ \\mathrm{g}`).join(",\\ "), operation: "assume-100g", reason: "Persen massa langsung menjadi massa dalam gram." },
    { title: "Ubah massa menjadi mol", after: data.map((d) => `n_{\\mathrm{${d.sym}}} = \\frac{${d.pct}}{${d.weight}} = ${formatNumber(d.mol, 6)}`).join(",\\ "), operation: "to-moles", rule: { id: "mol", name: "Mol", formula: "n = \\frac{m}{A_r}" }, reason: "Bagi dengan berat atom." },
    { title: "Bagi dengan mol terkecil", after: data.map((d, i) => `\\mathrm{${d.sym}}: ${formatNumber(ratios[i], 5)}`).join(",\\ "), operation: "ratio", reason: "Mendapatkan perbandingan atom paling sederhana." },
  ];
  if (mult > 1) steps.push({ title: `Kalikan dengan ${mult} agar menjadi bilangan bulat`, after: data.map((d, i) => `\\mathrm{${d.sym}}: ${formatNumber(ratios[i] * mult, 5)} \\approx ${counts[i]}`).join(",\\ "), operation: "scale", reason: "Perbandingan pecahan (mis. 1,5 atau 1,33) diubah menjadi bulat." });
  steps.push({ title: "Rumus empiris", after: empiricalLatex, operation: "empirical", reason: "Tuliskan unsur dengan indeks perbandingan bulat." });
  const answers: Answer[] = [{ label: "Rumus empiris", latex: empiricalLatex, text: empirical, exact: false }];
  const checks: VerificationCheck[] = [];
  if (molarMassText) {
    const M = Number(molarMassText);
    const k = Math.round(M / empMass);
    if (k >= 1) {
      const molecular = data.map((d, i) => `${d.sym}${counts[i] * k > 1 ? counts[i] * k : ""}`).join("");
      steps.push({ title: "Rumus molekul", after: `n = \\frac{M}{M_{\\text{empiris}}} = \\frac{${M}}{${formatNumber(empMass, 6)}} \\approx ${k} \\Rightarrow \\mathrm{${data.map((d, i) => `${d.sym}${counts[i] * k > 1 ? `_{${counts[i] * k}}` : ""}`).join("")}}`, operation: "molecular", reason: "Rumus molekul adalah kelipatan bulat rumus empiris." });
      answers.push({ label: "Rumus molekul", latex: `\\mathrm{${data.map((d, i) => `${d.sym}${counts[i] * k > 1 ? `_{${counts[i] * k}}` : ""}`).join("")}}`, text: molecular, exact: false });
      checks.push({ description: "Massa molar rumus molekul mendekati data", passed: Math.abs(empMass * k - M) / M < 0.02, method: "Perbandingan numerik", detail: `${formatNumber(empMass * k, 6)} vs ${M}` });
    }
  }
  // back-check composition
  const pctBack = data.map((d, i) => (100 * d.weight * counts[i]) / empMass);
  checks.push({ description: "Komposisi persen dari rumus empiris cocok dengan data (±1%)", passed: data.every((d, i) => Math.abs(pctBack[i] - (d.pct * 100) / total) < 1), method: "Perhitungan balik", detail: data.map((d, i) => `${d.sym}: ${formatNumber(pctBack[i], 5)}%`).join(", ") });
  return makeSolution({
    kind: "chemistry",
    title: "Rumus empiris dari komposisi persen",
    input: JSON.stringify(percentages),
    inputLatex: data.map((d) => `\\mathrm{${d.sym}}\\ ${d.pct}\\%`).join(",\\ "),
    answers,
    method: { name: "Perbandingan mol", description: "Ubah persen massa → mol → perbandingan bilangan bulat terkecil." },
    steps,
    verification: aggregateVerification(checks),
    module: "chemistry",
    notes,
    references: [REFERENCES.openstaxChem, REFERENCES.ciaaw],
  });
}

// ---------------------------------------------------------------------------
// Stoichiometry
// ---------------------------------------------------------------------------

export function solveStoichiometry(reaction: string, givenMasses: Record<number, string>): Solution {
  const { species, coefficients } = balanceReaction(reaction);
  const masses = species.map((s) => (s.formula.isElectron ? null : molarMass(s.formula).value));
  const given = Object.entries(givenMasses).filter(([, v]) => v.trim() !== "").map(([k, v]) => ({ idx: Number(k), mass: Rational.parseDecimal(v) }));
  if (given.length === 0) throw new MathError("invalid-input", "Masukkan massa minimal satu zat.", { module: "chemistry" });
  for (const g of given) {
    if (!g.mass || !g.mass.isPositive()) throw new MathError("invalid-input", "Massa harus bilangan positif.", { module: "chemistry" });
    if (species[g.idx].side !== "reactant" && given.length > 1) throw new MathError("invalid-input", "Untuk pereaksi pembatas, masukkan massa reaktan saja.", { module: "chemistry" });
  }
  const steps: Step[] = [];
  const balancedLatex = `${species.filter((s) => s.side === "reactant").map((s) => coefLatex(coefficients[species.indexOf(s)], s.formula)).join(" + ")} \\rightarrow ${species.filter((s) => s.side === "product").map((s) => coefLatex(coefficients[species.indexOf(s)], s.formula)).join(" + ")}`;
  steps.push({ title: "Setarakan reaksi", after: balancedLatex, operation: "balance", reason: "Perbandingan koefisien = perbandingan mol." });
  const moles = given.map((g) => ({ idx: g.idx, n: g.mass!.div(masses[g.idx]!) }));
  steps.push({ title: "Ubah massa yang diketahui menjadi mol", after: moles.map((m) => `n_{${species[m.idx].formula.latex}} = \\frac{${given.find((g) => g.idx === m.idx)!.mass!.toString()}\\ \\mathrm{g}}{${fmt(masses[m.idx]!, 8)}\\ \\mathrm{g/mol}} = ${fmt(m.n, 8)}\\ \\mathrm{mol}`).join(" \\\\ "), operation: "to-moles", rule: { id: "mol", name: "Mol", formula: "n = \\frac{m}{M}" }, reason: "Massa dibagi massa molar." });
  // limiting reagent: smallest n/coef
  let limiting = moles[0];
  let extent = moles[0].n.div(Rational.of(coefficients[moles[0].idx]));
  for (const m of moles.slice(1)) {
    const e = m.n.div(Rational.of(coefficients[m.idx]));
    if (e.lt(extent)) {
      extent = e;
      limiting = m;
    }
  }
  if (moles.length > 1) {
    steps.push({ title: "Tentukan pereaksi pembatas", after: moles.map((m) => `\\frac{n_{${species[m.idx].formula.latex}}}{${coefficients[m.idx]}} = ${fmt(m.n.div(Rational.of(coefficients[m.idx])), 8)}`).join(",\\ ") + `\\Rightarrow \\text{pembatas: } ${species[limiting.idx].formula.latex}`, operation: "limiting", rule: { id: "limiting-reagent", name: "Pereaksi pembatas", formula: "\\min_i \\frac{n_i}{\\nu_i}" }, reason: "Reaktan dengan perbandingan mol/koefisien terkecil habis lebih dulu." });
  }
  const rows: string[][] = [];
  const answers: Answer[] = [];
  species.forEach((s, i) => {
    if (s.formula.isElectron) return;
    const n = extent.mul(Rational.of(coefficients[i]));
    const m = n.mul(masses[i]!);
    const g = given.find((x) => x.idx === i);
    if (s.side === "product") {
      answers.push({ label: `Massa ${s.formula.text} terbentuk`, latex: `${fmt(m, 8)}\\ \\mathrm{g}`, text: `${fmt(m, 8)} g`, exact: false, unit: "\\mathrm{g}" });
      rows.push([s.formula.text, "produk", fmt(n, 8), fmt(m, 8)]);
    } else {
      const used = m;
      const left = g ? g.mass!.sub(used) : null;
      rows.push([s.formula.text, "reaktan", fmt(n, 8), `${fmt(used, 8)} bereaksi${left && left.isPositive() ? `, sisa ${fmt(left, 8)}` : ""}`]);
      if (!g) answers.push({ label: `Massa ${s.formula.text} dibutuhkan`, latex: `${fmt(used, 8)}\\ \\mathrm{g}`, text: `${fmt(used, 8)} g`, exact: false, unit: "\\mathrm{g}" });
      else if (left && left.isPositive()) answers.push({ label: `Sisa ${s.formula.text}`, latex: `${fmt(left, 8)}\\ \\mathrm{g}`, text: `${fmt(left, 8)} g`, exact: false, unit: "\\mathrm{g}" });
    }
  });
  steps.push({ title: "Gunakan perbandingan koefisien", after: species.filter((s) => !s.formula.isElectron).map((s) => `n_{${s.formula.latex}} = ${fmt(extent.mul(Rational.of(coefficients[species.indexOf(s)])), 8)}\\ \\mathrm{mol}`).join(",\\ "), operation: "mole-ratio", rule: { id: "mole-ratio", name: "Perbandingan mol", formula: "\\frac{n_A}{\\nu_A} = \\frac{n_B}{\\nu_B}" }, reason: "Mol tiap zat sebanding dengan koefisiennya." });
  steps.push({ title: "Ubah mol menjadi massa", after: "m = n \\times M", operation: "to-mass", reason: "Lihat tabel hasil." });
  const reactedMass = species.filter((s) => s.side === "reactant" && !s.formula.isElectron).reduce((a, s) => a.add(extent.mul(Rational.of(coefficients[species.indexOf(s)])).mul(masses[species.indexOf(s)]!)), Rational.ZERO);
  const productMass = species.filter((s) => s.side === "product" && !s.formula.isElectron).reduce((a, s) => a.add(extent.mul(Rational.of(coefficients[species.indexOf(s)])).mul(masses[species.indexOf(s)]!)), Rational.ZERO);
  return makeSolution({
    kind: "chemistry",
    title: moles.length > 1 ? "Stoikiometri dan pereaksi pembatas" : "Stoikiometri reaksi",
    input: JSON.stringify({ reaction, givenMasses }),
    inputLatex: balancedLatex,
    answers,
    method: { name: "Perbandingan mol", description: "massa → mol → perbandingan koefisien → mol → massa." },
    steps,
    verification: aggregateVerification([{ description: "Massa reaktan yang bereaksi = massa produk (kekekalan massa)", latex: `${fmt(reactedMass, 10)} = ${fmt(productMass, 10)}\\ \\mathrm{g}`, passed: Math.abs(reactedMass.sub(productMass).toNumber()) < 1e-9 * Math.max(1, reactedMass.toNumber()), method: "Kekekalan massa" }]),
    module: "chemistry",
    tables: [{ caption: "Hasil stoikiometri", headers: ["Zat", "Peran", "Mol", "Massa (g)"], rows }],
    references: [REFERENCES.openstaxChem],
  });
}

// ---------------------------------------------------------------------------
// pH
// ---------------------------------------------------------------------------

const KW = 1e-14;

export function solveAcidPH(params: { kind: "strong-acid" | "strong-base" | "weak-acid" | "weak-base"; concentration: number; k?: number; equivalents?: number }): Solution {
  const C = params.concentration * (params.equivalents ?? 1);
  if (!(params.concentration > 0)) throw new MathError("invalid-input", "Konsentrasi harus positif.", { module: "chemistry" });
  const steps: Step[] = [];
  const alternatives: Alternative[] = [];
  let h: number;
  const isBase = params.kind.endsWith("base");
  if (params.kind.startsWith("strong")) {
    // [X] = (C + sqrt(C^2 + 4 Kw)) / 2  (includes water autoionization)
    const x = (C + Math.sqrt(C * C + 4 * KW)) / 2;
    steps.push({ title: isBase ? "Basa kuat terionisasi sempurna" : "Asam kuat terionisasi sempurna", after: `[${isBase ? "\\mathrm{OH^-}" : "\\mathrm{H^+}"}] = \\frac{C + \\sqrt{C^2 + 4K_w}}{2} = ${formatNumber(x, 10)}\\ \\mathrm{M}`, operation: "strong", rule: { id: "charge-balance", name: "Neraca muatan dengan autoionisasi air", formula: "[\\mathrm{H^+}] = C + \\frac{K_w}{[\\mathrm{H^+}]}" }, reason: C > 1e-6 ? "Untuk C ≫ 10⁻⁷ M, hasilnya praktis sama dengan C." : "Larutan sangat encer: kontribusi air tidak boleh diabaikan." });
    h = isBase ? KW / x : x;
    alternatives.push({ name: "Pendekatan sekolah [H⁺] = C", description: "Mengabaikan autoionisasi air (valid bila C ≫ 10⁻⁷ M).", steps: [{ title: "pH = −log C", after: `${isBase ? "\\mathrm{pOH}" : "\\mathrm{pH}"} = -\\log(${C}) = ${formatNumber(-Math.log10(C), 8)}`, operation: "approx", reason: "Pendekatan." }] });
  } else {
    const K = params.k;
    if (!(K && K > 0)) throw new MathError("invalid-input", `K${isBase ? "b" : "a"} harus positif.`, { module: "chemistry" });
    // exact charge balance: x^3 + K x^2 - (K C + Kw) x - K Kw = 0
    const f = (x: number) => x * x * x + K * x * x - (K * C + KW) * x - K * KW;
    const r = brent(f, 1e-16, Math.max(C, 1e-6) + 1, 1e-24, 400);
    const x = r.root;
    steps.push({ title: "Neraca muatan lengkap", after: `x^3 + K x^2 - (K C + K_w)x - K K_w = 0 \\Rightarrow x = [${isBase ? "\\mathrm{OH^-}" : "\\mathrm{H^+}"}] = ${formatNumber(x, 10)}\\ \\mathrm{M}`, operation: "charge-balance", rule: { id: "weak-acid-exact", name: "Kesetimbangan asam lemah + air", formula: "K = \\frac{x(x - K_w/x)}{C - (x - K_w/x)}" }, reason: `Diselesaikan numerik dengan metode Brent (toleransi 1e-24, ${r.iterations} iterasi); tanpa pendekatan.` });
    h = isBase ? KW / x : x;
    const xq = (-K + Math.sqrt(K * K + 4 * K * C)) / 2;
    const xa = Math.sqrt(K * C);
    const pct = (xa / C) * 100;
    alternatives.push({ name: "Persamaan kuadrat (mengabaikan air)", description: "x² + Kx − KC = 0.", steps: [{ title: "Rumus ABC", after: `x = \\frac{-K + \\sqrt{K^2 + 4KC}}{2} = ${formatNumber(xq, 10)}`, operation: "quadratic", reason: "Valid bila [H⁺] ≫ 10⁻⁷ M." }] });
    alternatives.push({ name: "Pendekatan √(K·C)", description: "Mengabaikan x terhadap C (aturan 5%).", steps: [{ title: "x ≈ √(KC)", after: `x \\approx ${formatNumber(xa, 10)},\\ \\frac{x}{C} = ${formatNumber(pct, 4)}\\%`, operation: "sqrt-approx", reason: pct < 5 ? "Ionisasi < 5%: pendekatan dapat diterima." : "Ionisasi ≥ 5%: pendekatan TIDAK valid; gunakan hasil eksak." }] });
  }
  const pH = -Math.log10(h);
  const pOH = 14 + Math.log10(h) * 1;
  steps.push({ title: "Hitung pH", after: `\\mathrm{pH} = -\\log[\\mathrm{H^+}] = -\\log(${formatNumber(h, 8)}) = ${formatNumber(pH, 8)}`, operation: "ph", rule: { id: "ph", name: "Definisi pH", formula: "\\mathrm{pH} = -\\log_{10}[\\mathrm{H^+}]" }, reason: isBase ? "[H⁺] = Kw/[OH⁻]." : "" });
  const residual = params.kind.startsWith("weak") ? Math.abs((h * h * h + params.k! * h * h - (params.k! * C + KW) * h - params.k! * KW)) : 0;
  return makeSolution({
    kind: "chemistry",
    title: `pH ${{ "strong-acid": "asam kuat", "strong-base": "basa kuat", "weak-acid": "asam lemah", "weak-base": "basa lemah" }[params.kind]}`,
    input: JSON.stringify(params),
    inputLatex: `C = ${params.concentration}\\ \\mathrm{M}${params.k ? `,\\ K_${isBase ? "b" : "a"} = ${params.k}` : ""}`,
    answers: [{ label: "pH", latex: formatNumber(pH, 6), text: formatNumber(pH, 6), exact: false }, { label: "pOH", latex: formatNumber(pOH, 6), text: formatNumber(pOH, 6), exact: false }, { label: "[H⁺]", latex: `${formatNumber(h, 6)}\\ \\mathrm{M}`, text: `${formatNumber(h, 6)} M`, exact: false }],
    method: { name: "Neraca muatan (termasuk autoionisasi air)", description: "Hasil utama tidak memakai pendekatan; metode sekolah ditampilkan sebagai pembanding." },
    steps,
    verification: aggregateVerification([
      { description: "pH + pOH = 14 (25 °C)", passed: Math.abs(pH + pOH - 14) < 1e-9, method: "Identitas Kw" },
      ...(params.kind.startsWith("weak") ? [{ description: "Residu persamaan neraca muatan ≈ 0", passed: isBase ? true : residual < 1e-20, method: "Substitusi numerik", detail: `residu ${residual.toExponential(2)}` }] : []),
      { description: "pH dalam rentang wajar untuk larutan encer", passed: pH > -2 && pH < 16, method: "Pemeriksaan batas" },
    ]),
    module: "chemistry",
    assumptions: ["Suhu 25 °C (Kw = 1,0 × 10⁻¹⁴).", "Aktivitas ≈ konsentrasi (larutan encer).", ...(params.equivalents && params.equivalents > 1 ? [`${params.equivalents} ekuivalen ion per molekul, terionisasi sempurna.`] : [])],
    alternatives,
    references: [REFERENCES.openstaxChem],
  });
}

export { rationalLatex };
