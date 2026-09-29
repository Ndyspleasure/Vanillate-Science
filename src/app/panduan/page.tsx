import type { Metadata } from "next";
import Link from "next/link";
import { GUIDE } from "@/lib/guide";

export const metadata: Metadata = {
  title: "Panduan Menulis Soal",
  description:
    "Cara menulis soal matematika untuk Vanillate Science: operator, fungsi, persamaan, turunan, integral, limit, notasi sigma, matriks, bilangan kompleks, dan statistik — dengan contoh yang bisa langsung dicoba.",
  alternates: { canonical: "/panduan" },
};

export default function PanduanPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">
          Panduan menulis soal
        </h1>
        <p className="text-muted">
          Tulis soal seperti di buku, dengan keyboard biasa. Kolom input juga menampilkan pratinjau
          “Dibaca sebagai” sehingga Anda bisa memastikan soal ditafsirkan dengan benar sebelum
          menghitung. Klik contoh mana pun untuk mencobanya.
        </p>
      </header>
      {GUIDE.map((section) => (
        <section key={section.title} className="space-y-3" aria-labelledby={`g-${section.title}`}>
          <h2 id={`g-${section.title}`} className="text-lg font-semibold text-text">
            {section.title}
          </h2>
          {section.note && <p className="text-sm text-muted">{section.note}</p>}
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left">
                    Tulis
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    Arti
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    Contoh
                  </th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((r) => (
                  <tr key={r.syntax} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-text">{r.syntax}</td>
                    <td className="px-3 py-2 text-muted">{r.meaning}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/?q=${encodeURIComponent(r.example)}`}
                        className="font-mono text-accent hover:underline"
                      >
                        {r.example}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <section className="space-y-2 text-sm text-muted">
        <h2 className="text-lg font-semibold text-text">Tips penafsiran</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            1/2x dibaca (1/2)·x. Tulis 1/(2x) jika maksudnya satu per 2x — sistem akan memberi
            peringatan untuk bentuk yang ambigu.
          </li>
          <li>
            sin x^2 dibaca sin(x²). Gunakan tanda kurung, misalnya (sin x)^2 atau sin(x)^2, bila
            maksudnya berbeda.
          </li>
          <li>
            Huruf yang berdampingan dikalikan: xy = x·y. Nama fungsi yang tidak dikenal (misalnya
            “sine(x)”) ditolak dengan saran.
          </li>
          <li>
            Untuk kalkulator rumus sains, kalkulator statistik, keuangan, dan kimia, gunakan
            formulir di halaman{" "}
            <Link href="/calculator" className="text-accent underline">
              Kalkulator
            </Link>
            .
          </li>
        </ul>
      </section>
    </div>
  );
}
