/**
 * Client for the engine Web Worker.
 *
 * - One shared worker, lazily created; each request carries an id.
 * - A request that exceeds its time limit terminates the worker (the only way to stop a
 *   runaway computation) and resolves with a structured "timeout" error; the next request
 *   starts a fresh worker.
 * - When Web Workers are unavailable, the engine is loaded on the main thread instead.
 */
import type {
  EngineRequest,
  EngineResponse,
  PreviewOutcome,
  SampleOutcome,
  SolveOutcome,
  WorkOutcome,
} from "@/engine/api";
import type { SerializedMathError } from "@/engine/core/errors";

interface Pending {
  resolve: (res: EngineResponse) => void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function engineError(
  kind: SerializedMathError["kind"],
  title: string,
  message: string,
  hint?: string,
): SerializedMathError {
  return { kind, title, message, hint, module: "client", timestamp: new Date().toISOString() };
}

function failAll(error: SerializedMathError) {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, error, input: "" } as EngineResponse);
    pending.delete(id);
  }
}

function getWorker(): Worker | null {
  if (workerBroken || typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/engine.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (ev: MessageEvent<{ id: number; res: EngineResponse }>) => {
    const p = pending.get(ev.data.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(ev.data.id);
    p.resolve(ev.data.res);
  };
  worker.onerror = () => {
    worker?.terminate();
    worker = null;
    failAll(
      engineError(
        "internal",
        "Kesalahan internal solver",
        "Mesin perhitungan berhenti secara tidak terduga.",
        "Coba lagi. Jika masalah berlanjut, muat ulang halaman.",
      ),
    );
  };
  return worker;
}

/** Stop the current computation (if any). */
export function cancelEngine() {
  if (!worker) return;
  worker.terminate();
  worker = null;
  failAll(engineError("timeout", "Dibatalkan", "Perhitungan dibatalkan."));
}

export function runEngine(
  req: Extract<EngineRequest, { type: "check-work" }>,
  options?: { timeoutMs?: number },
): Promise<WorkOutcome>;
export function runEngine(
  req: Extract<EngineRequest, { type: "sample" }>,
  options?: { timeoutMs?: number },
): Promise<SampleOutcome>;
export function runEngine(
  req: Extract<EngineRequest, { type: "preview" }>,
  options?: { timeoutMs?: number },
): Promise<PreviewOutcome>;
export function runEngine(
  req: EngineRequest,
  options?: { timeoutMs?: number },
): Promise<SolveOutcome>;
export async function runEngine(
  req: EngineRequest,
  options: { timeoutMs?: number } = {},
): Promise<EngineResponse> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const w = getWorker();
  if (!w) {
    const { handleRequest } = await import("@/engine/api");
    return handleRequest(req);
  }
  const id = nextId++;
  return new Promise<EngineResponse>((resolve) => {
    const timer = setTimeout(() => {
      // Terminating is the only way to interrupt a synchronous computation in a worker.
      pending.delete(id);
      cancelEngine();
      resolve({
        ok: false,
        error: engineError(
          "timeout",
          "Waktu komputasi habis",
          `Perhitungan melebihi batas ${Math.round(timeoutMs / 1000)} detik dan dihentikan.`,
          "Sederhanakan soal, kecilkan angka/derajat, atau pecah soal menjadi beberapa bagian.",
        ),
        input: "",
      } as EngineResponse);
    }, timeoutMs);
    pending.set(id, { resolve, timer });
    w.postMessage({ id, req });
  });
}
