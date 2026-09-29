import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import {
  CATEGORIES,
  CATEGORY_BY_ID,
  calculatorPath,
  calculatorsIn,
  type CategoryId,
} from "@/lib/calculators";
import { absoluteUrl } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/calculator/[category]">): Promise<Metadata> {
  const { category } = await params;
  const cat = CATEGORY_BY_ID[category as CategoryId];
  if (!cat) return {};
  return {
    title: `${cat.title} Online dengan Langkah`,
    description: cat.description,
    alternates: { canonical: `/calculator/${cat.id}` },
    openGraph: { title: cat.title, description: cat.description, url: `/calculator/${cat.id}` },
  };
}

export default async function CategoryPage({ params }: PageProps<"/calculator/[category]">) {
  const { category } = await params;
  const cat = CATEGORY_BY_ID[category as CategoryId];
  if (!cat) notFound();
  const list = calculatorsIn(cat.id);
  const topics = [...new Set(list.map((c) => c.topic))];
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <Breadcrumbs
        items={[
          { name: "Beranda", href: "/" },
          { name: "Kalkulator", href: "/calculator" },
          { name: cat.name, href: `/calculator/${cat.id}` },
        ]}
      />
      <header className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">{cat.title}</h1>
        <p className="max-w-3xl text-muted">{cat.description}</p>
        <p className="max-w-3xl text-sm text-text/85">{cat.intro}</p>
      </header>
      {topics.map((t) => (
        <section key={t} aria-labelledby={`topik-${t}`} className="space-y-3">
          <h2 id={`topik-${t}`} className="text-lg font-semibold text-text">
            {t}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list
              .filter((c) => c.topic === t)
              .map((c) => (
                <li key={c.slug}>
                  <Link
                    href={calculatorPath(c)}
                    className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 hover:border-accent"
                  >
                    <span className="font-medium text-text">
                      {c.title.replace(/^Kalkulator /, "")}
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs text-muted">{c.description}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: cat.title,
          description: cat.description,
          url: absoluteUrl(`/calculator/${cat.id}`),
          hasPart: list.map((c) => ({
            "@type": "WebApplication",
            name: c.title,
            url: absoluteUrl(calculatorPath(c)),
          })),
        }}
      />
    </div>
  );
}
