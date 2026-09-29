import { CheckCircle2, CircleAlert, CircleDashed, XCircle } from "lucide-react";
import type { Level, Step, StepCheck } from "@/engine/steps/types";
import { MathText } from "../MathText";
import { Tex } from "../Tex";
import { atLeast } from "./levels";

function CheckMark({ check, level }: { check: StepCheck; level: Level }) {
  const ok = check.status === "verified" || check.status === "verified-numeric";
  const Icon = ok
    ? CheckCircle2
    : check.status === "failed"
      ? XCircle
      : check.status === "partial"
        ? CircleAlert
        : CircleDashed;
  const tone = ok ? "text-ok" : check.status === "failed" ? "text-bad" : "text-warn";
  const label = ok
    ? "Langkah terverifikasi"
    : check.status === "failed"
      ? "Pemeriksaan langkah gagal"
      : "Langkah belum terverifikasi penuh";
  return (
    <div className={`mt-2 flex items-start gap-1.5 text-xs ${tone}`}>
      <Icon size={14} className="mt-px shrink-0" aria-hidden />
      <span>
        <span className="sr-only">{label}: </span>
        {atLeast(level, "advanced") ? (
          <>
            {check.method}
            {check.detail ? (
              <span className="text-muted">
                {" "}
                — <MathText text={check.detail} />
              </span>
            ) : null}
          </>
        ) : (
          <span aria-hidden>{ok ? "Diperiksa" : label}</span>
        )}
      </span>
    </div>
  );
}

function StepBody({ step, level }: { step: Step; level: Level }) {
  return (
    <div className="min-w-0 flex-1">
      <h4 className="font-medium text-text">
        <MathText text={step.title} />
      </h4>
      {step.before && atLeast(level, "universitas") && (
        <div className="mt-1 text-muted">
          <Tex tex={step.before} display />
        </div>
      )}
      <div className="mt-1 rounded-lg bg-surface-2/60 px-3 py-1.5">
        <Tex tex={step.after} display />
      </div>
      {step.rule && atLeast(level, "pelajar") && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent-strong">
            {step.rule.name}
          </span>
          {step.rule.formula && <Tex tex={step.rule.formula} />}
        </div>
      )}
      <p className="mt-2 text-sm leading-relaxed text-muted">
        <MathText text={step.reason} />
      </p>
      {step.detail && atLeast(level, "advanced") && (
        <p className="mt-1.5 text-sm leading-relaxed text-text/85">
          <MathText text={step.detail} />
        </p>
      )}
      {step.rule?.conditions && atLeast(level, "expert") && (
        <p className="mt-1.5 text-xs text-muted">
          <span className="font-semibold">Syarat berlaku:</span> {step.rule.conditions}
        </p>
      )}
      {step.assumptions && step.assumptions.length > 0 && atLeast(level, "advanced") && (
        <ul className="mt-1.5 list-disc pl-5 text-xs text-muted">
          {step.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      {step.check && <CheckMark check={step.check} level={level} />}
      {step.substeps && step.substeps.length > 0 && (
        <details className="mt-3 rounded-lg border border-border" open={atLeast(level, "advanced")}>
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-accent">
            Rincian ({step.substeps.length} sub-langkah)
          </summary>
          <div className="border-t border-border px-3 py-3">
            <StepList steps={step.substeps} level={level} nested />
          </div>
        </details>
      )}
    </div>
  );
}

export function StepList({
  steps,
  level,
  nested = false,
}: {
  steps: Step[];
  level: Level;
  nested?: boolean;
}) {
  if (steps.length === 0)
    return <p className="text-sm text-muted">Tidak ada langkah yang perlu ditampilkan.</p>;
  return (
    <ol className={nested ? "space-y-4" : "space-y-5"}>
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span
            className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${nested ? "h-6 w-6 bg-surface-3 text-xs text-muted" : "h-7 w-7 bg-accent text-sm text-accent-contrast"}`}
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="sr-only">Langkah {i + 1}:</span>
          <StepBody step={s} level={level} />
        </li>
      ))}
    </ol>
  );
}
