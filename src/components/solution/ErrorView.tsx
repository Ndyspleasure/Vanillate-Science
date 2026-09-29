import { AlertOctagon, Lightbulb } from "lucide-react";
import type { SerializedMathError } from "@/engine/core/errors";

export function ErrorView({ error, input }: { error: SerializedMathError; input?: string }) {
  const span = error.span && input && error.span.end <= input.length + 1 ? error.span : undefined;
  return (
    <div role="alert" className="rounded-xl border border-bad/30 bg-bad-soft/50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <AlertOctagon size={20} className="mt-0.5 shrink-0 text-bad" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="font-semibold text-text">{error.title}</h3>
          <p className="text-sm text-text">{error.message}</p>
          {span && input && (
            <p className="overflow-x-auto rounded-md bg-surface px-3 py-2 font-mono text-sm">
              <span>{input.slice(0, span.start)}</span>
              <mark className="rounded bg-bad/20 px-0.5 text-bad underline decoration-wavy">{input.slice(span.start, Math.max(span.end, span.start + 1)) || " "}</mark>
              <span>{input.slice(Math.max(span.end, span.start + 1))}</span>
            </p>
          )}
          {error.cause && (
            <p className="text-sm text-muted">
              <span className="font-semibold text-text">Penyebab:</span> {error.cause}
            </p>
          )}
          {error.hint && (
            <p className="flex items-start gap-1.5 text-sm text-muted">
              <Lightbulb size={15} className="mt-0.5 shrink-0 text-warm" aria-hidden />
              <span>{error.hint}</span>
            </p>
          )}
          {error.kind === "internal" && (
            <p className="text-xs text-muted">
              Modul: {error.module ?? "engine"} · {error.timestamp}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
