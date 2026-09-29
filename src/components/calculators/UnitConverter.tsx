"use client";

import { ArrowLeftRight, Loader2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SolveOutcome } from "@/engine/api";
import { runEngine } from "@/lib/engine-client";
import { addHistory } from "@/lib/storage";
import { ErrorView } from "../solution/ErrorView";
import { SolutionView } from "../solution/SolutionView";
import { useEngineRun } from "./useEngineRun";

export interface UnitConverterProps {
  categories: Record<string, string[]>;
  /** Fixed category (per-quantity pages). */
  category?: string;
}

export function UnitConverter({ categories, category }: UnitConverterProps) {
  const uid = useId();
  const names = Object.keys(categories);
  const [cat, setCat] = useState(category ?? "panjang");
  const units = useMemo(() => categories[cat] ?? [], [categories, cat]);
  const [value, setValue] = useState("1");
  const [from, setFrom] = useState(units[1] ?? units[0] ?? "m");
  const [to, setTo] = useState(units[0] ?? "m");
  const { busy, outcome, run } = useEngineRun();
  const [table, setTable] = useState<Array<{ unit: string; text: string }>>([]);
  const [shareUrl, setShareUrl] = useState<string>();
  const didInit = useRef(false);

  const convert = async (v: string, f: string, t: string) => {
    if (!v.trim() || !f.trim() || !t.trim()) return;
    const res = await run({ type: "units", value: v, from: f, to: t });
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("nilai", v);
    url.searchParams.set("dari", f);
    url.searchParams.set("ke", t);
    window.history.replaceState(window.history.state, "", url.toString());
    setShareUrl(url.toString());
    if (res?.ok) {
      addHistory({
        kind: "units",
        title: "Konversi satuan",
        input: `${v} ${f} → ${t}`,
        href: `${url.pathname}${url.search}`,
        answer: res.solution.answers[0]?.text,
      });
      // Same value in every unit of the category (cheap conversions, run in the worker).
      const list = (categories[cat] ?? []).filter((u) => u !== f);
      const rows = await Promise.all(
        list.map(async (u) => ({
          unit: u,
          res: (await runEngine({ type: "units", value: v, from: f, to: u })) as SolveOutcome,
        })),
      );
      setTable(
        rows
          .filter((r) => r.res.ok)
          .map((r) => ({
            unit: r.unit,
            text: r.res.ok
              ? (r.res.solution.answers[0]?.approx ?? r.res.solution.answers[0]?.text ?? "")
              : "",
          })),
      );
    } else setTable([]);
  };

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const p = new URLSearchParams(window.location.search);
    const v = p.get("nilai");
    const f = p.get("dari");
    const t = p.get("ke");
    if (v && f && t) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(v);
      setFrom(f);
      setTo(t);
      const found = Object.entries(categories).find(([, list]) => list.includes(f));
      if (found && !category) setCat(found[0]);
      void convert(v, f, t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const field =
    "w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-text focus:border-accent focus:outline-none";
  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void convert(value, from, to);
        }}
        aria-label="Konversi satuan"
      >
        {!category && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text">Besaran</span>
            <select
              value={cat}
              onChange={(e) => {
                const c = e.target.value;
                setCat(c);
                setFrom(categories[c][1] ?? categories[c][0]);
                setTo(categories[c][0]);
              }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text sm:w-64"
            >
              {names.map((n) => (
                <option key={n} value={n}>
                  {n.charAt(0).toUpperCase() + n.slice(1)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_1fr]">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text">Nilai</span>
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={field}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text">Dari satuan</span>
            <input
              list={`${uid}-units`}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={field}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
            className="flex h-10 w-10 items-center justify-center self-end rounded-lg border border-border text-muted hover:text-text"
            aria-label="Tukar satuan asal dan tujuan"
          >
            <ArrowLeftRight size={16} aria-hidden />
          </button>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text">Ke satuan</span>
            <input
              list={`${uid}-units`}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={field}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <datalist id={`${uid}-units`}>
            {units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
        <p className="text-xs text-muted">
          Satuan gabungan juga bisa diketik langsung, misalnya kWh, N*m, km/h, g/cm^3, kg*m/s^2.
        </p>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-contrast shadow-sm hover:bg-accent-strong disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Konversi
        </button>
      </form>
      <div aria-live="polite" className="space-y-6">
        {outcome?.ok && (
          <SolutionView
            solution={outcome.solution}
            shareUrl={shareUrl}
            entry={
              shareUrl
                ? {
                    kind: "units",
                    title: "Konversi satuan",
                    input: `${value} ${from} → ${to}`,
                    href: new URL(shareUrl).pathname + new URL(shareUrl).search,
                    answer: outcome.solution.answers[0]?.text,
                  }
                : undefined
            }
          />
        )}
        {outcome && !outcome.ok && <ErrorView error={outcome.error} />}
        {outcome?.ok && table.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold text-text">
              {value} {from} dalam satuan {cat} lain
            </h3>
            <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {table.map((r) => (
                <div
                  key={r.unit}
                  className="flex justify-between gap-3 border-b border-border/60 py-1"
                >
                  <dt className="font-mono text-muted">{r.unit}</dt>
                  <dd className="truncate text-right font-mono text-text">{r.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
