import { describe, expect, it } from "vitest";
import { formatTick, niceTicks, robustRange, splitSegments } from "./plot-math";

describe("plot math", () => {
  it("formats ticks compactly", () => {
    expect(formatTick(0)).toBe("0");
    expect(formatTick(1e-15)).toBe("0");
    expect(formatTick(2.5)).toBe("2.5");
    expect(formatTick(0.30000000000000004)).toBe("0.3");
    expect(formatTick(250000)).toBe("2.5e5");
    expect(formatTick(-0.0002)).toBe("-2e-4");
  });

  it("produces nice ticks", () => {
    expect(niceTicks(-10, 10, 4)).toEqual([-10, -5, 0, 5, 10]);
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(1, 0, 5)).toEqual([]);
  });

  it("robust range ignores asymptote spikes", () => {
    const ys = Array.from({ length: 200 }, (_, i) => Math.sin(i / 10));
    ys.push(1e12, -1e12);
    const [lo, hi] = robustRange(ys, [-1, 1]);
    expect(lo).toBeGreaterThan(-2);
    expect(hi).toBeLessThan(2);
    expect(robustRange([], [-5, 5])).toEqual([-5, 5]);
    const [a, b] = robustRange([3, 3, 3], [0, 1]);
    expect(a).toBeLessThan(3);
    expect(b).toBeGreaterThan(3);
  });

  it("splits segments at gaps and asymptotes", () => {
    const view = { x0: -2, x1: 2, y0: -5, y1: 5 };
    const pts = [-1, 1, -0.5, 2, 0, NaN, 0.5, 2, 1, 1];
    expect(splitSegments(pts, view, true).length).toBe(2);
    const tan = [1.5, 14, 1.56, 100, 1.58, -100, 1.6, -30];
    expect(splitSegments(tan, view, true).length).toBe(2);
    expect(splitSegments(tan, view, false).length).toBe(1);
  });
});
