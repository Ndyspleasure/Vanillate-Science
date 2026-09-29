import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormulaCalculator } from "@/components/calculators/FormulaCalculator";
import { PeriodicTable } from "@/components/calculators/PeriodicTable";
import { ToolCalculator } from "@/components/calculators/ToolCalculator";
import { UnitConverter } from "@/components/calculators/UnitConverter";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { WorkedExample } from "@/components/solution/WorkedExample";
import { SolverApp } from "@/components/solver/SolverApp";
import { Tex } from "@/components/Tex";
import { ELEMENTS } from "@/engine/chemistry/elements";
import { TOOLS } from "@/engine/forms";
import { formulaVariablesLatex } from "@/engine/science/formula-solver";
import { FORMULA_BY_ID } from "@/engine/science/formulas";
import { COMMON_UNITS } from "@/engine/units/units";
import { CALCULATORS, CATEGORY_BY_ID, calculatorPath, findCalculator, type Calculator } from "@/lib/calculators";
import { workedExample } from "@/lib/examples";
import { formulaView } from "@/lib/formula-view";
import { absoluteUrl, SITE } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return CALCULATORS.map((c) => ({ category: c.category, slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/calculator/[category]/[slug]">): Promise<Metadata> {
  const { category, slug } = await params;
  const c = findCalculator(category, slug);
  if (!c) return {};
  const path = calculatorPath(c);
  return {
    title: c.title,
    description: c.description,
    keywords: c.keywords,
    alternates: { canonical: path },
    openGraph: { title: c.title, description: c.description, url: path, type: "website" },
  };
}

function Widget({ c }: { c: Calculator }) {
  const k = c.kind;
  switch (k.type) {
    case "solver":
      return (
        <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />}>
          <SolverApp examples={[{ label: "Contoh", items: k.examples }]} presetMode={k.mode} placeholder={k.placeholder ?? `Contoh: ${k.examples[0]}`} heading={c.title} />
        </Suspense>
      );
    case "formula":
      return <FormulaCalculator formula={formulaView(FORMULA_BY_ID[k.formulaId])} />;
    case "tool": {
      const t = TOOLS[k.tool];
      return <ToolCalculator toolId={t.id} title={c.title} fields={t.fields} defaults={t.defaults} />;
    }
    case "units":
      return <UnitConverter categories={COMMON_UNITS} category={k.unitCategory} />;
    case "periodic-table":
      return <PeriodicTable elements={ELEMENTS.map((e) => ({ ...e }))} />;
  }
}

function FormulaDetails({ formulaId }: { formulaId: string }) {
  const def = FORMULA_BY_ID[formulaId];
  const latex = formulaVariablesLatex(def);
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Daftar besaran pada rumus</caption>
          <thead className="bg-surface-2">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Simbol</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Besaran</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Satuan SI</th>
            </tr>
          </thead>
          <tbody>
            {def.variables.map((v) => (
              <tr key={v.s} className="border-t border-border">
                <td className="px-3 py-2">
                  <Tex tex={latex[v.s] ?? v.s} />
                </td>
                <td className="px-3 py-2 text-text">
                  {v.name}
                  {v.constant ? " (konstanta)" : ""}
                </td>
                <td className="px-3 py-2 font-mono text-muted">{v.unit || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Rujukan: {def.reference.name} — {def.reference.source}
        {def.reference.url ? (
          <>
            {" "}
            (
            <a href={def.reference.url} className="underline hover:text-accent" rel="noopener noreferrer" target="_blank">
              tautan
            </a>
            )
          </>
        ) : null}
      </p>
    </div>
  );
}

export default async function CalculatorPage({ params }: PageProps<"/calculator/[category]/[slug]">) {
  const { category, slug } = await params;
  const c = findCalculator(category, slug);
  if (!c) notFound();
  const cat = CATEGORY_BY_ID[c.category];
  const example = workedExample(c);
  const related = CALCULATORS.filter((o) => o.category === c.category && o.slug !== c.slug && o.topic === c.topic)
    .concat(CALCULATORS.filter((o) => o.category === c.category && o.topic !== c.topic))
    .slice(0, 6);
  const path = calculatorPath(c);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <Breadcrumbs
        items={[
          { name: "Beranda", href: "/" },
          { name: "Kalkulator", href: "/calculator" },
          { name: cat.name, href: `/calculator/${cat.id}` },
          { name: c.title, href: path },
        ]}
      />
      <header className="space-y-2">
        <p className="text-sm font-medium text-accent">
          {cat.name} · {c.topic}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">{c.title}</h1>
        <p className="max-w-3xl text-muted">{c.description}</p>
      </header>

      <Widget c={c} />

      {example?.ok && <WorkedExample solution={example.solution} />}

      <section aria-labelledby="tentang" className="prose-edu space-y-3">
        <h2 id="tentang" className="text-xl font-semibold text-text">
          Tentang kalkulator ini
        </h2>
        {c.intro.map((p, i) => (
          <p key={i} className="text-text/90">
            {p}
          </p>
        ))}
        {c.kind.type === "formula" && <FormulaDetails formulaId={c.kind.formulaId} />}
        <p className="text-sm text-muted">
          Perhitungan dilakukan oleh mesin matematika deterministik di peramban Anda — tanpa AI generatif. Baca <Link href="/tentang" className="text-accent underline">metodologi dan batasan</Link>.
        </p>
      </section>

      {c.faq.length > 0 && (
        <section aria-labelledby="faq" className="space-y-3">
          <h2 id="faq" className="text-xl font-semibold text-text">
            Pertanyaan umum
          </h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {c.faq.map((f, i) => (
              <details key={i} className="group px-4 py-3">
                <summary className="cursor-pointer list-none font-medium text-text marker:hidden">
                  <span className="mr-2 inline-block text-accent transition-transform group-open:rotate-90" aria-hidden>
                    ›
                  </span>
                  {f.q}
                </summary>
                <p className="mt-2 pl-5 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section aria-labelledby="terkait" className="space-y-3">
          <h2 id="terkait" className="text-xl font-semibold text-text">
            Kalkulator terkait
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={calculatorPath(r)} className="block rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-text hover:border-accent hover:text-accent">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: c.title,
            description: c.description,
            url: absoluteUrl(path),
            applicationCategory: "EducationalApplication",
            operatingSystem: "Any",
            inLanguage: "id",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "IDR" },
            publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
          },
          ...(c.faq.length
            ? [
                {
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: c.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
