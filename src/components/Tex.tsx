import katex from "katex";

/**
 * Server- and client-safe KaTeX rendering. Input LaTeX is produced by the engine's printers
 * (never raw user HTML); `trust: false` disables \href, \url and similar commands so user
 * text cannot inject links or HTML.
 */
const cache = new Map<string, string>();

export function renderTex(tex: string, display = false): string {
  const key = `${display ? "D" : "I"}${tex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let html: string;
  try {
    html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      trust: false,
      strict: "ignore",
      output: "htmlAndMathml",
      maxSize: 50,
      maxExpand: 500,
    });
  } catch {
    html = `<code>${tex.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</code>`;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, html);
  return html;
}

export function Tex({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
  if (display) {
    return <div className={`math-scroll ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: renderTex(tex, true) }} />;
  }
  return <span className={className} dangerouslySetInnerHTML={{ __html: renderTex(tex, false) }} />;
}
