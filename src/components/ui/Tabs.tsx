"use client";

import { useId, useRef, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

/** WAI-ARIA tabs with roving focus (Arrow keys, Home, End). */
export function Tabs({ items, active, onChange, label }: { items: TabItem[]; active: string; onChange: (id: string) => void; label: string }) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const idx = Math.max(0, items.findIndex((t) => t.id === active));
  const current = items[idx];

  const onKey = (e: React.KeyboardEvent) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(items[next].id);
      refs.current[items[next].id]?.focus();
    }
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1" onKeyDown={onKey}>
        {items.map((t) => {
          const selected = t.id === current?.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={`relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${selected ? "text-accent-strong" : "text-muted hover:text-text"}`}
            >
              {t.label}
              {selected && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-accent" aria-hidden />}
            </button>
          );
        })}
      </div>
      {current && (
        <div role="tabpanel" id={`${base}-panel-${current.id}`} aria-labelledby={`${base}-tab-${current.id}`} tabIndex={0} className="pt-5 outline-none">
          {current.content}
        </div>
      )}
    </div>
  );
}
