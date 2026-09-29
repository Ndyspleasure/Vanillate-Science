"use client";

import Link from "next/link";
import { useState } from "react";

export interface ElementView {
  z: number;
  symbol: string;
  name: string;
  nameEn: string;
  weight: string;
  standard: boolean;
  period: number;
  group: number | null;
  category: string;
}

const CATEGORY_STYLE: Record<string, string> = {
  "logam alkali": "bg-[#fde2e2] text-[#7a1f1f] dark:bg-[#4a1d1d] dark:text-[#fecaca]",
  "logam alkali tanah": "bg-[#fdebd3] text-[#7a4210] dark:bg-[#4a2f14] dark:text-[#fed7aa]",
  "logam transisi": "bg-[#fef6c7] text-[#6b5610] dark:bg-[#3d3510] dark:text-[#fde68a]",
  "logam pasca-transisi": "bg-[#e3f1dc] text-[#2f5a1d] dark:bg-[#20361a] dark:text-[#bbf7d0]",
  metaloid: "bg-[#d9f2ec] text-[#1b5a4c] dark:bg-[#15382f] dark:text-[#99f6e4]",
  nonlogam: "bg-[#dbeafe] text-[#1e3a8a] dark:bg-[#172554] dark:text-[#bfdbfe]",
  halogen: "bg-[#e0e7ff] text-[#3730a3] dark:bg-[#232a5c] dark:text-[#c7d2fe]",
  "gas mulia": "bg-[#f3e8ff] text-[#5b21b6] dark:bg-[#2e1a4d] dark:text-[#e9d5ff]",
  lantanida: "bg-[#fce7f3] text-[#9d174d] dark:bg-[#4a1532] dark:text-[#fbcfe8]",
  aktinida: "bg-[#ffe4e6] text-[#9f1239] dark:bg-[#4c1522] dark:text-[#fecdd3]",
};

function position(e: ElementView): { row: number; col: number } {
  if (e.group !== null) return { row: e.period, col: e.group };
  // f-block: separate rows 9 (lanthanides) and 10 (actinides), columns 3..17
  const first = e.period === 6 ? 57 : 89;
  return { row: e.period === 6 ? 9 : 10, col: 3 + (e.z - first) };
}

export function PeriodicTable({ elements }: { elements: ElementView[] }) {
  const [selected, setSelected] = useState<ElementView | null>(elements.find((e) => e.symbol === "C") ?? null);
  const categories = Object.keys(CATEGORY_STYLE);
  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface p-3">
        <div className="grid min-w-[760px] gap-1" style={{ gridTemplateColumns: "repeat(18, minmax(0, 1fr))", gridTemplateRows: "repeat(10, auto)" }} role="grid" aria-label="Tabel periodik unsur">
          {elements.map((e) => {
            const { row, col } = position(e);
            const active = selected?.z === e.z;
            return (
              <button
                key={e.z}
                type="button"
                onClick={() => setSelected(e)}
                style={{ gridRow: row, gridColumn: col, marginTop: row >= 9 ? 8 : 0 }}
                aria-pressed={active}
                aria-label={`${e.name} (${e.symbol}), nomor atom ${e.z}`}
                className={`flex aspect-square flex-col items-center justify-center rounded-md text-center leading-none transition-transform hover:scale-105 ${CATEGORY_STYLE[e.category] ?? "bg-surface-2"} ${active ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : ""}`}
              >
                <span className="text-[9px] opacity-70">{e.z}</span>
                <span className="text-sm font-bold">{e.symbol}</span>
              </button>
            );
          })}
          <div style={{ gridRow: 6, gridColumn: 3 }} className="flex items-center justify-center text-[10px] text-muted">
            57–71
          </div>
          <div style={{ gridRow: 7, gridColumn: 3 }} className="flex items-center justify-center text-[10px] text-muted">
            89–103
          </div>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2 text-xs" aria-label="Keterangan kategori">
        {categories.map((c) => (
          <li key={c} className={`rounded-full px-2.5 py-1 ${CATEGORY_STYLE[c]}`}>
            {c}
          </li>
        ))}
      </ul>
      {selected && (
        <section aria-live="polite" className="grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-[auto_1fr]">
          <div className={`flex h-28 w-28 flex-col items-center justify-center rounded-xl ${CATEGORY_STYLE[selected.category]}`}>
            <span className="text-xs">{selected.z}</span>
            <span className="text-4xl font-bold">{selected.symbol}</span>
            <span className="text-xs">{selected.weight}</span>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-text">
              {selected.name} <span className="text-base font-normal text-muted">({selected.nameEn})</span>
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Nomor atom</dt>
                <dd className="font-mono text-text">{selected.z}</dd>
              </div>
              <div>
                <dt className="text-muted">Massa atom</dt>
                <dd className="font-mono text-text">
                  {selected.standard ? selected.weight : `[${selected.weight}]`}{selected.standard ? "" : " (nomor massa isotop berumur panjang)"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Kategori</dt>
                <dd className="text-text">{selected.category}</dd>
              </div>
              <div>
                <dt className="text-muted">Periode</dt>
                <dd className="font-mono text-text">{selected.period}</dd>
              </div>
              <div>
                <dt className="text-muted">Golongan</dt>
                <dd className="font-mono text-text">{selected.group ?? "blok f"}</dd>
              </div>
            </dl>
            <Link href={`/calculator/chemistry/massa-molar?formula=${encodeURIComponent(selected.symbol)}`} className="inline-block text-sm font-medium text-accent hover:underline">
              Hitung massa molar senyawa dengan {selected.symbol} →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
