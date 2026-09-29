import Link from "next/link";
import { Suspense } from "react";
import { BadgeCheck, BookOpenCheck, Cpu, Languages, Layers, ShieldCheck } from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { JsonLd } from "@/components/JsonLd";
import { RecentHistory } from "@/components/RecentHistory";
import { SolverApp, type ExampleGroup } from "@/components/solver/SolverApp";
import { CALCULATORS, CATEGORIES, calculatorPath, calculatorsIn } from "@/lib/calculators";
import { SITE } from "@/lib/site";

const EXAMPLES: ExampleGroup[] = [
  {
    label: "Aljabar",
    items: [
      "x^2 - 5x + 6 = 0",
      "2x + y = 7; x - y = 2",
      "faktorkan x^3 - 8",
      "(x - 1)/(x + 2) >= 0",
    ],
  },
  {
    label: "Kalkulus",
    items: [
      "d/dx (x^3 sin(x))",
      "integral x e^x",
      "integral from 0 to pi of sin(x)",
      "lim x->0 sin(x)/x",
    ],
  },
  {
    label: "Lainnya",
    items: ["det([[1, 2], [3, 4]])", "sum(k^2, k, 1, n)", "(3 + 4i)(1 - 2i)", "12, 15, 11, 18, 20"],
  },
];

const FEATURES = [
  {
    icon: Layers,
    title: "Langkah yang benar-benar dihitung",
    text: "Setiap langkah berasal dari operasi yang dilakukan mesin, lengkap dengan aturan dan alasannya — bukan teks karangan.",
  },
  {
    icon: ShieldCheck,
    title: "Verifikasi independen",
    text: "Hasil diperiksa ulang: substitusi ke soal, turunan balik untuk integral, uji numerik, atau analisis dimensi.",
  },
  {
    icon: Cpu,
    title: "Tanpa AI generatif",
    text: "Perhitungan dilakukan oleh mesin matematika deterministik: input yang sama selalu memberi hasil yang sama.",
  },
  {
    icon: BookOpenCheck,
    title: "Lima tingkat penjelasan",
    text: "Dari Dasar untuk pemula hingga Expert dengan teorema, syarat keberlakuan, dan status verifikasi setiap langkah.",
  },
  {
    icon: BadgeCheck,
    title: "Jujur soal batasan",
    text: "Jika soal belum didukung atau hasil tidak dapat diverifikasi, sistem mengatakannya — tidak menebak.",
  },
  {
    icon: Languages,
    title: "Berbahasa Indonesia",
    text: "Antarmuka, langkah, dan pesan kesalahan dalam bahasa Indonesia; perintah seperti “turunan” dan “faktorkan” dikenali.",
  },
];

const POPULAR = [
  "math/persamaan-kuadrat",
  "math/turunan",
  "math/integral",
  "math/matriks",
  "physics/energi-kinetik",
  "physics/hukum-ohm",
  "chemistry/penyetaraan-reaksi",
  "chemistry/kalkulator-ph",
  "statistics/distribusi-normal",
  "finance/cicilan-pinjaman",
  "computer-science/subnet-ipv4",
  "units/konversi-suhu",
];

export default function Home() {
  const popular = POPULAR.map((p) =>
    CALCULATORS.find((c) => `${c.category}/${c.slug}` === p),
  ).filter((c) => c !== undefined);
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="pb-8 pt-10 sm:pt-14">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
            Masukkan soalnya. <span className="text-accent">Lihat cara & buktinya.</span>
          </h1>
          <p className="mt-3 text-base text-muted sm:text-lg">
            {SITE.tagline}. Aljabar, kalkulus, matriks, statistika, fisika, kimia, keuangan, dan
            satuan.
          </p>
        </div>
        <div className="mx-auto mt-8 max-w-4xl">
          <Suspense
            fallback={
              <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />
            }
          >
            <SolverApp examples={EXAMPLES} autoFocus heading="Solver matematika" />
          </Suspense>
        </div>
        <div className="mx-auto mt-6 max-w-4xl">
          <RecentHistory />
        </div>
      </section>

      <section aria-labelledby="kategori" className="py-8">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="kategori" className="text-xl font-semibold text-text">
            Kategori kalkulator
          </h2>
          <Link href="/calculator" className="text-sm font-medium text-accent">
            Semua {CALCULATORS.length} kalkulator →
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <li key={c.id}>
              <Link
                href={`/calculator/${c.id}`}
                className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 hover:border-accent"
              >
                <CategoryIcon id={c.id} />
                <span className="font-medium text-text">{c.name}</span>
                <span className="text-xs text-muted">{calculatorsIn(c.id).length} kalkulator</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="populer" className="py-8">
        <h2 id="populer" className="mb-4 text-xl font-semibold text-text">
          Kalkulator populer
        </h2>
        <ul className="flex flex-wrap gap-2">
          {popular.map((c) => (
            <li key={c.slug}>
              <Link
                href={calculatorPath(c)}
                className="inline-block rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-text hover:border-accent hover:text-accent"
              >
                {c.title.replace(/^Kalkulator /, "")}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="keunggulan" className="py-8">
        <h2 id="keunggulan" className="mb-4 text-xl font-semibold text-text">
          Dibangun untuk ketepatan
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-xl border border-border bg-surface p-5">
              <f.icon size={20} className="text-accent" aria-hidden />
              <h3 className="mt-3 font-semibold text-text">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{f.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted">
          Ingin memeriksa pekerjaan sendiri? Gunakan{" "}
          <Link href="/verifikasi" className="font-medium text-accent underline">
            Cek Pekerjaan Saya
          </Link>{" "}
          untuk menemukan baris pertama yang salah. Pelajari cara menulis soal di{" "}
          <Link href="/panduan" className="font-medium text-accent underline">
            Panduan
          </Link>
          .
        </p>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: SITE.name,
          url: SITE.url,
          inLanguage: "id",
          description: SITE.description,
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${SITE.url}/?q={soal}` },
            "query-input": "required name=soal",
          },
        }}
      />
    </div>
  );
}
