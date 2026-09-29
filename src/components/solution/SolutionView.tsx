"use client";

import { useState } from "react";
import { LEVELS, type Level, type Solution } from "@/engine/steps/types";
import { usePreference, type HistoryEntry } from "@/lib/storage";
import { PlotView } from "../plot/PlotView";
import { MathText } from "../MathText";
import { Tex } from "../Tex";
import { Tabs, type TabItem } from "../ui/Tabs";
import { AnswerList } from "./AnswerList";
import { LevelSelector } from "./LevelSelector";
import { atLeast } from "./levels";
import { ResultActions } from "./ResultActions";
import { StepList } from "./StepList";
import { TableView } from "./TableView";
import { VerificationBadge } from "./VerificationBadge";
import { VerificationPanel } from "./VerificationPanel";

const LEVEL_IDS = LEVELS.map((l) => l.id);

function uniqueRules(solution: Solution) {
  const seen = new Map<string, { name: string; formula?: string; conditions?: string }>();
  const visit = (steps: Solution["steps"]) => {
    for (const s of steps) {
      if (s.rule && !seen.has(s.rule.id)) seen.set(s.rule.id, s.rule);
      if (s.substeps) visit(s.substeps);
    }
  };
  visit(solution.steps);
  return [...seen.values()];
}

function Explanation({ solution, level }: { solution: Solution; level: Level }) {
  const rules = uniqueRules(solution);
  return (
    <div className="prose-edu max-w-none space-y-4 text-sm">
      <section>
        <h3 className="text-base font-semibold text-text">Metode: {solution.method.name}</h3>
        <p className="text-text/90">
          <MathText text={solution.method.description} />
        </p>
        {solution.method.formula && atLeast(level, "pelajar") && <Tex tex={solution.method.formula} display className="rounded-lg bg-surface-2/60 px-3 py-1" />}
        {level === "dasar" && (
          <p className="text-muted">
            Buka tab <strong>Langkah</strong> untuk melihat cara menghitungnya satu per satu. Setiap langkah dihitung oleh mesin matematika, lalu hasilnya diperiksa ulang pada tab <strong>Verifikasi</strong>.
          </p>
        )}
      </section>
      {rules.length > 0 && atLeast(level, "pelajar") && (
        <section>
          <h3 className="text-base font-semibold text-text">Aturan yang digunakan</h3>
          <ul className="mt-2 space-y-2">
            {rules.map((r, i) => (
              <li key={i} className="rounded-lg border border-border p-3">
                <p className="font-medium text-text">{r.name}</p>
                {r.formula && <Tex tex={r.formula} display />}
                {r.conditions && atLeast(level, "advanced") && <p className="text-xs text-muted">Syarat: {r.conditions}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {solution.assumptions.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-text">Asumsi</h3>
          <ul>
            {solution.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}
      {solution.notes.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-text">Catatan & interpretasi</h3>
          <ul>
            {solution.notes.map((a, i) => (
              <li key={i}>
                <MathText text={a} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {solution.references && solution.references.length > 0 && atLeast(level, "pelajar") && (
        <section>
          <h3 className="text-base font-semibold text-text">Rujukan</h3>
          <ul>
            {solution.references.map((r, i) => (
              <li key={i}>
                <span className="font-medium">{r.name}</span> — {r.source}
                {r.edition ? ` (${r.edition})` : ""}
                {r.section ? `, ${r.section}` : ""}
                {r.notes && atLeast(level, "advanced") ? <span className="text-muted"> · {r.notes}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
      {atLeast(level, "expert") && (
        <p className="text-xs text-muted">
          Modul mesin: <code>{solution.meta.module}</code> · versi {solution.meta.engineVersion}
          {solution.meta.durationMs !== undefined ? ` · ${solution.meta.durationMs} ms` : ""}
        </p>
      )}
    </div>
  );
}

export function SolutionView({ solution, shareUrl, entry }: { solution: Solution; shareUrl?: string; entry?: Omit<HistoryEntry, "id" | "time"> }) {
  const [tab, setTab] = useState("jawaban");
  const [level, setLevel] = usePreference<Level>("vs-level", "pelajar", LEVEL_IDS);

  const tabs: TabItem[] = [
    {
      id: "jawaban",
      label: "Jawaban",
      content: (
        <div className="space-y-5">
          <AnswerList answers={solution.answers} />
          {solution.tables?.map((t, i) => (
            <TableView key={i} table={t} />
          ))}
          {solution.notes.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-warn/30 bg-warn-soft/40 p-3 text-sm text-text">
              {solution.notes.map((n, i) => (
                <li key={i}>
                  <MathText text={n} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
    {
      id: "langkah",
      label: `Langkah (${solution.steps.length})`,
      content: <StepList steps={solution.steps} level={level} />,
    },
    { id: "penjelasan", label: "Penjelasan", content: <Explanation solution={solution} level={level} /> },
    { id: "verifikasi", label: "Verifikasi", content: <VerificationPanel verification={solution.verification} /> },
  ];
  if (solution.plot) tabs.push({ id: "grafik", label: "Grafik", content: <PlotView spec={solution.plot} /> });
  if (solution.alternatives.length > 0) {
    tabs.push({
      id: "metode-lain",
      label: `Metode Lain (${solution.alternatives.length})`,
      content: (
        <div className="space-y-8">
          {solution.alternatives.map((alt, i) => (
            <section key={i} className="space-y-3">
              <header>
                <h3 className="font-semibold text-text">{alt.name}</h3>
                <p className="text-sm text-muted">
                  <MathText text={alt.description} />
                </p>
              </header>
              <StepList steps={alt.steps} level={level} />
              {alt.answers && alt.answers.length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Hasil metode ini</p>
                  <AnswerList answers={alt.answers} large={false} />
                </div>
              )}
            </section>
          ))}
        </div>
      ),
    });
  }

  return (
    <article className="rounded-2xl border border-border bg-surface shadow-sm" aria-label={`Hasil: ${solution.title}`}>
      <header className="space-y-3 border-b border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">{solution.title}</p>
          <VerificationBadge status={solution.verification.status} />
        </div>
        <div className="text-lg text-text">
          <Tex tex={solution.inputLatex} display />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LevelSelector level={level} onChange={setLevel} />
          <ResultActions solution={solution} shareUrl={shareUrl} entry={entry} />
        </div>
      </header>
      <div className="p-4 sm:p-5">
        <Tabs items={tabs} active={tab} onChange={setTab} label="Bagian hasil" />
      </div>
    </article>
  );
}
