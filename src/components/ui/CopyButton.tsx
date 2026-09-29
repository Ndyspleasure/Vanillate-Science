"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({
  text,
  label = "Salin",
  className = "",
  compact = false,
}: {
  text: string;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyText(text);
        setState(ok ? "ok" : "fail");
        setTimeout(() => setState("idle"), 1600);
      }}
      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-muted hover:text-text ${className}`}
      aria-label={compact ? label : undefined}
      title={label}
    >
      {state === "ok" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {!compact && <span>{state === "ok" ? "Tersalin" : state === "fail" ? "Gagal" : label}</span>}
      <span className="sr-only" aria-live="polite">
        {state === "ok" ? "Tersalin ke clipboard" : state === "fail" ? "Gagal menyalin" : ""}
      </span>
    </button>
  );
}
