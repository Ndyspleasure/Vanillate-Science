import type { Solution, Step } from "@/engine/steps/types";

const STATUS_TEXT: Record<Solution["verification"]["status"], string> = {
  verified: "Terverifikasi",
  "verified-numeric": "Terverifikasi numerik",
  partial: "Sebagian terverifikasi",
  unverified: "Belum terverifikasi",
  failed: "Verifikasi gagal",
};

function stepsMarkdown(steps: Step[], indent = ""): string[] {
  const out: string[] = [];
  steps.forEach((s, i) => {
    out.push(`${indent}${i + 1}. **${s.title}**`);
    out.push(`${indent}   $$${s.after}$$`);
    if (s.rule)
      out.push(
        `${indent}   _Aturan:_ ${s.rule.name}${s.rule.formula ? ` — $${s.rule.formula}$` : ""}`,
      );
    out.push(`${indent}   ${s.reason}`);
    if (s.substeps?.length) out.push(...stepsMarkdown(s.substeps, `${indent}   `));
  });
  return out;
}

export function answersText(solution: Solution): string {
  return solution.answers
    .map((a) => `${a.label ? `${a.label}: ` : ""}${a.text}${a.approx ? ` (≈ ${a.approx})` : ""}`)
    .join("\n");
}

/** Markdown export with LaTeX math ($…$), suitable for notes, Obsidian, Notion, GitHub. */
export function solutionToMarkdown(solution: Solution, url?: string): string {
  const lines: string[] = [];
  lines.push(`# ${solution.title}`, "");
  lines.push(`**Soal:** $${solution.inputLatex}$`, "");
  lines.push("## Jawaban", "");
  for (const a of solution.answers)
    lines.push(`- ${a.label ? `${a.label}: ` : ""}$${a.latex}$${a.approx ? ` ≈ ${a.approx}` : ""}`);
  lines.push("", `## Metode: ${solution.method.name}`, "", solution.method.description, "");
  if (solution.method.formula) lines.push(`$$${solution.method.formula}$$`, "");
  lines.push("## Langkah", "", ...stepsMarkdown(solution.steps), "");
  lines.push(
    "## Verifikasi",
    "",
    `**${STATUS_TEXT[solution.verification.status]}** — ${solution.verification.summary}`,
    "",
  );
  for (const c of solution.verification.checks)
    lines.push(
      `- ${c.passed ? "✔" : "✘"} ${c.description} (${c.method}${c.detail ? `; ${c.detail}` : ""})`,
    );
  if (solution.assumptions.length)
    lines.push("", "## Asumsi", "", ...solution.assumptions.map((a) => `- ${a}`));
  if (solution.notes.length)
    lines.push("", "## Catatan", "", ...solution.notes.map((a) => `- ${a}`));
  lines.push(
    "",
    "---",
    `Dihitung oleh Vanillate Science (mesin v${solution.meta.engineVersion}, modul ${solution.meta.module})${url ? ` — ${url}` : ""}`,
  );
  return lines.join("\n");
}

/** Escape LaTeX specials outside $…$ math spans. */
function escapeText(t: string): string {
  return t
    .split(/(\$[^$]+\$)/g)
    .map((part) =>
      part.startsWith("$") && part.endsWith("$") && part.length > 1
        ? part
        : part.replace(/([%&#_{}])/g, "\\$1"),
    )
    .join("");
}

export function solutionToLatex(solution: Solution): string {
  const body: string[] = [];
  body.push(`\\textbf{Soal: } $${solution.inputLatex}$\\\\`);
  body.push("\\begin{enumerate}");
  for (const s of solution.steps) body.push(`  \\item ${escapeText(s.title)}: \\[ ${s.after} \\]`);
  body.push("\\end{enumerate}");
  body.push(`\\textbf{Jawaban: } ${solution.answers.map((a) => `$${a.latex}$`).join(", ")}`);
  return body.join("\n");
}
