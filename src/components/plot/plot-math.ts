/** Pure helpers for the SVG plotter (tested in plot-math.test.ts). */

export function formatTick(t: number, digits = 4): string {
  if (!Number.isFinite(t)) return "—";
  if (Math.abs(t) < 1e-12) return "0";
  const a = Math.abs(t);
  if (a >= 1e5 || a < 1e-3) {
    const [m, e] = t.toExponential(Math.max(0, digits - 2)).split("e");
    return `${m.replace(/\.?0+$/, "")}e${e.replace("+", "")}`;
  }
  return String(Number(t.toPrecision(digits)));
}

export function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target);
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export function niceTicks(a: number, b: number, target: number): number[] {
  if (!(b > a) || !Number.isFinite(a) || !Number.isFinite(b)) return [];
  const step = niceStep(b - a, target);
  const out: number[] = [];
  for (let k = Math.ceil(a / step); k * step <= b + step * 1e-9 && out.length < 60; k++)
    out.push(Number((k * step).toPrecision(12)));
  return out;
}

/** Axis range that ignores extreme outliers (asymptotes) while keeping the visible shape. */
export function robustRange(values: number[], fallback: [number, number]): [number, number] {
  const v = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (v.length === 0) return fallback;
  const q = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  let lo = q(0.02);
  let hi = q(0.98);
  if (v.length < 50) {
    lo = v[0];
    hi = v[v.length - 1];
  }
  if (hi - lo < 1e-9) {
    const d = Math.max(1, Math.abs(lo) * 0.5);
    lo -= d;
    hi += d;
  }
  const span = hi - lo;
  if (lo > 0 && lo < span * 0.5) lo = 0;
  if (hi < 0 && -hi < span * 0.5) hi = 0;
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

/**
 * Turn flat sampled points into drawable segments. Segments break at NaN (outside the
 * domain) and, for function graphs, where consecutive samples jump from far above the
 * view to far below it (vertical asymptotes such as tan x at π/2).
 */
export function splitSegments(
  points: number[],
  view: { x0: number; x1: number; y0: number; y1: number },
  breakJumps: boolean,
): Array<Array<[number, number]>> {
  const span = view.y1 - view.y0;
  const lo = view.y0 - 2 * span;
  const hi = view.y1 + 2 * span;
  const wx = view.x1 - view.x0;
  const segs: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  let prevY = NaN;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (cur.length > 1) segs.push(cur);
      cur = [];
      prevY = NaN;
      continue;
    }
    if (breakJumps && (x < view.x0 - wx || x > view.x1 + wx)) continue;
    if (
      breakJumps &&
      Number.isFinite(prevY) &&
      ((prevY > view.y1 && y < view.y0) || (prevY < view.y0 && y > view.y1))
    ) {
      if (cur.length > 1) segs.push(cur);
      cur = [];
    }
    cur.push([x, Math.max(lo, Math.min(hi, y))]);
    prevY = y;
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}
