/**
 * Single entry point used by the Web Worker (and by server components for pre-rendered
 * examples). Every request is plain data and every response is plain data, so requests can
 * cross the worker boundary with structured cloning. `handleRequest` never throws.
 */
import { withBudget } from "./core/budget";
import { MathError, toSerializedError, type SerializedMathError } from "./core/errors";
import { evalReal } from "./expr/evaluate";
import type { Expr } from "./expr/types";
import { parse } from "./parse/parser";
import { toExpr } from "./parse/convert";
import {
  previewInput,
  solve,
  type PreviewOutcome,
  type SolveOptions,
  type SolveOutcome,
} from "./router";
import { solveFormula, type FormulaSolveInput } from "./science/formula-solver";
import { solveUnitConversion } from "./units/convert";
import { normalizeNumber, TOOLS, type Values } from "./forms";
import { safeCheckWork, type WorkCheckResult } from "./verify-work";

export type EngineRequest =
  | { type: "solve"; input: string; options?: SolveOptions }
  | { type: "preview"; input: string; options?: SolveOptions }
  | { type: "formula"; input: FormulaSolveInput }
  | { type: "units"; value: string; from: string; to: string }
  | { type: "tool"; tool: string; values: Values }
  | { type: "check-work"; problem: string; lines: string[] }
  | { type: "sample"; request: SampleRequest };

export interface SampleRequest {
  kind: "function" | "polar" | "parametric";
  /** y = f(x) expressions (function), r(θ) (polar) or x(t) (parametric). */
  exprs: string[];
  /** y(t) expressions for parametric curves (same length as `exprs`). */
  yExprs?: string[];
  variable: string;
  range: [number, number];
  samples: number;
}

export interface SampledCurve {
  /** Flat [x0, y0, x1, y1, …]; NaN marks a gap (outside the domain). */
  points: number[];
  error?: string;
}

export type SampleOutcome =
  { ok: true; curves: SampledCurve[] } | { ok: false; error: SerializedMathError };

export type WorkOutcome =
  { ok: true; result: WorkCheckResult } | { ok: false; error: SerializedMathError };

export type EngineResponse = SolveOutcome | WorkOutcome | SampleOutcome | PreviewOutcome;

export type { PreviewOutcome, SolveOutcome };

function outcome(
  input: string,
  module: string,
  fn: () => import("./steps/types").Solution,
): SolveOutcome {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const solution = withBudget({ timeMs: 6000 }, fn);
    solution.meta.durationMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - start,
    );
    return { ok: true, solution };
  } catch (e) {
    // BigInt("abc") and similar low-level parse failures are input errors, not engine bugs.
    if (e instanceof SyntaxError) {
      return {
        ok: false,
        error: new MathError("invalid-input", "Format bilangan tidak valid.", {
          module,
          cause: e.message,
        }).toJSON(),
        input,
      };
    }
    return { ok: false, error: toSerializedError(e, module), input };
  }
}

function parsePlotExpr(text: string): Expr {
  const p = parse(text);
  if (p.statements.length !== 1)
    throw new MathError("invalid-input", "Masukkan satu ekspresi per fungsi.", { module: "plot" });
  let node = p.statements[0];
  // Accept "y = …", "f(x) = …", "r = …" by taking the right-hand side.
  if (node.k === "rel" && node.ops.length === 1 && node.ops[0] === "=") node = node.operands[1];
  if (node.k === "rel")
    throw new MathError("invalid-input", "Grafik membutuhkan fungsi, bukan pertidaksamaan.", {
      module: "plot",
    });
  return toExpr(node);
}

const MAX_SAMPLES = 4000;

export function sample(req: SampleRequest): SampleOutcome {
  try {
    const n = Math.max(2, Math.min(MAX_SAMPLES, Math.floor(req.samples)));
    const [a, b] = req.range;
    if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a))
      throw new MathError("invalid-input", "Rentang grafik tidak valid.", { module: "plot" });
    const curves: SampledCurve[] = req.exprs.map((text, i) => {
      try {
        const fx = parsePlotExpr(text);
        const fy = req.kind === "parametric" ? parsePlotExpr(req.yExprs?.[i] ?? "") : null;
        const pts = new Array<number>(2 * (n + 1));
        for (let k = 0; k <= n; k++) {
          const t = a + ((b - a) * k) / n;
          const env = { [req.variable]: t };
          let x: number;
          let y: number;
          if (req.kind === "function") {
            x = t;
            y = evalReal(fx, env);
          } else if (req.kind === "polar") {
            const r = evalReal(fx, env);
            x = r * Math.cos(t);
            y = r * Math.sin(t);
          } else {
            x = evalReal(fx, env);
            y = evalReal(fy!, env);
          }
          pts[2 * k] = Number.isFinite(x) ? x : NaN;
          pts[2 * k + 1] = Number.isFinite(y) ? y : NaN;
        }
        return { points: pts };
      } catch (e) {
        return { points: [], error: toSerializedError(e, "plot").message };
      }
    });
    return { ok: true, curves };
  } catch (e) {
    return { ok: false, error: toSerializedError(e, "plot") };
  }
}

export function handleRequest(req: EngineRequest): EngineResponse {
  switch (req.type) {
    case "solve":
      return solve(req.input, req.options);
    case "preview":
      return previewInput(req.input, req.options);
    case "formula": {
      // Accept "3,5" and "1.250.000" style inputs like the other forms.
      const values = Object.fromEntries(
        Object.entries(req.input.values).map(([k, q]) => [
          k,
          { ...q, value: normalizeNumber(q.value) },
        ]),
      );
      return outcome(`${req.input.formulaId}: ${req.input.solveFor}`, "formula", () =>
        solveFormula({ ...req.input, values }),
      );
    }
    case "units":
      return outcome(`${req.value} ${req.from} → ${req.to}`, "units", () =>
        solveUnitConversion(normalizeNumber(req.value), req.from, req.to),
      );
    case "tool": {
      const def = TOOLS[req.tool];
      if (!def)
        return {
          ok: false,
          error: new MathError("unsupported", `Kalkulator '${req.tool}' tidak dikenal.`, {
            module: "api",
          }).toJSON(),
          input: req.tool,
        };
      return outcome(JSON.stringify(req.values), req.tool, () => def.run(req.values));
    }
    case "check-work":
      return safeCheckWork(req.problem, req.lines);
    case "sample":
      return sample(req.request);
  }
}
