import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CalculatorSearch } from "@/components/calculators/CalculatorSearch";
import { CategoryIcon } from "@/components/CategoryIcon";
import {
  CALCULATORS,
  CATEGORIES,
  CATEGORY_BY_ID,
  calculatorPath,
  calculatorsIn,
} from "@/lib/calculators";

export const metadata: Metadata = {
  title: "Semua Kalkulator Matematika & Sains",
  description: `Lebih dari ${Math.floor(CALCULATORS.length / 10) * 10} kalkulator: matematika, fisika, kimia, statistika, keuangan, ilmu komputer, astronomi, teknik, geometri, dan konversi satuan — semuanya dengan langkah dan verifikasi.`,
  alternates: { canonical: "/calculator" },
};

export default function CalculatorIndex() {
  const entries = CALCULATORS.map((c) => ({
    title: c.title,
    href: calculatorPath(c),
    category: CATEGORY_BY_ID[c.category].name,
    text: `${c.topic} ${c.description} ${(c.keywords ?? []).join(" ")}`,
  }));
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <Breadcrumbs
        items={[
          { name: "Beranda", href: "/" },
          { name: "Kalkulator", href: "/calculator" },
        ]}
      />
      <header className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">
          Semua kalkulator
        </h1>
        <p className="max-w-3xl text-muted">
          {CALCULATORS.length} kalkulator yang dibangun di atas satu mesin matematika. Tidak
          menemukan yang dicari? Ketik soalnya langsung di{" "}
          <Link href="/" className="text-accent underline">
            Solver
          </Link>
          .
        </p>
      </header>
      <CalculatorSearch entries={entries} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const list = calculatorsIn(cat.id);
          return (
            <section
              key={cat.id}
              className="flex flex-col rounded-2xl border border-border bg-surface p-5"
            >
              <h2 className="flex items-center gap-2 text-lg font-semibold text-text">
                <CategoryIcon id={cat.id} />
                <Link href={`/calculator/${cat.id}`} className="hover:text-accent">
                  {cat.name}
                </Link>
                <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-xs font-normal text-muted">
                  {list.length}
                </span>
              </h2>
              <p className="mt-1 text-sm text-muted">{cat.description}</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {list.slice(0, 6).map((c) => (
                  <li key={c.slug}>
                    <Link href={calculatorPath(c)} className="text-text hover:text-accent">
                      {c.title.replace(/^Kalkulator /, "")}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={`/calculator/${cat.id}`}
                className="mt-auto pt-3 text-sm font-medium text-accent"
              >
                Lihat semua {cat.name.toLowerCase()} →
              </Link>
            </section>
          );
        })}
      </div>
    </div>
  );
}
