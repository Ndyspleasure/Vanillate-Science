import { Fragment } from "react";
import { renderTex } from "./Tex";

/**
 * Plain text with inline math: segments wrapped in $…$ (as produced by the engine for
 * step explanations) are rendered with KaTeX; everything else is plain text.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  if (!text.includes("$")) return <span className={className}>{text}</span>;
  const parts = text.split(/\$([^$]+)\$/g);
  return (
    <span className={className}>
      {parts.map((p, i) => (i % 2 === 1 ? <span key={i} dangerouslySetInnerHTML={{ __html: renderTex(p, false) }} /> : <Fragment key={i}>{p}</Fragment>))}
    </span>
  );
}
