import type { FormulaView } from "@/components/calculators/FormulaCalculator";
import { CONSTANTS } from "@/engine/science/constants";
import { formulaLatex, formulaVariablesLatex } from "@/engine/science/formula-solver";
import type { FormulaDef } from "@/engine/science/formulas";
import { categoryOfDim, COMMON_UNITS, dimEquals, isDimensionless, parseUnit } from "@/engine/units/units";

/** Units offered for a variable: its own unit first, then common units of the same dimension. */
export function compatibleUnits(unit: string): string[] {
  if (!unit) return [];
  let dim;
  try {
    dim = parseUnit(unit).dim;
  } catch {
    return [unit];
  }
  const isAngle = unit === "°" || unit === "rad";
  if (isDimensionless(dim) && !isAngle) return [unit];
  const cat = isAngle ? "sudut" : categoryOfDim(dim);
  const list = cat ? COMMON_UNITS[cat] : [];
  const out = [unit];
  for (const u of list) {
    if (out.includes(u)) continue;
    try {
      if (dimEquals(parseUnit(u).dim, dim)) out.push(u);
    } catch {
      // skip unparsable entries
    }
  }
  return out;
}

export function formulaView(def: FormulaDef): FormulaView {
  const latex = formulaVariablesLatex(def);
  return {
    id: def.id,
    name: def.name,
    latex: formulaLatex(def),
    example: def.example,
    variables: def.variables.map((v) => {
      const c = v.constant ? CONSTANTS[v.constant] : undefined;
      return {
        s: v.s,
        name: v.name,
        unit: v.unit,
        latex: latex[v.s] ?? v.s,
        units: c ? [] : compatibleUnits(v.unit),
        constant: c ? { name: c.name, value: c.value, unit: c.unit, source: c.source } : undefined,
        defaultValue: v.defaultValue,
      };
    }),
  };
}
