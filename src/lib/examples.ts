import { handleRequest, type SolveOutcome } from "@/engine/api";
import { TOOLS } from "@/engine/forms";
import { FORMULA_BY_ID } from "@/engine/science/formulas";
import { COMMON_UNITS } from "@/engine/units/units";
import type { Calculator } from "./calculators";

/** Worked example for a calculator page, computed at build time by the same engine. */
export function workedExample(c: Calculator): SolveOutcome | null {
  const k = c.kind;
  switch (k.type) {
    case "solver":
      return handleRequest({
        type: "solve",
        input: k.examples[0],
        options: { mode: k.mode },
      }) as SolveOutcome;
    case "formula": {
      const def = FORMULA_BY_ID[k.formulaId];
      const values = Object.fromEntries(
        Object.entries(def.example.values).map(([s, v]) => [s, { value: v }]),
      );
      return handleRequest({
        type: "formula",
        input: { formulaId: def.id, solveFor: def.example.solveFor, values },
      }) as SolveOutcome;
    }
    case "tool":
      return handleRequest({
        type: "tool",
        tool: k.tool,
        values: TOOLS[k.tool].defaults,
      }) as SolveOutcome;
    case "units": {
      const units = COMMON_UNITS[k.unitCategory ?? "panjang"];
      return handleRequest({
        type: "units",
        value: "1",
        from: units[1] ?? units[0],
        to: units[0],
      }) as SolveOutcome;
    }
    case "periodic-table":
      return null;
  }
}
