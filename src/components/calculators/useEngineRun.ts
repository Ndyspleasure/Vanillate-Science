"use client";

import { useCallback, useRef, useState } from "react";
import type { EngineRequest, SolveOutcome } from "@/engine/api";
import { runEngine } from "@/lib/engine-client";

/** Run solve-type engine requests with busy/outcome state; stale responses are ignored. */
export function useEngineRun() {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SolveOutcome | null>(null);
  const seq = useRef(0);
  const run = useCallback(
    async (req: Exclude<EngineRequest, { type: "check-work" | "sample" | "preview" }>) => {
      const id = ++seq.current;
      setBusy(true);
      const res = await runEngine(req);
      if (id !== seq.current) return null;
      setBusy(false);
      setOutcome(res);
      return res;
    },
    [],
  );
  return { busy, outcome, run, setOutcome };
}
