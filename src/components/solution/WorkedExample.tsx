import type { Solution } from "@/engine/steps/types";
import { MathText } from "../MathText";
import { Tex } from "../Tex";
import { AnswerList } from "./AnswerList";
import { StepList } from "./StepList";
import { VerificationBadge } from "./VerificationBadge";

/**
 * Server-rendered worked example (no interactivity) so that every calculator page carries
 * real, verified steps in its HTML — useful for readers without JavaScript and for search.
 */
export function WorkedExample({ solution, heading = "Contoh soal dan pembahasan" }: { solution: Solution; heading?: string }) {
  return (
    <section aria-labelledby="contoh-soal" className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="contoh-soal" className="text-lg font-semibold text-text">
          {heading}
        </h2>
        <VerificationBadge status={solution.verification.status} />
      </div>
      <div className="mt-3 text-lg">
        <Tex tex={solution.inputLatex} display />
      </div>
      <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-muted">Jawaban</h3>
      <div className="mt-2">
        <AnswerList answers={solution.answers.slice(0, 6)} large={false} />
      </div>
      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">Langkah penyelesaian — {solution.method.name}</h3>
      <div className="mt-3">
        <StepList steps={solution.steps.slice(0, 12)} level="pelajar" />
      </div>
      <p className="mt-5 rounded-lg bg-surface-2/60 px-3 py-2 text-sm text-muted">
        <span className="font-semibold text-text">Verifikasi:</span> {solution.verification.summary}{" "}
        <MathText text={solution.verification.checks.slice(0, 3).map((c) => `${c.passed ? "✓" : "✗"} ${c.description}.`).join(" ")} />
      </p>
    </section>
  );
}
