"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { SampledCurve } from "@/engine/api";
import type { PlotSpec } from "@/engine/steps/types";
import { runEngine } from "@/lib/engine-client";
import { formatTick, niceTicks, robustRange, splitSegments } from "./plot-math";

export const PLOT_COLORS = [
  "var(--accent)",
  "var(--warm)",
  "#0d9488",
  "#db2777",
  "#65a30d",
  "#7c3aed",
  "#0891b2",
  "#dc2626",
];

interface View {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const M = { l: 48, r: 14, t: 12, b: 30 };

function histogram(data: number[]) {
  const n = data.length;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const k = Math.max(1, Math.min(40, Math.ceil(Math.log2(n) + 1)));
  const width = max === min ? 1 : (max - min) / k;
  const bins = Array.from({ length: k }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of data) {
    const idx = max === min ? 0 : Math.min(k - 1, Math.floor((v - min) / width));
    bins[idx].count++;
  }
  return bins;
}

/** Views that need no sampling: histograms, bar charts and plain scatter plots. */
function staticView(spec: PlotSpec): View | null {
  if (spec.kind === "histogram" && spec.data?.length) {
    const bins = histogram(spec.data);
    const [x0, x1] = initialX(spec);
    return { x0, x1, y0: 0, y1: Math.max(...bins.map((b) => b.count)) * 1.15 };
  }
  if (spec.kind === "bar" && spec.points?.length) {
    const [x0, x1] = initialX(spec);
    return { x0, x1, y0: 0, y1: Math.max(...spec.points.map((p) => p.y)) * 1.15 || 1 };
  }
  if (spec.kind === "scatter" && spec.points?.length) {
    const [x0, x1] = initialX(spec);
    const ys = spec.points.map((p) => p.y);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const pad = Math.max(1, (hi - lo) * 0.15);
    return { x0, x1, y0: spec.yRange?.[0] ?? lo - pad, y1: spec.yRange?.[1] ?? hi + pad };
  }
  return null;
}

function initialX(spec: PlotSpec): [number, number] {
  if (spec.xRange) return spec.xRange;
  if (spec.kind === "histogram" && spec.data?.length) {
    const b = histogram(spec.data);
    const w = b[0].x1 - b[0].x0;
    return [b[0].x0 - w * 0.5, b[b.length - 1].x1 + w * 0.5];
  }
  if ((spec.kind === "bar" || spec.kind === "scatter") && spec.points?.length) {
    const xs = spec.points.map((p) => p.x);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const pad = Math.max(1, (hi - lo) * 0.08);
    return [lo - pad, hi + pad];
  }
  if (spec.points?.length) {
    const xs = spec.points.map((p) => p.x).filter(Number.isFinite);
    if (xs.length) {
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      const pad = Math.max(3, (hi - lo) * 0.6);
      return [lo - pad, hi + pad];
    }
  }
  return [-10, 10];
}

export interface PlotViewProps {
  spec: PlotSpec;
  /** Enables wheel zoom and touch panning (graphing page). */
  interactive?: boolean;
  height?: number;
  title?: string;
}

export function PlotView({ spec, interactive = false, height = 380, title }: PlotViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(640);
  const [view, setView] = useState<View | null>(null);
  const [curves, setCurves] = useState<SampledCurve[]>([]);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ px: number; py: number; view: View; id: number } | null>(null);
  const [home, setHome] = useState<View | null>(null);
  const reqId = useRef(0);

  const isCurve = spec.kind === "function" || spec.kind === "scatter";
  const staticHome = useMemo(() => staticView(spec), [spec]);
  const v = view ?? staticHome;
  const isParam = spec.kind === "polar" || spec.kind === "parametric";
  const exprs = useMemo(() => spec.functions.map((f) => f.expr), [spec.functions]);

  // Responsive width
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0) setWidth(Math.max(260, w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset when the spec changes
  const specKey = JSON.stringify(spec);
  const [lastKey, setLastKey] = useState(specKey);
  if (lastKey !== specKey) {
    setLastKey(specKey);
    setView(null);
    setCurves([]);
    setHome(null);
  }

  // Sampling in the worker
  const sampleRange = useCallback(
    async (x0: number, x1: number) => {
      const id = ++reqId.current;
      if (isParam) {
        const range = spec.tRange ?? [0, 2 * Math.PI];
        const res = await runEngine({
          type: "sample",
          request: {
            kind: spec.kind as "polar" | "parametric",
            exprs,
            yExprs: spec.yExpr ? [spec.yExpr] : undefined,
            variable: spec.variable,
            range,
            samples: 1500,
          },
        });
        if (id !== reqId.current || !res.ok) return null;
        return res.curves;
      }
      const w = x1 - x0;
      const res = await runEngine({
        type: "sample",
        request: {
          kind: "function",
          exprs,
          variable: spec.variable,
          range: [x0 - w * 0.25, x1 + w * 0.25],
          samples: Math.min(2400, Math.max(600, Math.round(width * 1.5))),
        },
      });
      if (id !== reqId.current || !res.ok) return null;
      return res.curves;
    },
    [exprs, isParam, spec.kind, spec.tRange, spec.variable, spec.yExpr, width],
  );

  // Initial sample → auto-fit y (or x/y for parametric curves)
  useEffect(() => {
    if (view || staticHome || (!isCurve && !isParam) || exprs.length === 0) return;
    let cancelled = false;
    const [x0, x1] = initialX(spec);
    sampleRange(x0, x1).then((cs) => {
      if (cancelled || !cs) return;
      setCurves(cs);
      let v: View;
      if (isParam) {
        const xs: number[] = [];
        const ys: number[] = [];
        for (const c of cs)
          for (let i = 0; i < c.points.length; i += 2)
            if (Number.isFinite(c.points[i]) && Number.isFinite(c.points[i + 1])) {
              xs.push(c.points[i]);
              ys.push(c.points[i + 1]);
            }
        const [ax, bx] = robustRange(xs, [-5, 5]);
        const [ay, by] = robustRange(ys, [-5, 5]);
        v = { x0: ax, x1: bx, y0: ay, y1: by };
      } else {
        const ys: number[] = [];
        for (const c of cs)
          for (let i = 0; i < c.points.length; i += 2) {
            const x = c.points[i];
            if (x >= x0 && x <= x1 && Number.isFinite(c.points[i + 1])) ys.push(c.points[i + 1]);
          }
        for (const p of spec.points ?? []) if (Number.isFinite(p.y)) ys.push(p.y);
        const [y0, y1] = spec.yRange ?? robustRange(ys, [-5, 5]);
        v = { x0, x1, y0, y1 };
      }
      setHome(v);
      setView(v);
    });
    return () => {
      cancelled = true;
    };
  }, [view, staticHome, isCurve, isParam, exprs.length, sampleRange, spec]);

  // Re-sample after pan/zoom (functions only; parametric curves are sampled once)
  const viewX = v ? `${v.x0}|${v.x1}` : "";
  useEffect(() => {
    if (!v || !isCurve || exprs.length === 0) return;
    const t = setTimeout(() => {
      sampleRange(v.x0, v.x1).then((cs) => {
        if (cs) setCurves(cs);
      });
    }, 70);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewX, sampleRange]);

  const H = height;
  const W = width;
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const sx = useCallback((x: number) => (v ? M.l + ((x - v.x0) / (v.x1 - v.x0)) * pw : 0), [v, pw]);
  const sy = useCallback((y: number) => (v ? M.t + ((v.y1 - y) / (v.y1 - v.y0)) * ph : 0), [v, ph]);

  const zoom = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      setView((prev) => {
        const cur = prev ?? staticHome;
        if (!cur) return prev;
        const mx = cx ?? (cur.x0 + cur.x1) / 2;
        const my = cy ?? (cur.y0 + cur.y1) / 2;
        const nx0 = mx - (mx - cur.x0) * factor;
        const nx1 = mx + (cur.x1 - mx) * factor;
        const ny0 = my - (my - cur.y0) * factor;
        const ny1 = my + (cur.y1 - my) * factor;
        if (nx1 - nx0 < 1e-9 || nx1 - nx0 > 1e9) return cur;
        return { x0: nx0, x1: nx1, y0: ny0, y1: ny1 };
      });
    },
    [staticHome],
  );

  const toData = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg || !v) return null;
      const r = svg.getBoundingClientRect();
      const px = ((clientX - r.left) / r.width) * W;
      const py = ((clientY - r.top) / r.height) * H;
      return {
        x: v.x0 + ((px - M.l) / pw) * (v.x1 - v.x0),
        y: v.y1 - ((py - M.t) / ph) * (v.y1 - v.y0),
        px,
        py,
      };
    },
    [v, W, H, pw, ph],
  );

  // Wheel zoom (graphing page only, so the result page keeps normal scrolling)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toData(e.clientX, e.clientY);
      zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, p?.x, p?.y);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [interactive, toData, zoom]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!v || (e.pointerType === "touch" && !interactive)) return;
    drag.current = { px: e.clientX, py: e.clientY, view: v, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toData(e.clientX, e.clientY);
    if (p) setHover({ x: p.x, y: p.y });
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - d.px) / r.width) * W * ((d.view.x1 - d.view.x0) / pw);
    const dy = ((e.clientY - d.py) / r.height) * H * ((d.view.y1 - d.view.y0) / ph);
    setView({ x0: d.view.x0 - dx, x1: d.view.x1 - dx, y0: d.view.y0 + dy, y1: d.view.y1 + dy });
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!v) return;
    const stepX = (v.x1 - v.x0) * 0.1;
    const stepY = (v.y1 - v.y0) * 0.1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-stepX, 0],
      ArrowRight: [stepX, 0],
      ArrowUp: [0, stepY],
      ArrowDown: [0, -stepY],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setView({ x0: v.x0 + dx, x1: v.x1 + dx, y0: v.y0 + dy, y1: v.y1 + dy });
    } else if (e.key === "+" || e.key === "=") zoom(1 / 1.25);
    else if (e.key === "-") zoom(1.25);
    else if (e.key === "0") setView(home ?? staticHome);
  };

  const paths = useMemo(() => {
    if (!v) return [];
    return curves.map((c) =>
      splitSegments(c.points, v, !isParam).map((seg) =>
        seg.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(""),
      ),
    );
  }, [curves, v, isParam, sx, sy]);

  const shadePath = useMemo(() => {
    if (!v || !spec.shade || !curves[spec.shade.functionIndex]) return null;
    const { from, to } = spec.shade;
    const pts = curves[spec.shade.functionIndex].points;
    const seg: string[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if (x < from || x > to || !Number.isFinite(y)) continue;
      const cy = Math.max(v.y0 - (v.y1 - v.y0), Math.min(v.y1 + (v.y1 - v.y0), y));
      seg.push(`${seg.length ? "L" : "M"}${sx(x).toFixed(1)},${sy(cy).toFixed(1)}`);
    }
    if (seg.length < 2) return null;
    return `${seg.join("")}L${sx(Math.min(to, v.x1 + (v.x1 - v.x0))).toFixed(1)},${sy(0).toFixed(1)}L${sx(Math.max(from, v.x0 - (v.x1 - v.x0))).toFixed(1)},${sy(0).toFixed(1)}Z`;
  }, [v, spec.shade, curves, sx, sy]);

  const hoverValues = useMemo(() => {
    if (!hover || !isCurve || isParam) return [];
    return curves.map((c) => {
      // linear interpolation on the sampled grid
      const pts = c.points;
      for (let i = 2; i < pts.length; i += 2) {
        if (pts[i - 2] <= hover.x && pts[i] >= hover.x) {
          const a = pts[i - 1];
          const b = pts[i + 1];
          if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
          const t = (hover.x - pts[i - 2]) / (pts[i] - pts[i - 2] || 1);
          return a + (b - a) * t;
        }
      }
      return NaN;
    });
  }, [hover, curves, isCurve, isParam]);

  const errors = curves
    .map((c, i) => (c.error ? `${spec.functions[i]?.label ?? `f${i + 1}`}: ${c.error}` : null))
    .filter(Boolean);
  const description =
    title ??
    (spec.functions.length
      ? `Grafik ${spec.functions.map((f) => f.label).join("; ")}`
      : spec.kind === "histogram"
        ? "Histogram data"
        : spec.kind === "bar"
          ? "Diagram batang distribusi peluang"
          : "Diagram pencar data");

  const xt = v ? niceTicks(v.x0, v.x1, Math.max(3, Math.round(pw / 80))) : [];
  const yt = v ? niceTicks(v.y0, v.y1, Math.max(3, Math.round(ph / 50))) : [];
  const clipId = `clip-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <figure className="space-y-2">
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-xl border border-border bg-surface"
      >
        <svg
          ref={svgRef}
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={description}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setHover(null)}
          style={{ touchAction: interactive ? "none" : "pan-y" }}
          className="block cursor-grab select-none outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={M.l} y={M.t} width={pw} height={ph} />
            </clipPath>
          </defs>
          {v && (
            <>
              {/* grid */}
              <g stroke="var(--plot-grid)" strokeWidth={1}>
                {xt.map((t) => (
                  <line key={`gx${t}`} x1={sx(t)} x2={sx(t)} y1={M.t} y2={M.t + ph} />
                ))}
                {yt.map((t) => (
                  <line key={`gy${t}`} y1={sy(t)} y2={sy(t)} x1={M.l} x2={M.l + pw} />
                ))}
              </g>
              {/* axes */}
              <g stroke="var(--plot-axis)" strokeWidth={1.25}>
                {v.x0 <= 0 && v.x1 >= 0 && <line x1={sx(0)} x2={sx(0)} y1={M.t} y2={M.t + ph} />}
                {v.y0 <= 0 && v.y1 >= 0 && <line y1={sy(0)} y2={sy(0)} x1={M.l} x2={M.l + pw} />}
              </g>
              <rect x={M.l} y={M.t} width={pw} height={ph} fill="none" stroke="var(--border)" />
              {/* tick labels */}
              <g fill="var(--text-muted)" fontSize={11} fontFamily="var(--font-mono)">
                {xt.map((t) => (
                  <text key={`tx${t}`} x={sx(t)} y={H - 10} textAnchor="middle">
                    {formatTick(t)}
                  </text>
                ))}
                {yt.map((t) => (
                  <text key={`ty${t}`} x={M.l - 6} y={sy(t) + 4} textAnchor="end">
                    {formatTick(t)}
                  </text>
                ))}
              </g>
              <g clipPath={`url(#${clipId})`}>
                {shadePath && <path d={shadePath} fill="var(--accent)" opacity={0.18} />}
                {spec.kind === "histogram" &&
                  spec.data &&
                  histogram(spec.data).map((b, i) => (
                    <rect
                      key={i}
                      x={sx(b.x0) + 0.5}
                      y={sy(b.count)}
                      width={Math.max(1, sx(b.x1) - sx(b.x0) - 1)}
                      height={Math.max(0, sy(0) - sy(b.count))}
                      fill="var(--accent)"
                      opacity={0.75}
                    >
                      <title>{`[${formatTick(b.x0)}, ${formatTick(b.x1)}): ${b.count}`}</title>
                    </rect>
                  ))}
                {spec.kind === "bar" &&
                  spec.points?.map((p, i) => {
                    const bw = Math.max(2, (sx(1) - sx(0)) * 0.7);
                    return (
                      <rect
                        key={i}
                        x={sx(p.x) - bw / 2}
                        y={sy(p.y)}
                        width={bw}
                        height={Math.max(0, sy(0) - sy(p.y))}
                        fill={p.label ? "var(--accent)" : "var(--surface-3)"}
                        stroke="var(--accent)"
                        strokeWidth={p.label ? 0 : 1}
                      >
                        <title>{`k = ${p.x}: ${formatTick(p.y)}`}</title>
                      </rect>
                    );
                  })}
                {paths.map((segs, i) =>
                  segs.map((d, j) => (
                    <path
                      key={`${i}-${j}`}
                      d={d}
                      fill="none"
                      stroke={PLOT_COLORS[i % PLOT_COLORS.length]}
                      strokeWidth={2.2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )),
                )}
                {spec.kind !== "bar" &&
                  spec.points?.map((p, i) =>
                    Number.isFinite(p.x) && Number.isFinite(p.y) ? (
                      <g key={`p${i}`}>
                        <circle
                          cx={sx(p.x)}
                          cy={sy(p.y)}
                          r={spec.kind === "scatter" ? 4 : 5}
                          fill={spec.kind === "scatter" ? "var(--warm)" : "var(--surface)"}
                          stroke={spec.kind === "scatter" ? "none" : "var(--text)"}
                          strokeWidth={2}
                        />
                        {p.label && spec.kind !== "scatter" && (
                          <text
                            x={sx(p.x) + 8}
                            y={sy(p.y) - 8}
                            fontSize={11}
                            fill="var(--text)"
                            paintOrder="stroke"
                            stroke="var(--surface)"
                            strokeWidth={3}
                          >
                            {p.label}
                          </text>
                        )}
                      </g>
                    ) : null,
                  )}
                {hover && isCurve && !isParam && hover.x >= v.x0 && hover.x <= v.x1 && (
                  <line
                    x1={sx(hover.x)}
                    x2={sx(hover.x)}
                    y1={M.t}
                    y2={M.t + ph}
                    stroke="var(--plot-axis)"
                    strokeDasharray="3 4"
                  />
                )}
              </g>
            </>
          )}
          {!v && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--text-muted)" fontSize={13}>
              Menggambar grafik…
            </text>
          )}
        </svg>
        <div className="absolute right-2 top-2 flex gap-1">
          <button
            type="button"
            onClick={() => zoom(1 / 1.5)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface/90 text-muted hover:text-text"
            aria-label="Perbesar"
          >
            <Plus size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => zoom(1.5)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface/90 text-muted hover:text-text"
            aria-label="Perkecil"
          >
            <Minus size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setView(home ?? staticHome)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface/90 text-muted hover:text-text"
            aria-label="Kembalikan tampilan awal"
          >
            <Maximize2 size={14} aria-hidden />
          </button>
        </div>
        {hover && v && (
          <div className="pointer-events-none absolute bottom-9 left-14 rounded-md border border-border bg-surface/95 px-2 py-1 font-mono text-[11px] text-text shadow-sm">
            {spec.variable} = {formatTick(hover.x, 5)}
            {hoverValues.map((y, i) =>
              Number.isFinite(y) ? (
                <span key={i} style={{ color: PLOT_COLORS[i % PLOT_COLORS.length] }}>
                  {"  "}f{spec.functions.length > 1 ? i + 1 : ""} = {formatTick(y, 5)}
                </span>
              ) : null,
            )}
            {(!isCurve || isParam) && <span>{`  y = ${formatTick(hover.y, 5)}`}</span>}
          </div>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {spec.functions.map((f, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ background: PLOT_COLORS[i % PLOT_COLORS.length] }}
              aria-hidden
            />
            <span className="font-mono">{f.label}</span>
          </span>
        ))}
        {spec.shade && (
          <span>
            Daerah arsir: luas di bawah kurva pada [{formatTick(spec.shade.from)},{" "}
            {formatTick(spec.shade.to)}]
          </span>
        )}
        <span className="ml-auto hidden sm:inline">
          {interactive
            ? "Seret untuk menggeser · roda mouse untuk zoom · tombol panah & +/−"
            : "Seret untuk menggeser · tombol +/− untuk zoom"}
        </span>
      </figcaption>
      {errors.length > 0 && (
        <p className="text-xs text-bad" role="status">
          {errors.join(" · ")}
        </p>
      )}
    </figure>
  );
}
