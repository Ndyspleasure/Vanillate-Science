/**
 * Computation budget / guardrails (CLAUDE.md §17).
 *
 * The engine is synchronous. Long-running algorithms call `tick()` inside loops and
 * recursions; when the active budget is exhausted a MathError("timeout") is thrown so the
 * UI can report it instead of freezing. Size guards (BigInt bits, term counts) throw
 * MathError("limit-exceeded").
 */
import { MathError } from "./errors";

export interface BudgetOptions {
  /** Wall-clock limit in milliseconds. */
  timeMs?: number;
  /** Maximum number of `tick()` calls. */
  maxTicks?: number;
}

interface ActiveBudget {
  deadline: number;
  maxTicks: number;
  ticks: number;
}

const DEFAULT_TIME_MS = 4000;
const DEFAULT_MAX_TICKS = 50_000_000;

/** Largest BigInt (in bits) the engine will build before refusing. */
export const MAX_BIGINT_BITS = 200_000;
/** Largest number of terms an expansion may produce. */
export const MAX_TERMS = 5_000;
/** Largest expression tree depth accepted by the parser. */
export const MAX_DEPTH = 200;
/** Maximum accepted input length in characters. */
export const MAX_INPUT_LENGTH = 2_000;

let active: ActiveBudget | null = null;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Run `fn` under a computation budget. Nested calls reuse the outer (stricter) budget. */
export function withBudget<T>(options: BudgetOptions, fn: () => T): T {
  if (active) return fn();
  active = {
    deadline: now() + (options.timeMs ?? DEFAULT_TIME_MS),
    maxTicks: options.maxTicks ?? DEFAULT_MAX_TICKS,
    ticks: 0,
  };
  try {
    return fn();
  } finally {
    active = null;
  }
}

/** Account for one unit of work. Checks the clock every 1024 ticks. */
export function tick(operation = "compute"): void {
  if (!active) return;
  active.ticks++;
  if (active.ticks > active.maxTicks) {
    throw new MathError("limit-exceeded", "Batas jumlah operasi komputasi terlampaui.", {
      module: "budget",
      operation,
      cause: "Soal membutuhkan terlalu banyak langkah komputasi.",
      hint: "Sederhanakan soal atau kurangi ukuran input.",
    });
  }
  if ((active.ticks & 1023) === 0 && now() > active.deadline) {
    throw new MathError("timeout", "Waktu komputasi habis.", {
      module: "budget",
      operation,
      cause: "Perhitungan melebihi batas waktu yang aman.",
      hint: "Soal mungkin terlalu besar atau tidak konvergen. Coba sederhanakan input.",
    });
  }
}

export function checkBigIntSize(value: bigint, operation = "bigint"): void {
  const bits = value < 0n ? (-value).toString(2).length : value.toString(2).length;
  if (bits > MAX_BIGINT_BITS) {
    throw new MathError("limit-exceeded", "Bilangan terlalu besar untuk dihitung secara eksak.", {
      module: "rational",
      operation,
      cause: `Hasil antara memiliki lebih dari ${MAX_BIGINT_BITS} bit.`,
      hint: "Gunakan mode numerik/aproksimasi atau kecilkan bilangan.",
    });
  }
}
