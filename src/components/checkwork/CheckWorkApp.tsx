"use client";

import { CheckCircle2, CircleDashed, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { useState } from "react";
import type { WorkOutcome } from "@/engine/api";
import { runEngine } from "@/lib/engine-client";
import { addHistory } from "@/lib/storage";
import { ErrorView } from "../solution/ErrorView";
import { Tex } from "../Tex";

const EXAMPLES = [
  {
    label: "Persamaan (ada kesalahan)",
    problem: "3(x - 2) = 2x + 4",
    lines: "3x - 2 = 2x + 4\nx - 2 = 4\nx = 6",
  },
  { label: "Persamaan kuadrat (akar hilang)", problem: "x^2 = 5x", lines: "x = 5" },
  { label: "Turunan", problem: "d/dx (x^2 sin(x))", lines: "2x sin(x) + x^2 cos(x)" },
  {
    label: "Integral",
    problem: "integral x cos(x)",
    lines: "x sin(x) - cos(x) + C\nx sin(x) + cos(x) + C",
  },
  {
    label: "Penyederhanaan",
    problem: "(x^2 - 9)/(x - 3)",
    lines: "((x - 3)(x + 3))/(x - 3)\nx + 3",
  },
];

const MODE_LABEL: Record<string, string> = {
  expression: "Penyederhanaan/ekspresi: setiap baris harus setara dengan soal",
  equation: "Persamaan: setiap baris harus memiliki himpunan penyelesaian yang sama",
  derivative: "Turunan: setiap baris harus sama dengan turunan yang benar",
  integral: "Integral: turunan setiap baris harus sama dengan integran",
};

export function CheckWorkApp() {
  const [problem, setProblem] = useState(EXAMPLES[0].problem);
  const [lines, setLines] = useState(EXAMPLES[0].lines);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<WorkOutcome | null>(null);

  const check = async () => {
    setBusy(true);
    const r = await runEngine({ type: "check-work", problem, lines: lines.split("\n") });
    setBusy(false);
    setRes(r);
    if (r.ok)
      addHistory({
        kind: "check",
        title: "Cek pekerjaan",
        input: problem,
        href: "/verifikasi",
        answer: r.result.summary,
      });
  };

  const field =
    "w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-text focus:border-accent focus:outline-none";
  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
        aria-label="Periksa pekerjaan"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text">Soal</span>
          <input
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            className={field}
            spellCheck={false}
            autoComplete="off"
            placeholder="misalnya 2x + 3 = 11"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text">
            Langkah pengerjaan Anda (satu langkah per baris)
          </span>
          <textarea
            value={lines}
            onChange={(e) => setLines(e.target.value)}
            rows={6}
            className={field}
            spellCheck={false}
            placeholder={"2x = 8\nx = 4"}
          />
          <span className="mt-1 block text-xs text-muted">
            Untuk beberapa jawaban tulis “x = 2 atau x = 3”. Untuk integral, “+ C” boleh ditulis.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy || !problem.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-strong disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Periksa
          </button>
          <span className="text-xs text-muted">Contoh:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setProblem(ex.problem);
                setLines(ex.lines);
                setRes(null);
              }}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-text hover:border-accent hover:text-accent"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </form>

      <div aria-live="polite">
        {res && !res.ok && <ErrorView error={res.error} input={problem} />}
        {res?.ok && (
          <section
            className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5"
            aria-label="Hasil pemeriksaan"
          >
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                {MODE_LABEL[res.result.mode]}
              </p>
              <Tex tex={res.result.problemLatex} display className="text-lg" />
            </div>
            <p
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${res.result.firstError !== null ? "bg-bad-soft text-bad" : res.result.finalCorrect ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}
            >
              {res.result.firstError !== null ? (
                <XCircle size={16} aria-hidden />
              ) : res.result.finalCorrect ? (
                <CheckCircle2 size={16} aria-hidden />
              ) : (
                <TriangleAlert size={16} aria-hidden />
              )}
              {res.result.summary}
            </p>
            <ol className="space-y-2">
              {res.result.lines.map((l) => {
                const Icon =
                  l.status === "ok"
                    ? CheckCircle2
                    : l.status === "error"
                      ? XCircle
                      : l.status === "unchecked"
                        ? CircleDashed
                        : TriangleAlert;
                const tone =
                  l.status === "ok"
                    ? "border-ok/30"
                    : l.status === "error"
                      ? "border-bad/40 bg-bad-soft/40"
                      : "border-warn/30 bg-warn-soft/30";
                const color =
                  l.status === "ok" ? "text-ok" : l.status === "error" ? "text-bad" : "text-warn";
                const statusLabel =
                  l.status === "ok"
                    ? "Benar"
                    : l.status === "error"
                      ? "Salah"
                      : l.status === "carried"
                        ? "Kesalahan terbawa"
                        : l.status === "unchecked"
                          ? "Tidak diperiksa"
                          : "Tidak terbaca";
                return (
                  <li
                    key={l.index}
                    className={`rounded-lg border p-3 ${tone} ${res.result.firstError === l.index ? "ring-2 ring-bad/40" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 text-xs font-semibold text-muted">
                        {l.index + 1}.
                      </span>
                      <Icon
                        size={17}
                        className={`mt-0.5 shrink-0 ${color}`}
                        aria-label={statusLabel}
                      />
                      <div className="min-w-0 flex-1">
                        {l.latex ? (
                          <Tex tex={l.latex} display />
                        ) : (
                          <code className="text-sm">{l.input}</code>
                        )}
                        <p className={`text-sm font-medium ${color}`}>{l.message}</p>
                        {l.detail && <p className="mt-0.5 text-xs text-muted">{l.detail}</p>}
                        {l.formula && <Tex tex={l.formula} display className="mt-1 text-sm" />}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
