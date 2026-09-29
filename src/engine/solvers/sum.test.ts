import { describe, expect, it } from "vitest";
import { solve } from "../router";

function ok(input: string) {
  const r = solve(input);
  if (!r.ok) throw new Error(`${input}: ${r.error.message}`);
  return r.solution;
}

describe("sigma sums", () => {
  it("closed forms for polynomial sums, proven by induction", () => {
    const s1 = ok("sum(k, k, 1, n)");
    expect(s1.answers[0].text.replace(/\s/g, "")).toMatch(/n\^2\/2\+n\/2|n\/2\+n\^2\/2/);
    expect(
      s1.answers.some((a) => /n\*\(n\s*\+\s*1\)\/2|\(n\s*\+\s*1\)\*n\/2|1\/2/.test(a.text)),
    ).toBe(true);
    expect(s1.verification.status).toBe("verified");
    const s2 = ok("sum(k^2, k, 1, n)");
    expect(s2.verification.status).toBe("verified");
    const s3 = ok("sum(2k - 1, k, 1, n)");
    expect(s3.answers[0].text).toBe("n^2");
    const s4 = ok("sum(k^4, k, 0, n)");
    expect(s4.verification.status).toBe("verified");
  });

  it("finite numeric sums are exact", () => {
    expect(ok("sum(1/k, k, 1, 4)").answers[0].text).toBe("25/12");
    expect(ok("sum(k^2, k, 1, 10)").answers[0].text).toBe("385");
    expect(ok("sum(k, k, 1, 100000)").answers[0].text).toBe("5000050000");
    expect(ok("sum(k, k, 5, 3)").answers[0].text).toBe("0");
    const s = ok("sum(k^2, k, 1, 10)");
    expect(s.alternatives.length).toBe(1);
    expect(s.verification.status).toBe("verified");
  });

  it("geometric sums", () => {
    const g = ok("sum(2^k, k, 0, n)");
    expect(g.verification.status).toBe("verified");
    expect(ok("sum(2^k, k, 0, 10)").answers[0].text).toBe("2047");
    expect(ok("sum((1/2)^k, k, 0, inf)").answers[0].text).toBe("2");
    expect(ok("sum(3*(1/3)^k, k, 1, inf)").answers[0].text).toBe("3/2");
    expect(ok("sum(2^k, k, 0, inf)").answers[0].text).toBe("divergen");
    expect(ok("sum(k, k, 1, inf)").answers[0].text).toBe("divergen");
  });

  it("reports unsupported sums honestly", () => {
    const r = solve("sum(1/k, k, 1, n)");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("unsupported");
    const r2 = solve("sum(k, k, 1)");
    expect(r2.ok).toBe(false);
  });
});
