"use client";

import { Loader2, Play, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ToolField, Values } from "@/engine/forms";
import { addHistory } from "@/lib/storage";
import { ErrorView } from "../solution/ErrorView";
import { SolutionView } from "../solution/SolutionView";
import { FieldInput } from "./FieldInput";
import { useEngineRun } from "./useEngineRun";

export interface ToolCalculatorProps {
  toolId: string;
  title: string;
  fields: ToolField[];
  defaults: Values;
}

function visible(f: ToolField, values: Values) {
  return !f.showIf || f.showIf.values.includes(values[f.showIf.field] ?? "");
}

export function ToolCalculator({ toolId, title, fields, defaults }: ToolCalculatorProps) {
  const uid = useId();
  const [values, setValues] = useState<Values>(defaults);
  const { busy, outcome, run } = useEngineRun();
  const [shareUrl, setShareUrl] = useState<string>();
  const didInit = useRef(false);

  const submit = async (v: Values) => {
    const shown: Values = {};
    for (const f of fields) if (visible(f, v)) shown[f.name] = v[f.name] ?? "";
    const res = await run({ type: "tool", tool: toolId, values: shown });
    const url = new URL(window.location.href);
    url.search = "";
    for (const [k, val] of Object.entries(shown)) if (val !== "") url.searchParams.set(k, val);
    window.history.replaceState(window.history.state, "", url.toString());
    setShareUrl(url.toString());
    if (res?.ok) addHistory({ kind: "tool", title, input: Object.values(shown).filter(Boolean).join(" · ").slice(0, 120), href: `${url.pathname}${url.search}`, answer: res.solution.answers[0]?.text });
  };

  // Prefill from a shared link (?field=value) and compute once.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const params = new URLSearchParams(window.location.search);
    const fromUrl: Values = {};
    for (const f of fields) {
      const v = params.get(f.name);
      if (v !== null) fromUrl[f.name] = v;
    }
    if (Object.keys(fromUrl).length > 0) {
      const merged = { ...defaults, ...fromUrl };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValues(merged);
      void submit(merged);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <form
        className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(values);
        }}
        aria-label={title}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.filter((f) => visible(f, values)).map((f) => (
            <FieldInput key={f.name} id={`${uid}-${f.name}`} field={f} value={values[f.name] ?? ""} onChange={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))} />
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-contrast shadow-sm hover:bg-accent-strong disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />}
            {busy ? "Menghitung…" : "Hitung"}
          </button>
          <button type="button" onClick={() => setValues(defaults)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text">
            <RotateCcw size={14} aria-hidden /> Contoh
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {outcome?.ok && <SolutionView solution={outcome.solution} shareUrl={shareUrl} entry={shareUrl ? { kind: "tool", title, input: title, href: new URL(shareUrl).pathname + new URL(shareUrl).search, answer: outcome.solution.answers[0]?.text } : undefined} />}
        {outcome && !outcome.ok && <ErrorView error={outcome.error} />}
      </div>
    </div>
  );
}
