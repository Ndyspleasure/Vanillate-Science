"use client";

import { useState } from "react";

export interface KeyDef {
  /** Label shown on the key. */
  label: string;
  /** Text inserted at the cursor. "|" marks where the cursor goes afterwards. */
  insert: string;
  aria?: string;
}

const GROUPS: { id: string; label: string; keys: KeyDef[] }[] = [
  {
    id: "dasar",
    label: "Dasar",
    keys: [
      { label: "x", insert: "x" },
      { label: "y", insert: "y" },
      { label: "=", insert: " = " },
      { label: "(", insert: "(" },
      { label: ")", insert: ")" },
      { label: "xⁿ", insert: "^", aria: "pangkat" },
      { label: "x²", insert: "^2", aria: "kuadrat" },
      { label: "√", insert: "sqrt(|)", aria: "akar kuadrat" },
      { label: "∛", insert: "cbrt(|)", aria: "akar pangkat tiga" },
      { label: "a⁄b", insert: "/", aria: "bagi / pecahan" },
      { label: "×", insert: "*", aria: "kali" },
      { label: "π", insert: "pi", aria: "pi" },
      { label: "e", insert: "e", aria: "bilangan Euler" },
      { label: "|x|", insert: "abs(|)", aria: "nilai mutlak" },
      { label: "n!", insert: "!", aria: "faktorial" },
      { label: "%", insert: "%", aria: "persen" },
    ],
  },
  {
    id: "fungsi",
    label: "Fungsi",
    keys: [
      { label: "sin", insert: "sin(|)" },
      { label: "cos", insert: "cos(|)" },
      { label: "tan", insert: "tan(|)" },
      { label: "sin⁻¹", insert: "asin(|)", aria: "arcsin" },
      { label: "cos⁻¹", insert: "acos(|)", aria: "arccos" },
      { label: "tan⁻¹", insert: "atan(|)", aria: "arctan" },
      { label: "ln", insert: "ln(|)", aria: "logaritma natural" },
      { label: "log", insert: "log(|)", aria: "logaritma basis 10" },
      { label: "logₐ", insert: "log(|, 2)", aria: "logaritma basis a" },
      { label: "eˣ", insert: "exp(|)", aria: "eksponensial" },
      { label: "°", insert: "°", aria: "derajat" },
      { label: "i", insert: "i", aria: "satuan imajiner" },
      { label: "nCr", insert: "nCr(|, )", aria: "kombinasi" },
      { label: "nPr", insert: "nPr(|, )", aria: "permutasi" },
      { label: "fpb", insert: "gcd(|, )", aria: "FPB" },
      { label: "kpk", insert: "lcm(|, )", aria: "KPK" },
    ],
  },
  {
    id: "kalkulus",
    label: "Kalkulus",
    keys: [
      { label: "d/dx", insert: "d/dx (|)", aria: "turunan terhadap x" },
      { label: "∫", insert: "integral |", aria: "integral tak tentu" },
      { label: "∫ₐᵇ", insert: "integral from 0 to 1 of |", aria: "integral tentu" },
      { label: "lim", insert: "lim x->0 |", aria: "limit" },
      { label: "→∞", insert: "inf", aria: "tak hingga" },
      { label: "Σ", insert: "sum(|, k, 1, n)", aria: "sigma" },
      { label: "taylor", insert: "taylor(|, x, 0, 5)", aria: "deret Taylor" },
      { label: "ekstrem", insert: "extrema(|)", aria: "titik ekstrem" },
    ],
  },
  {
    id: "relasi",
    label: "Relasi & Matriks",
    keys: [
      { label: "<", insert: " < " },
      { label: "≤", insert: " <= ", aria: "kurang dari sama dengan" },
      { label: ">", insert: " > " },
      { label: "≥", insert: " >= ", aria: "lebih dari sama dengan" },
      { label: ";", insert: "; ", aria: "pemisah persamaan" },
      { label: "[ ]", insert: "[[|, ], [, ]]", aria: "matriks 2×2" },
      { label: "det", insert: "det(|)", aria: "determinan" },
      { label: "inv", insert: "inv(|)", aria: "invers matriks" },
      { label: "eigen", insert: "eigen(|)", aria: "nilai eigen" },
      { label: "rref", insert: "rref(|)", aria: "bentuk eselon baris tereduksi" },
    ],
  },
];

export function MathKeyboard({ onInsert }: { onInsert: (k: KeyDef) => void }) {
  const [group, setGroup] = useState(GROUPS[0].id);
  const current = GROUPS.find((g) => g.id === group) ?? GROUPS[0];
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-2">
      <div className="mb-2 flex gap-1 overflow-x-auto" role="group" aria-label="Kelompok tombol">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={g.id === group}
            onClick={() => setGroup(g.id)}
            className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:text-text aria-pressed:bg-surface aria-pressed:text-accent-strong aria-pressed:shadow-sm"
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-[repeat(16,minmax(0,1fr))]">
        {current.keys.map((k) => (
          <button
            key={k.label}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInsert(k)}
            aria-label={k.aria ?? k.label}
            className="h-10 min-w-0 rounded-md border border-border bg-surface px-1 font-mono text-sm text-text shadow-[0_1px_0_var(--border)] hover:border-accent hover:text-accent active:translate-y-px"
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
