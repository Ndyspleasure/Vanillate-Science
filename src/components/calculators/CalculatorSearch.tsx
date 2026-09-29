"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface SearchEntry {
  title: string;
  href: string;
  category: string;
  text: string;
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function CalculatorSearch({ entries }: { entries: SearchEntry[] }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return entries
      .map((e) => {
        const hay = norm(`${e.title} ${e.category} ${e.text}`);
        const title = norm(e.title);
        if (!terms.every((t) => hay.includes(t))) return null;
        return { e, score: terms.reduce((s, t) => s + (title.includes(t) ? 2 : 1), 0) };
      })
      .filter((x): x is { e: SearchEntry; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.e);
  }, [q, entries]);
  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Cari kalkulator</span>
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kalkulator: energi kinetik, pH, cicilan, turunan…" className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-4 text-text placeholder:text-muted/70 focus:border-accent focus:outline-none" />
      </label>
      {q.trim() && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface" aria-live="polite">
          {results.length === 0 && <li className="px-4 py-3 text-sm text-muted">Tidak ada kalkulator yang cocok. Coba ketik soalnya langsung di halaman Solver.</li>}
          {results.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="flex items-baseline justify-between gap-3 px-4 py-2.5 hover:bg-surface-2">
                <span className="text-sm font-medium text-text">{r.title}</span>
                <span className="shrink-0 text-xs text-muted">{r.category}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
