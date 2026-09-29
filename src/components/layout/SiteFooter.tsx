import Link from "next/link";
import { SITE } from "@/lib/site";

const GROUPS = [
  {
    title: "Matematika",
    links: [
      { href: "/calculator/math/persamaan-kuadrat", label: "Persamaan kuadrat" },
      { href: "/calculator/math/turunan", label: "Turunan" },
      { href: "/calculator/math/integral", label: "Integral" },
      { href: "/calculator/math/matriks", label: "Matriks" },
    ],
  },
  {
    title: "Sains",
    links: [
      { href: "/calculator/physics", label: "Fisika" },
      { href: "/calculator/chemistry", label: "Kimia" },
      { href: "/calculator/astronomy", label: "Astronomi" },
      { href: "/calculator/units/konversi-satuan", label: "Konversi satuan" },
    ],
  },
  {
    title: "Lainnya",
    links: [
      { href: "/calculator/statistics", label: "Statistika" },
      { href: "/calculator/finance", label: "Keuangan" },
      { href: "/calculator/computer-science", label: "Ilmu komputer" },
      { href: "/grafik", label: "Kalkulator grafik" },
    ],
  },
  {
    title: "Tentang",
    links: [
      { href: "/tentang", label: "Metodologi & akurasi" },
      { href: "/verifikasi", label: "Cek pekerjaan saya" },
      { href: "/panduan", label: "Panduan penulisan" },
      { href: "/riwayat", label: "Riwayat & favorit" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h2 className="mb-3 text-sm font-semibold text-text">{g.title}</h2>
            <ul className="space-y-2 text-sm">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted hover:text-accent">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.name}. Semua perhitungan dilakukan oleh mesin matematika deterministik di perangkat Anda — tanpa AI generatif.
          </p>
          <p>
            Mesin v{SITE.version} · {SITE.commit}
          </p>
        </div>
      </div>
    </footer>
  );
}
