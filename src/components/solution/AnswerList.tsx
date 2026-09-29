import type { Answer } from "@/engine/steps/types";
import { Tex } from "../Tex";
import { CopyButton } from "../ui/CopyButton";

/** Answer LaTeX already includes its unit (the `unit` field is metadata). */
export function answerLatex(a: Answer): string {
  return a.latex;
}

export function AnswerList({ answers, large = true }: { answers: Answer[]; large?: boolean }) {
  if (answers.length === 0) return <p className="text-sm text-muted">Tidak ada jawaban.</p>;
  return (
    <ul className="divide-y divide-border">
      {answers.map((a, i) => (
        <li
          key={i}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
        >
          {a.label && <span className="min-w-24 text-sm font-medium text-muted">{a.label}</span>}
          <div className="min-w-0 flex-1">
            <div className={`math-scroll ${large ? "text-xl" : "text-base"} text-text`}>
              <Tex tex={answerLatex(a)} />
            </div>
            {a.approx &&
              (/^[^\d-]+:/.test(a.approx) ? (
                // labelled extra value, e.g. "nilai eksak: 2866956.2529911"
                <p className="mt-0.5 font-mono text-sm text-muted">{a.approx}</p>
              ) : (
                <p className="mt-0.5 text-sm text-muted">
                  ≈ <span className="font-mono text-text/90">{a.approx}</span>
                  <span className="ml-2 text-xs">(dibulatkan)</span>
                </p>
              ))}
            {!a.exact && !a.approx && (
              <p className="mt-0.5 text-xs text-muted">Nilai hampiran (numerik).</p>
            )}
          </div>
          <CopyButton text={a.text} label="Salin jawaban" compact />
        </li>
      ))}
    </ul>
  );
}
