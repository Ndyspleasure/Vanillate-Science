/**
 * Verification helpers shared by solvers.
 */
import { evalComplex, complexApproxEqual } from "../expr/evaluate";
import { seededRandom } from "../expr/equivalence";
import type { Expr } from "../expr/types";
import type { SNode } from "../parse/syntax";
import { floatEvalSyntax } from "../solvers/arithmetic";
import type { VerificationCheck } from "./types";

/**
 * Compare the final expression with an independent floating-point evaluation of the user's
 * original syntax tree at deterministic random points.
 */
export function verifyAgainstInput(node: SNode, result: Expr, vars: string[], description = "Bandingkan hasil dengan soal asli pada titik-titik uji"): VerificationCheck {
  const rand = seededRandom(7919);
  let valid = 0;
  let mismatch: string | null = null;
  for (let k = 0; k < 60 && valid < 10; k++) {
    const env: Record<string, number> = {};
    const lo = k < 30 ? -3 : 0.2;
    for (const v of vars) env[v] = lo + (3 - lo) * rand();
    const a = floatEvalSyntax(node, env);
    if (!Number.isFinite(a) || Math.abs(a) > 1e10) continue;
    const b = evalComplex(result, env);
    if (!Number.isFinite(b.re)) continue;
    valid++;
    if (!complexApproxEqual({ re: a, im: 0 }, b, 1e-8, 1e-10)) {
      mismatch = vars.map((v) => `${v} = ${env[v].toPrecision(5)}`).join(", ");
      break;
    }
  }
  if (mismatch) {
    return { description, passed: false, method: "Evaluasi numerik independen", detail: `Nilai berbeda pada ${mismatch}.` };
  }
  if (valid < 4) {
    return { description, passed: false, method: "Evaluasi numerik independen", detail: "Tidak cukup titik uji yang valid pada domain ekspresi." };
  }
  return { description, passed: true, method: "Evaluasi numerik independen", detail: `Cocok pada ${valid} titik uji (toleransi relatif 1e-8).` };
}
