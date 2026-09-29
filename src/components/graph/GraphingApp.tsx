"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PlotSpec } from "@/engine/steps/types";
import { PLOT_COLORS, PlotView } from "../plot/PlotView";

type GraphMode = "function" | "polar" | "parametric";

const DEFAULTS: Record<GraphMode, string[]> = {
  function: ["sin(x)", "x^2/4 - 1"],
  polar: ["1 + cos(theta)"],
  parametric: ["cos(3t)", "sin(2t)"],
};

const PRESETS: Array<{ label: string; mode: GraphMode; exprs: string[] }> = [
  { label: "Parabola & garis", mode: "function", exprs: ["x^2 - 2x - 3", "2x + 1"] },
  { label: "Trigonometri", mode: "function", exprs: ["sin(x)", "cos(x)", "tan(x)"] },
  { label: "Eksponen & log", mode: "function", exprs: ["e^x", "ln(x)", "x"] },
  { label: "Rasional (asimtot)", mode: "function", exprs: ["(x^2 - 1)/(x - 2)"] },
  { label: "Kardioid", mode: "polar", exprs: ["1 + cos(theta)"] },
  { label: "Mawar 4 kelopak", mode: "polar", exprs: ["cos(2theta)"] },
  { label: "Lissajous", mode: "parametric", exprs: ["cos(3t)", "sin(2t)"] },
];

export function GraphingApp() {
  const [mode, setMode] = useState<GraphMode>("function");
  const [exprs, setExprs] = useState<string[]>(DEFAULTS.function);
  const [range, setRange] = useState<[string, string]>(["-10", "10"]);
  const [plotted, setPlotted] = useState<{
    mode: GraphMode;
    exprs: string[];
    range: [number, number];
  }>({ mode: "function", exprs: DEFAULTS.function, range: [-10, 10] });
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const p = new URLSearchParams(window.location.search);
    const fs = p.getAll("f").filter(Boolean).slice(0, 8);
    const m = p.get("mode");
    if (fs.length) {
      const gm: GraphMode = m === "polar" || m === "parametric" ? m : "function";
      const a = Number(p.get("a") ?? "-10");
      const b = Number(p.get("b") ?? "10");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode(gm);
      setExprs(fs);
      setRange([String(a), String(b)]);
      setPlotted({
        mode: gm,
        exprs: fs,
        range: Number.isFinite(a) && Number.isFinite(b) && b > a ? [a, b] : [-10, 10],
      });
    }
  }, []);

  const draw = () => {
    const a = Number(range[0].replace(",", "."));
    const b = Number(range[1].replace(",", "."));
    const r: [number, number] =
      Number.isFinite(a) && Number.isFinite(b) && b > a
        ? [a, b]
        : mode === "function"
          ? [-10, 10]
          : [0, 2 * Math.PI];
    const list = exprs.map((e) => e.trim()).filter(Boolean);
    setPlotted({ mode, exprs: list, range: r });
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("mode", mode);
    for (const e of list) url.searchParams.append("f", e);
    url.searchParams.set("a", String(r[0]));
    url.searchParams.set("b", String(r[1]));
    window.history.replaceState(window.history.state, "", url.toString());
  };

  const spec: PlotSpec | null = useMemo(() => {
    const list = plotted.exprs;
    if (list.length === 0) return null;
    if (plotted.mode === "function")
      return {
        kind: "function",
        variable: "x",
        functions: list.map((e) => ({ expr: e, label: `y = ${e}` })),
        xRange: plotted.range,
      };
    if (plotted.mode === "polar")
      return {
        kind: "polar",
        variable: "theta",
        functions: list.map((e) => ({ expr: e, label: `r = ${e}` })),
        tRange: plotted.range,
      };
    if (list.length < 2) return null;
    return {
      kind: "parametric",
      variable: "t",
      functions: [{ expr: list[0], label: `(${list[0]}, ${list[1]})` }],
      yExpr: list[1],
      tRange: plotted.range,
    };
  }, [plotted]);

  const switchMode = (m: GraphMode) => {
    setMode(m);
    setExprs(DEFAULTS[m]);
    setRange(m === "function" ? ["-10", "10"] : ["0", "6.283185307"]);
  };

  const label = (i: number) =>
    mode === "function"
      ? `f${i + 1}(x) =`
      : mode === "polar"
        ? `r${exprs.length > 1 ? i + 1 : ""}(θ) =`
        : i === 0
          ? "x(t) ="
          : "y(t) =";
  const field =
    "w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-text focus:border-accent focus:outline-none";

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form
        className="space-y-4 rounded-2xl border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          draw();
        }}
        aria-label="Fungsi yang digambar"
      >
        <div
          className="flex gap-1 rounded-lg bg-surface-2 p-1"
          role="group"
          aria-label="Jenis grafik"
        >
          {(["function", "polar", "parametric"] as GraphMode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => switchMode(m)}
              className="flex-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted aria-pressed:bg-surface aria-pressed:text-accent-strong aria-pressed:shadow-sm"
            >
              {m === "function" ? "y = f(x)" : m === "polar" ? "Polar r(θ)" : "Parametrik"}
            </button>
          ))}
        </div>
        <ul className="space-y-2">
          {exprs.map((e, i) => (
            <li key={i} className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{
                  background: PLOT_COLORS[(mode === "parametric" ? 0 : i) % PLOT_COLORS.length],
                }}
                aria-hidden
              />
              <label className="flex flex-1 items-center gap-2">
                <span className="w-16 shrink-0 font-mono text-xs text-muted">{label(i)}</span>
                <input
                  value={e}
                  onChange={(ev) =>
                    setExprs((cur) => cur.map((x, j) => (j === i ? ev.target.value : x)))
                  }
                  className={field}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label={label(i)}
                />
              </label>
              {mode !== "parametric" && exprs.length > 1 && (
                <button
                  type="button"
                  onClick={() => setExprs((cur) => cur.filter((_, j) => j !== i))}
                  className="text-muted hover:text-bad"
                  aria-label={`Hapus fungsi ${i + 1}`}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
        {mode !== "parametric" && exprs.length < 8 && (
          <button
            type="button"
            onClick={() => setExprs((cur) => [...cur, ""])}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent"
          >
            <Plus size={15} aria-hidden /> Tambah fungsi
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            {mode === "function" ? "x minimum" : mode === "polar" ? "θ awal" : "t awal"}
            <input
              value={range[0]}
              onChange={(e) => setRange([e.target.value, range[1]])}
              inputMode="decimal"
              className={`${field} mt-1`}
            />
          </label>
          <label className="text-xs text-muted">
            {mode === "function" ? "x maksimum" : mode === "polar" ? "θ akhir" : "t akhir"}
            <input
              value={range[1]}
              onChange={(e) => setRange([range[0], e.target.value])}
              inputMode="decimal"
              className={`${field} mt-1`}
            />
          </label>
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast hover:bg-accent-strong"
        >
          Gambar grafik
        </button>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Contoh</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setMode(p.mode);
                  setExprs(p.exprs);
                  const r: [number, number] = p.mode === "function" ? [-10, 10] : [0, 2 * Math.PI];
                  setRange([String(r[0]), String(r[1])]);
                  setPlotted({ mode: p.mode, exprs: p.exprs, range: r });
                }}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-text hover:border-accent hover:text-accent"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </form>
      <div className="min-w-0 space-y-3">
        {spec ? (
          <PlotView spec={spec} interactive height={480} />
        ) : (
          <p className="text-sm text-muted">Masukkan fungsi lalu tekan “Gambar grafik”.</p>
        )}
        {plotted.mode === "function" && plotted.exprs.length > 0 && (
          <p className="text-sm text-muted">
            Analisis fungsi:{" "}
            {plotted.exprs.slice(0, 3).map((e, i) => (
              <span key={i}>
                {i > 0 && " · "}
                <Link
                  href={`/?q=${encodeURIComponent(`extrema(${e})`)}`}
                  className="font-mono text-accent hover:underline"
                >
                  titik ekstrem {e}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
