/**
 * Web Worker that runs the math engine off the main thread, so long computations never
 * freeze the UI. The client (src/lib/engine-client.ts) terminates and recreates the worker
 * when a request exceeds its time limit.
 */
import { handleRequest, type EngineRequest } from "../engine/api";

interface WorkerScope {
  onmessage: ((ev: MessageEvent<{ id: number; req: EngineRequest }>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (ev) => {
  const { id, req } = ev.data;
  const res = handleRequest(req);
  scope.postMessage({ id, res });
};
