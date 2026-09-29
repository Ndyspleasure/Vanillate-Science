import { describe, expect, it } from "vitest";
import { checkWork } from "./verify-work";

describe("verify my work", () => {
  it("accepts a correct equation solution", () => {
    const r = checkWork("2x + 5 = 15", ["2x = 10", "x = 5"]);
    expect(r.mode).toBe("equation");
    expect(r.lines.map((l) => l.status)).toEqual(["ok", "ok"]);
    expect(r.finalCorrect).toBe(true);
  });
  it("finds the first wrong step", () => {
    const r = checkWork("2x + 5 = 15", ["2x = 20", "x = 10"]);
    expect(r.firstError).toBe(0);
  });
  it("diagnoses lost solutions", () => {
    const r = checkWork("x^2 = 4", ["x = 2"]);
    expect(r.lines[0].status).toBe("error");
    expect(r.lines[0].detail).toMatch(/kehilangan solusi x = -2/);
    expect(checkWork("x^2 = 4", ["x = 2 atau x = -2"]).lines[0].status).toBe("ok");
  });
  it("diagnoses extraneous solutions", () => {
    const r = checkWork("sqrt(x + 2) = x", ["x + 2 = x^2"]);
    expect(r.lines[0].detail).toMatch(/solusi baru x = -1/);
  });
  it("checks expression rewriting", () => {
    const r = checkWork("(x+1)^2", ["x^2 + 2x + 1", "x^2 + x + 1"]);
    expect(r.lines.map((l) => l.status)).toEqual(["ok", "error"]);
    expect(r.firstError).toBe(1);
  });
  it("checks derivatives and antiderivatives", () => {
    expect(checkWork("d/dx x^2 sin(x)", ["2x sin(x) + x^2 cos(x)"]).lines[0].status).toBe("ok");
    expect(checkWork("d/dx x^2 sin(x)", ["2x cos(x)"]).lines[0].status).toBe("error");
    const r = checkWork("∫ 2x cos(x^2) dx", ["∫ cos(u) du", "sin(x^2) + C"]);
    expect(r.lines.map((l) => l.status)).toEqual(["unchecked", "ok"]);
  });
});
