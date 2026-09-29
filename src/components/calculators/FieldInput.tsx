"use client";

import type { ToolField } from "@/engine/forms";

const base = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-accent focus:outline-none";

export function FieldInput({ field, value, onChange, id }: { field: ToolField; value: string; onChange: (v: string) => void; id: string }) {
  const described = field.help ? `${id}-help` : undefined;
  let control: React.ReactNode;
  if (field.type === "select") {
    control = (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={base} aria-describedby={described}>
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "textarea") {
    control = <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.placeholder} spellCheck={false} className={`${base} font-mono`} aria-describedby={described} />;
  } else {
    control = (
      <div className="flex items-stretch">
        <input
          id={id}
          type="text"
          inputMode={field.type === "number" ? "decimal" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          spellCheck={false}
          autoComplete="off"
          className={`${base} ${field.mono || field.type === "number" ? "font-mono" : ""} ${field.suffix ? "rounded-r-none" : ""}`}
          aria-describedby={described}
        />
        {field.suffix && <span className="flex items-center rounded-r-lg border border-l-0 border-border bg-surface-2 px-3 text-sm text-muted">{field.suffix}</span>}
      </div>
    );
  }
  return (
    <div className={field.type === "textarea" ? "sm:col-span-2" : ""}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-text">
        {field.label}
        {field.optional && <span className="ml-1 font-normal text-muted">(opsional)</span>}
      </label>
      {control}
      {field.help && (
        <p id={described} className="mt-1 text-xs text-muted">
          {field.help}
        </p>
      )}
    </div>
  );
}
