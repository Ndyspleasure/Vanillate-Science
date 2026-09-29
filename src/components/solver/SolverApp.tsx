"use client";

import { Keyboard, Loader2, Play, Square, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SolveOutcome } from "@/engine/api";
import { MODE_LABELS, type Mode } from "@/engine/modes";
import type { PreviewOutcome } from "@/engine/router";
import { cancelEngine, runEngine } from "@/lib/engine-client";
import { addHistory } from "@/lib/storage";
import { ErrorView } from "../solution/ErrorView";
import { SolutionView } from "../solution/SolutionView";
import { Tex } from "../Tex";
import { MathKeyboard, type KeyDef } from "./MathKeyboard";

export interface ExampleGroup {
  label: string;
  items: string[];
}

export interface SolverAppProps {
  examples?: ExampleGroup[];
  /** Fixed solver mode for specialised calculator pages. */
  presetMode?: Mode;
  placeholder?: string;
  /** Base path used to build share links (defaults to the current path). */
  autoFocus?: boolean;
  heading?: string;
}

const MODES = Object.keys(MODE_LABELS) as Mode[];

export function SolverApp({
  examples = [],
  presetMode,
  placeholder = "Ketik soal, misalnya: x^2 - 5x + 6 = 0",
  autoFocus = false,
  heading,
}: SolverAppProps) {
  const params = useSearchParams();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState(() => params.get("q") ?? "");
  const [mode, setMode] = useState<Mode>(() => {
    const m = params.get("mode");
    return presetMode ?? (m && (MODES as string[]).includes(m) ? (m as Mode) : "auto");
  });
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [preview, setPreview] = useState<PreviewOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SolveOutcome | null>(null);
  const [solvedInput, setSolvedInput] = useState("");
  const [shareUrl, setShareUrl] = useState<string | undefined>(undefined);
  const resultRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);
  const pendingCaret = useRef<number | null>(null);

  // Live preview of how the input is understood (debounced, in the worker).
  useEffect(() => {
    const text = input.trim();
    if (!text) return;
    let cancelled = false;
    const t = setTimeout(() => {
      runEngine({ type: "preview", input: text, options: { mode } }, { timeoutMs: 3000 }).then(
        (p) => {
          if (!cancelled) setPreview(p);
        },
      );
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [input, mode]);

  const solveNow = useCallback(
    async (raw: string, m: Mode = mode) => {
      const text = raw.trim();
      if (!text || busy) return;
      setBusy(true);
      setOutcome(null);
      const res = await runEngine({ type: "solve", input: text, options: { mode: m } });
      setBusy(false);
      setOutcome(res);
      setSolvedInput(text);
      const url = new URL(window.location.href);
      url.searchParams.set("q", text);
      if (m !== "auto" && !presetMode) url.searchParams.set("mode", m);
      else url.searchParams.delete("mode");
      window.history.replaceState(window.history.state, "", url.toString());
      setShareUrl(url.toString());
      if (res.ok) {
        addHistory({
          kind: "solve",
          title: res.solution.title,
          input: text,
          href: `${url.pathname}${url.search}`,
          answer: res.solution.answers[0]?.text,
        });
      }
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    },
    [busy, mode, presetMode],
  );

  // Solve the query from a shared link once (deferred so it runs after the first paint).
  useEffect(() => {
    const q = params.get("q");
    if (!q || autoRan.current) return;
    const t = setTimeout(() => {
      autoRan.current = true;
      void solveNow(q);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insert = (k: KeyDef) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    const selected = input.slice(start, end);
    let text = k.insert;
    let caret: number;
    if (text.includes("|")) {
      const idx = text.indexOf("|");
      text = text.replace("|", selected);
      caret = start + idx + selected.length;
    } else caret = start + text.length;
    const next = input.slice(0, start) + text + input.slice(end);
    pendingCaret.current = caret;
    setInput(next);
  };

  // Place the caret right after the React commit (before the next keystroke can arrive).
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null) return;
    pendingCaret.current = null;
    const el = inputRef.current;
    el?.focus();
    el?.setSelectionRange(caret, caret);
  }, [input]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void solveNow(input);
    }
  };

  const text = input.trim();
  const shownPreview = text ? preview : null;

  return (
    <div className="space-y-6">
      <form
        className="rounded-2xl border border-border bg-surface p-3 shadow-sm sm:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void solveNow(input);
        }}
        role="search"
        aria-label={heading ?? "Masukkan soal"}
      >
        <label htmlFor="soal" className="sr-only">
          Soal matematika atau sains
        </label>
        <div className="flex items-start gap-2">
          <textarea
            id="soal"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            autoFocus={autoFocus}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            maxLength={2000}
            aria-describedby="soal-preview soal-hint"
            className="field-sizing-content min-h-12 w-full resize-none rounded-xl border border-border bg-bg px-4 py-3 font-mono text-base text-text placeholder:text-muted/70 focus:border-accent focus:outline-none sm:text-lg"
          />
          {input && (
            <button
              type="button"
              onClick={() => setInput("")}
              className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
              aria-label="Hapus input"
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </div>

        <div id="soal-preview" aria-live="polite" className="min-h-9 px-1 pt-2 text-sm">
          {shownPreview?.ok && (
            <div className="flex flex-wrap items-baseline gap-x-2 text-text">
              <span className="text-xs text-muted">Dibaca sebagai:</span>
              <Tex tex={shownPreview.latex} className="text-base" />
              {shownPreview.mode !== "auto" && (
                <span className="rounded bg-accent-soft px-1.5 text-xs text-accent-strong">
                  {MODE_LABELS[shownPreview.mode]}
                </span>
              )}
            </div>
          )}
          {shownPreview?.ok && shownPreview.warnings.length > 0 && (
            <p className="mt-1 text-xs text-warn">{shownPreview.warnings.join(" ")}</p>
          )}
          {shownPreview && !shownPreview.ok && (
            <p className="text-xs text-bad">{shownPreview.error.message}</p>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!presetMode && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="sr-only sm:not-sr-only">Mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => setShowKeyboard((s) => !s)}
            aria-pressed={showKeyboard}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-text aria-pressed:border-accent aria-pressed:text-accent"
          >
            <Keyboard size={16} aria-hidden /> Tombol
          </button>
          <span id="soal-hint" className="hidden text-xs text-muted md:inline">
            Enter untuk menghitung · Shift+Enter baris baru
          </span>
          <div className="ml-auto flex items-center gap-2">
            {busy && (
              <button
                type="button"
                onClick={() => {
                  cancelEngine();
                  setBusy(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-text"
              >
                <Square size={14} aria-hidden /> Batal
              </button>
            )}
            <button
              type="submit"
              disabled={!text || busy}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-contrast shadow-sm hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                <Play size={16} aria-hidden />
              )}
              {busy ? "Menghitung…" : "Hitung"}
            </button>
          </div>
        </div>
        {showKeyboard && (
          <div className="mt-3">
            <MathKeyboard onInsert={insert} />
          </div>
        )}
      </form>

      {examples.length > 0 && !outcome && !busy && (
        <section aria-label="Contoh soal" className="space-y-3">
          {examples.map((g) => (
            <div key={g.label} className="flex flex-wrap items-center gap-2">
              <span className="w-full text-xs font-semibold uppercase tracking-wide text-muted sm:w-28">
                {g.label}
              </span>
              {g.items.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setInput(ex);
                    void solveNow(ex);
                  }}
                  className="rounded-full border border-border bg-surface px-3 py-1 font-mono text-[13px] text-text hover:border-accent hover:text-accent"
                >
                  {ex}
                </button>
              ))}
            </div>
          ))}
        </section>
      )}

      <div ref={resultRef} className="scroll-mt-20" aria-live="polite" aria-busy={busy}>
        {busy && (
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
            <Loader2 size={18} className="animate-spin text-accent" aria-hidden /> Mesin sedang
            menghitung dan memverifikasi…
          </div>
        )}
        {!busy && outcome?.ok && (
          <SolutionView
            solution={outcome.solution}
            shareUrl={shareUrl}
            entry={{
              kind: "solve",
              title: outcome.solution.title,
              input: solvedInput,
              href: shareUrl ? new URL(shareUrl).pathname + new URL(shareUrl).search : "/",
              answer: outcome.solution.answers[0]?.text,
            }}
          />
        )}
        {!busy && outcome && !outcome.ok && <ErrorView error={outcome.error} input={solvedInput} />}
      </div>
    </div>
  );
}
