import { CheckCircle2, XCircle } from "lucide-react";
import type { Verification } from "@/engine/steps/types";
import { MathText } from "../MathText";
import { Tex } from "../Tex";
import { VERIFICATION_META, VerificationBadge } from "./VerificationBadge";

export function VerificationPanel({ verification }: { verification: Verification }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <VerificationBadge status={verification.status} />
        <p className="text-sm text-muted">{VERIFICATION_META[verification.status].description}</p>
      </div>
      <p className="text-sm leading-relaxed text-text">{verification.summary}</p>
      {verification.checks.length > 0 && (
        <ul className="space-y-3">
          {verification.checks.map((c, i) => (
            <li
              key={i}
              className={`rounded-lg border p-3 ${c.passed ? "border-ok/30 bg-ok-soft/40" : "border-bad/30 bg-bad-soft/40"}`}
            >
              <div className="flex items-start gap-2">
                {c.passed ? (
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-ok" aria-label="Lolos" />
                ) : (
                  <XCircle size={17} className="mt-0.5 shrink-0 text-bad" aria-label="Gagal" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">
                    <MathText text={c.description} />
                  </p>
                  {c.latex && <Tex tex={c.latex} display className="mt-1" />}
                  <p className="mt-1 text-xs text-muted">
                    Metode: {c.method}
                    {c.detail ? (
                      <>
                        {" — "}
                        <MathText text={c.detail} />
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
