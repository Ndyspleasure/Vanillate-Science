import type { Level } from "@/engine/steps/types";

export const LEVEL_RANK: Record<Level, number> = { dasar: 0, pelajar: 1, universitas: 2, advanced: 3, expert: 4 };

export function atLeast(level: Level, min: Level): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[min];
}
