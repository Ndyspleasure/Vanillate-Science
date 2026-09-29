"use client";

import { LEVELS, type Level } from "@/engine/steps/types";

export function LevelSelector({ level, onChange }: { level: Level; onChange: (l: Level) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Tingkat penjelasan</legend>
      <div
        className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface-2 p-1"
        role="radiogroup"
        aria-label="Tingkat penjelasan"
      >
        {LEVELS.map((l) => (
          <label key={l.id} title={l.description} className="cursor-pointer">
            <input
              type="radio"
              name="level"
              value={l.id}
              checked={level === l.id}
              onChange={() => onChange(l.id)}
              className="peer sr-only"
            />
            <span className="block rounded-md px-2.5 py-1 text-xs font-medium text-muted peer-checked:bg-surface peer-checked:text-accent-strong peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--focus)]">
              {l.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
