"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

/** Inline script (runs before first paint) that applies the saved theme. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("vs-theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("vs-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Sync with the value applied by the inline script before hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(readTheme());
    setMounted(true);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readTheme() === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const cycle = () => {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    try {
      localStorage.setItem("vs-theme", next);
    } catch {
      // storage unavailable: theme still applies for this page view
    }
    apply(next);
  };

  const label =
    theme === "system"
      ? "Tema: mengikuti sistem"
      : theme === "light"
        ? "Tema: terang"
        : "Tema: gelap";
  const Icon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-text"
      aria-label={`${label}. Klik untuk mengganti.`}
      title={label}
    >
      {mounted ? <Icon size={17} aria-hidden /> : <Monitor size={17} aria-hidden />}
    </button>
  );
}
