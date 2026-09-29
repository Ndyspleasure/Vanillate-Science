/**
 * Chemical formula parser: H2O, Ca(OH)2, [Cu(NH3)4]SO4, CuSO4·5H2O, SO4^2-, Fe3+, NH4+, e-.
 * State symbols (s), (l), (g), (aq) are ignored.
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { ELEMENT_BY_SYMBOL } from "./elements";

export interface ParsedFormula {
  text: string;
  counts: Map<string, number>;
  charge: number;
  latex: string;
  isElectron: boolean;
}

function fail(text: string, cause: string): MathError {
  return new MathError("invalid-input", `Rumus kimia '${text}' tidak valid.`, {
    module: "chemistry",
    cause,
    hint: "Contoh: H2O, Ca(OH)2, CuSO4·5H2O, SO4^2-, Fe^3+.",
  });
}

export function parseFormula(input: string): ParsedFormula {
  let text = input
    .trim()
    .replace(/\((s|l|g|aq)\)$/i, "")
    .replace(/\s+/g, "");
  if (!text) throw fail(input, "Rumus kosong.");
  if (text === "e" || text === "e-" || text === "e^-" || text === "e⁻") {
    return {
      text: "e⁻",
      counts: new Map(),
      charge: -1,
      latex: "\\mathrm{e^{-}}",
      isElectron: true,
    };
  }
  // Charge notation (unambiguous rules):
  //   "Fe^3+", "SO4^2-", "Fe+3", "SO4 2-", "Fe³⁺"  -> explicit charge magnitude
  //   "NH4+", "OH-", "Na+"                          -> digits before the sign are subscripts, charge ±1
  let charge = 0;
  const SUP: Record<string, string> = {
    "⁰": "0",
    "¹": "1",
    "²": "2",
    "³": "3",
    "⁴": "4",
    "⁵": "5",
    "⁶": "6",
    "⁷": "7",
    "⁸": "8",
    "⁹": "9",
    "⁺": "+",
    "⁻": "-",
  };
  const raw = input
    .trim()
    .replace(/\((s|l|g|aq)\)$/i, "")
    .trim();
  let body = raw.replace(
    /([⁰¹²³⁴⁵⁶⁷⁸⁹]*[⁺⁻])$/,
    (m) =>
      `^${m
        .split("")
        .map((c) => SUP[c])
        .join("")}`,
  );
  const spaced = /^(.*\S)\s+(\d*)([+-])$/.exec(body);
  let m: RegExpExecArray | null;
  if (spaced) {
    body = spaced[1];
    charge = (spaced[3] === "+" ? 1 : -1) * (spaced[2] ? parseInt(spaced[2], 10) : 1);
  } else if ((m = /\^(\d*)([+-])$/.exec(body))) {
    charge = (m[2] === "+" ? 1 : -1) * (m[1] ? parseInt(m[1], 10) : 1);
    body = body.slice(0, m.index);
  } else if ((m = /\^?([+-])(\d+)$/.exec(body))) {
    charge = (m[1] === "+" ? 1 : -1) * parseInt(m[2], 10);
    body = body.slice(0, m.index);
  } else if ((m = /([+-]+)$/.exec(body))) {
    charge = (m[1][0] === "+" ? 1 : -1) * m[1].length;
    body = body.slice(0, m.index);
  }
  text = body.replace(/\s+/g, "");
  if (!text) throw fail(input, "Tidak ada unsur.");
  const parts = text.split(/[·*•.]/);
  const total = new Map<string, number>();
  const latexParts: string[] = [];
  for (const [pi, part0] of parts.entries()) {
    let part = part0;
    let mult = 1;
    const lead = /^(\d+)/.exec(part);
    if (lead && pi > 0) {
      mult = parseInt(lead[1], 10);
      part = part.slice(lead[1].length);
    }
    let i = 0;
    const parseGroup = (close?: string): Map<string, number> => {
      const counts = new Map<string, number>();
      while (i < part.length) {
        const ch = part[i];
        if (ch === "(" || ch === "[" || ch === "{") {
          const closer = ch === "(" ? ")" : ch === "[" ? "]" : "}";
          i++;
          const inner = parseGroup(closer);
          if (part[i] !== closer) throw fail(input, `Kurung '${ch}' tidak ditutup.`);
          i++;
          const n = readCount();
          for (const [k, v] of inner) counts.set(k, (counts.get(k) ?? 0) + v * n);
          continue;
        }
        if (ch === ")" || ch === "]" || ch === "}") {
          if (!close) throw fail(input, `Kurung tutup '${ch}' tanpa pasangan.`);
          return counts;
        }
        const m = /^[A-Z][a-z]?/.exec(part.slice(i));
        if (!m)
          throw fail(
            input,
            `Karakter '${ch}' tidak dikenali (simbol unsur diawali huruf kapital).`,
          );
        let sym = m[0];
        if (!ELEMENT_BY_SYMBOL[sym] && sym.length === 2 && ELEMENT_BY_SYMBOL[sym[0]]) sym = sym[0];
        if (!ELEMENT_BY_SYMBOL[sym]) throw fail(input, `'${m[0]}' bukan simbol unsur.`);
        i += sym.length;
        const n = readCount();
        counts.set(sym, (counts.get(sym) ?? 0) + n);
      }
      if (close) throw fail(input, `Kurung '${close}' tidak ditutup.`);
      return counts;
    };
    const readCount = (): number => {
      const m = /^\d+/.exec(part.slice(i));
      if (!m) return 1;
      i += m[0].length;
      const n = parseInt(m[0], 10);
      if (n === 0) throw fail(input, "Indeks 0 tidak valid.");
      return n;
    };
    const counts = parseGroup();
    for (const [k, v] of counts) total.set(k, (total.get(k) ?? 0) + v * mult);
    latexParts.push(`${mult > 1 ? mult : ""}${part.replace(/(\d+)/g, "_{$1}")}`);
  }
  if (total.size === 0) throw fail(input, "Tidak ada unsur.");
  const chargeLatex =
    charge === 0
      ? ""
      : `^{${Math.abs(charge) > 1 ? Math.abs(charge) : ""}${charge > 0 ? "+" : "-"}}`;
  const latex = `\\mathrm{${latexParts.join("\\cdot ")}${chargeLatex}}`;
  const display = `${text}${charge === 0 ? "" : `${Math.abs(charge) > 1 ? Math.abs(charge) : ""}${charge > 0 ? "+" : "−"}`}`;
  return { text: display, counts: total, charge, latex, isElectron: false };
}

export function molarMass(f: ParsedFormula): {
  value: Rational;
  rows: Array<{
    symbol: string;
    count: number;
    weight: string;
    subtotal: Rational;
    standard: boolean;
  }>;
} {
  let value = Rational.ZERO;
  const rows: Array<{
    symbol: string;
    count: number;
    weight: string;
    subtotal: Rational;
    standard: boolean;
  }> = [];
  for (const [sym, n] of f.counts) {
    const el = ELEMENT_BY_SYMBOL[sym];
    const w = Rational.parseDecimal(el.weight)!;
    const sub = w.mul(Rational.of(n));
    value = value.add(sub);
    rows.push({ symbol: sym, count: n, weight: el.weight, subtotal: sub, standard: el.standard });
  }
  return { value, rows };
}
