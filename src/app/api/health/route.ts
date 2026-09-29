import { handleRequest } from "@/engine/api";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Liveness + engine self-test (solves a known problem and checks the answer). */
export function GET() {
  const start = Date.now();
  const r = handleRequest({ type: "solve", input: "x^2 - 5x + 6 = 0" });
  const ok =
    r.ok &&
    "solution" in r &&
    r.solution.answers.map((a) => a.text).join(",") === "2,3" &&
    r.solution.verification.status === "verified";
  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      engine: ok ? "ok" : "self-test failed",
      version: SITE.version,
      commit: SITE.commit,
      durationMs: Date.now() - start,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
