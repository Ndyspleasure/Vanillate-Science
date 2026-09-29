"use client";

import { Loader2, Play, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { addHistory } from "@/lib/storage";
import { ErrorView } from "../solution/ErrorView";
import { SolutionView } from "../solution/SolutionView";
import { Tex } from "../Tex";
import { useEngineRun } from "./useEngineRun";

export interface FormulaVarView {
  s: string;
  name: string;
  unit: string;
  latex: string;
  /** Compatible units offered in the dropdown (first = default). */
  units: string[];
  constant?: { name: string; value: string; unit: string; source: string };
  defaultValue?: string;
}

export interface FormulaView {
  id: string;
  name: string;
  latex: string;
  variables: FormulaVarView[];
  example: { solveFor: string; values: Record<string, string> };
}

type Entry = { value: string; unit: string };

function initialValues(f: FormulaView): Record<string, Entry> {
  const out: Record<string, Entry> = {};
  for (const v of f.variables) out[v.s] = { value: f.example.values[v.s] ?? v.defaultValue ?? "", unit: v.unit };
  return out;
}

const inputCls = "w-full min-w-0 rounded-l-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-text focus:border-accent focus:outline-none";
const selectCls = "rounded-r-lg border border-l-0 border-border bg-surface-2 px-2 py-2 text-sm text-text";

export function FormulaCalculator({ formula }: { formula: FormulaView }) {
  const uid = useId();
  const solvable = formula.variables.filter((v) => !v.constant);
  const [solveFor, setSolveFor] = useState(formula.example.solveFor);
  const [values, setValues] = useState<Record<string, Entry>>(() => initialValues(formula));
  const [outputUnit, setOutputUnit] = useState(() => formula.variables.find((v) => v.s === formula.example.solveFor)?.unit ?? "");
  const { busy, outcome, run } = useEngineRun();
  const [shareUrl, setShareUrl] = useState<string>();
  const didInit = useRef(false);
  const target = formula.variables.find((v) => v.s === solveFor)!;

  const submit = async (sf: string, vals: Record<string, Entry>, out: string) => {
    const given: Record<string, { value: string; unit?: string }> = {};
    for (const v of formula.variables) {
      if (v.s === sf || v.constant) continue;
      given[v.s] = { value: vals[v.s]?.value ?? "", unit: vals[v.s]?.unit || v.unit };
    }
    const res = await run({ type: "formula", input: { formulaId: formula.id, solveFor: sf, values: given, outputUnit: out || undefined } });
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("cari", sf);
    for (const [k, q] of Object.entries(given)) {
      if (q.value) url.searchParams.set(k, q.value);
      if (q.unit && q.unit !== formula.variables.find((v) => v.s === k)?.unit) url.searchParams.set(`${k}_satuan`, q.unit);
    }
    if (out) url.searchParams.set("satuan", out);
    window.history.replaceState(window.history.state, "", url.toString());
    setShareUrl(url.toString());
    if (res?.ok) addHistory({ kind: "formula", title: formula.name, input: `${target?.name ?? sf} = ?`, href: `${url.pathname}${url.search}`, answer: res.solution.answers[0]?.text });
  };

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const p = new URLSearchParams(window.location.search);
    const sf = p.get("cari");
    if (!sf || !solvable.some((v) => v.s === sf)) return;
    const vals = initialValues(formula);
    for (const v of formula.variables) {
      const val = p.get(v.s);
      if (val !== null) vals[v.s] = { value: val, unit: p.get(`${v.s}_satuan`) ?? v.unit };
    }
    const out = p.get("satuan") ?? formula.variables.find((v) => v.s === sf)!.unit;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSolveFor(sf);
    setValues(vals);
    setOutputUnit(out);
    void submit(sf, vals, out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEntry = (s: string, patch: Partial<Entry>) => setValues((cur) => ({ ...cur, [s]: { ...cur[s], ...patch } }));

  return (
    <div className="space-y-6">
      <form
        className="space-y-5 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(solveFor, values, outputUnit);
        }}
        aria-label={`Kalkulator ${formula.name}`}
      >
        <div className="rounded-xl bg-surface-2/60 px-4 py-3 text-center text-lg">
          <Tex tex={formula.latex} display />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text">Besaran yang dicari</legend>
          <div className="flex flex-wrap gap-2">
            {solvable.map((v) => (
              <label key={v.s} className="cursor-pointer">
                <input
                  type="radio"
                  name={`${uid}-cari`}
                  value={v.s}
                  checked={solveFor === v.s}
                  onChange={() => {
                    setSolveFor(v.s);
                    setOutputUnit(v.unit);
                  }}
                  className="peer sr-only"
                />
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-strong peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--focus)]">
                  <Tex tex={v.latex} /> <span>{v.name}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          {formula.variables
            .filter((v) => v.s !== solveFor)
            .map((v) => {
              const id = `${uid}-${v.s}`;
              if (v.constant) {
                return (
                  <div key={v.s} className="rounded-lg border border-dashed border-border px-3 py-2 text-sm">
                    <p className="font-medium text-text">
                      <Tex tex={v.latex} /> — {v.constant.name}
                    </p>
                    <p className="font-mono text-xs text-muted">
                      {v.constant.value} {v.constant.unit} ({v.constant.source})
                    </p>
                  </div>
                );
              }
              return (
                <div key={v.s}>
                  <label htmlFor={id} className="mb-1 flex items-baseline gap-1.5 text-sm font-medium text-text">
                    <Tex tex={v.latex} /> <span>{v.name}</span>
                  </label>
                  <div className="flex">
                    <input id={id} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={values[v.s]?.value ?? ""} onChange={(e) => setEntry(v.s, { value: e.target.value })} className={`${inputCls} ${v.units.length === 0 ? "rounded-r-lg" : ""}`} placeholder="nilai" />
                    {v.units.length > 0 && (
                      <select aria-label={`Satuan ${v.name}`} value={values[v.s]?.unit ?? v.unit} onChange={(e) => setEntry(v.s, { unit: e.target.value })} className={selectCls}>
                        {v.units.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {target && target.units.length > 1 && (
            <label className="text-sm">
              <span className="mb-1 block font-medium text-text">Satuan hasil</span>
              <select value={outputUnit} onChange={(e) => setOutputUnit(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text">
                {target.units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-contrast shadow-sm hover:bg-accent-strong disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />}
            {busy ? "Menghitung…" : `Hitung ${target?.name ?? ""}`}
          </button>
          <button
            type="button"
            onClick={() => {
              setSolveFor(formula.example.solveFor);
              setValues(initialValues(formula));
              setOutputUnit(formula.variables.find((v) => v.s === formula.example.solveFor)?.unit ?? "");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text"
          >
            <RotateCcw size={14} aria-hidden /> Contoh
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {outcome?.ok && <SolutionView solution={outcome.solution} shareUrl={shareUrl} entry={shareUrl ? { kind: "formula", title: formula.name, input: formula.name, href: new URL(shareUrl).pathname + new URL(shareUrl).search, answer: outcome.solution.answers[0]?.text } : undefined} />}
        {outcome && !outcome.ok && <ErrorView error={outcome.error} />}
      </div>
    </div>
  );
}
