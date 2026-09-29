import type { Metadata } from "next";
import Link from "next/link";
import { Tex } from "@/components/Tex";
import { VerificationBadge } from "@/components/solution/VerificationBadge";
import { LEVELS } from "@/engine/steps/types";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Metodologi, Akurasi & Batasan",
  description: "Bagaimana Vanillate Science menghitung: parser, pohon ekspresi, aritmetika rasional eksak, aturan langkah, verifikasi independen, presisi numerik, dan batasan yang perlu Anda ketahui.",
  alternates: { canonical: "/tentang" },
};

const PIPELINE = [
  ["Parser", "Input (ASCII, Unicode, atau kata perintah seperti “turunan”) diurai menjadi pohon sintaks. Penafsiran yang ambigu — misalnya 1/2x — dilaporkan sebagai peringatan, bukan ditebak diam-diam."],
  ["Pohon ekspresi (AST)", "Pohon sintaks diubah menjadi ekspresi matematika kanonik yang disederhanakan otomatis (penjumlahan/perkalian datar, konstanta digabung)."],
  ["Inti simbolik & numerik", "Bilangan disimpan sebagai pecahan rasional eksak (BigInt), akar dan π dipertahankan secara simbolik. Metode numerik dipakai hanya bila perlu dan selalu diberi label."],
  ["Mesin aturan", "Solver memilih metode (misalnya faktorisasi vs rumus ABC, substitusi vs integral parsial) secara deterministik dan mencatat aturan yang dipakai di setiap langkah."],
  ["Mesin langkah", "Langkah dibuat dari operasi yang benar-benar dilakukan. Tidak ada langkah yang dikarang untuk mengisi penjelasan."],
  ["Verifikasi", "Hasil diperiksa dengan cara independen: substitusi ke soal, turunan balik, kuadratur numerik, analisis dimensi, atau perhitungan ulang dengan rumus lain."],
];

const CHECKS = [
  ["Persamaan", "Setiap akar disubstitusikan ke persamaan awal (eksak bila mungkin). Akar yang melanggar domain (penyebut nol, logaritma bilangan non-positif) dibuang dengan alasan."],
  ["Integral tak tentu", "Antiturunan diturunkan kembali dan dibandingkan dengan integran."],
  ["Integral tentu", "Nilai dari Teorema Dasar Kalkulus dibandingkan dengan kuadratur adaptif Gauss–Kronrod."],
  ["Turunan", "Dibandingkan dengan turunan numerik (ekstrapolasi Richardson) di beberapa titik."],
  ["Limit", "Fungsi dievaluasi pada barisan titik yang mendekati titik tujuan dari kedua sisi."],
  ["Matriks", "Invers diperiksa dengan A·A⁻¹ = I; vektor eigen dengan A·v = λv; sistem linear dengan substitusi."],
  ["Rumus sains", "Analisis dimensi rumus dan hasil, lalu substitusi balik nilai yang diperoleh."],
  ["Notasi sigma", "Rumus tertutup dibuktikan dengan induksi matematika secara simbolik."],
];

export default function TentangPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">Metodologi, akurasi & batasan</h1>
        <p className="text-muted">
          {SITE.name} adalah kalkulator matematika dan sains yang menempatkan <strong className="text-text">ketepatan di atas segalanya</strong>. Semua perhitungan inti dilakukan oleh mesin matematika deterministik yang berjalan di peramban Anda (Web Worker). Tidak ada model bahasa (AI generatif) yang dipakai untuk menghitung atau membuat langkah.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-text">Alur perhitungan</h2>
        <ol className="space-y-3">
          {PIPELINE.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-contrast">{i + 1}</span>
              <div>
                <h3 className="font-medium text-text">{t}</h3>
                <p className="text-sm leading-relaxed text-muted">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-text">Status verifikasi</h2>
        <p className="text-sm text-muted">Setiap hasil membawa status yang menjelaskan seberapa kuat hasil itu diperiksa:</p>
        <ul className="space-y-2 text-sm">
          <li className="flex flex-wrap items-center gap-2">
            <VerificationBadge status="verified" /> <span className="text-muted">pemeriksaan eksak/simbolik lolos.</span>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <VerificationBadge status="verified-numeric" /> <span className="text-muted">pemeriksaan numerik lolos dengan toleransi yang dinyatakan (misalnya galat relatif &lt; 10⁻⁹).</span>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <VerificationBadge status="partial" /> <span className="text-muted">sebagian pemeriksaan lolos; perhatikan catatan.</span>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <VerificationBadge status="unverified" /> <span className="text-muted">tidak ada metode verifikasi independen; hasil ditampilkan dengan peringatan.</span>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <VerificationBadge status="failed" /> <span className="text-muted">pemeriksaan tidak cocok — hasil tidak boleh dipakai; hal ini selalu ditampilkan, tidak disembunyikan.</span>
          </li>
        </ul>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Metode verifikasi per jenis soal</caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">Jenis soal</th>
                <th scope="col" className="px-3 py-2 text-left">Cara verifikasi</th>
              </tr>
            </thead>
            <tbody>
              {CHECKS.map(([k, v]) => (
                <tr key={k} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium text-text">{k}</td>
                  <td className="px-3 py-2 text-muted">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-text">Angka, presisi, dan pembulatan</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>Aritmetika eksak: 0,1 + 0,2 = 3/10 tepat, bukan 0,30000000000000004.</li>
          <li>
            Bentuk eksak dipertahankan (misalnya <Tex tex="\tfrac{-3 \pm \sqrt{17}}{4}" /> atau <Tex tex="25\pi" />); hampiran desimal ditampilkan terpisah dengan tanda ≈.
          </li>
          <li>Hasil numerik (akar polinom derajat tinggi, distribusi kontinu, IRR) diberi label hampiran beserta metodenya.</li>
          <li>Pada kalkulator sains, hasil dibulatkan sesuai angka penting data masukan, dan nilai lengkapnya tetap ditampilkan.</li>
          <li>Konstanta fisika memakai CODATA 2018 dan definisi eksak SI 2019; massa atom memakai nilai standar IUPAC/CIAAW.</li>
          <li>Setiap perhitungan dibatasi waktu dan ukuran bilangan agar peramban tidak macet; jika batas tercapai, Anda mendapat pesan yang jelas.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-text">Tingkat penjelasan</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {LEVELS.map((l) => (
            <div key={l.id} className="rounded-lg border border-border p-3">
              <dt className="font-medium text-text">{l.label}</dt>
              <dd className="text-muted">{l.description}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted">Tingkat penjelasan hanya mengubah banyaknya detail yang ditampilkan — perhitungannya tetap sama.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-text">Batasan yang perlu diketahui</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>Integral simbolik memakai tabel, substitusi, integral parsial, dan pecahan parsial; integral yang tidak memiliki bentuk elementer (misalnya ∫e^(−x²) dx) atau butuh teknik lanjut dilaporkan sebagai belum didukung — untuk integral tentu, nilai numeriknya tetap dihitung bila memungkinkan.</li>
          <li>Persamaan polinom derajat ≥ 3 yang tidak memiliki akar rasional diselesaikan secara numerik (akar diberi label hampiran).</li>
          <li>Persamaan diferensial, integral lipat, dan grafik 3D belum tersedia (lihat peta jalan di dokumentasi proyek).</li>
          <li>Kuartil memakai aturan letak p(n + 1); perangkat lunak lain dapat memakai konvensi berbeda.</li>
          <li>Kalkulator keuangan memakai model matematis standar; ketentuan bank/lembaga (biaya, pembulatan internal, asuransi) dapat membuat angka resmi sedikit berbeda.</li>
          <li>Hasil adalah alat bantu belajar dan perhitungan; untuk keputusan penting (medis, rekayasa struktur, keuangan), selalu konfirmasi dengan sumber profesional.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-text">Privasi</h2>
        <p className="text-sm text-muted">Soal yang Anda ketik diproses di perangkat Anda sendiri. Riwayat dan favorit tersimpan di localStorage peramban dan tidak dikirim ke server. Tautan “Bagikan” hanya berisi teks soal di alamat URL.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-text">Rujukan utama</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>J. S. Cohen, <em>Computer Algebra and Symbolic Computation</em> — penyederhanaan otomatis dan manipulasi polinom.</li>
          <li>OpenStax: College Algebra, Calculus Vol. 1–3, Introductory Statistics, University Physics Vol. 1–3, Chemistry 2e, Astronomy 2e.</li>
          <li>R. L. Burden & J. D. Faires, <em>Numerical Analysis</em>; W. H. Press dkk., <em>Numerical Recipes</em>.</li>
          <li>CODATA 2018 (NIST), SI Brochure edisi ke-9 (BIPM), NIST SP 811, IUPAC/CIAAW Standard Atomic Weights.</li>
          <li>G. Strang, <em>Introduction to Linear Algebra</em>; K. H. Rosen, <em>Discrete Mathematics and Its Applications</em>.</li>
        </ul>
        <p className="text-sm text-muted">
          Menemukan hasil yang salah? Itu kami anggap bug prioritas tertinggi — setiap perbaikan disertai tes regresi. Versi mesin: {SITE.version} ({SITE.commit}). Lihat juga <Link href="/panduan" className="text-accent underline">panduan penulisan soal</Link>.
        </p>
      </section>
    </div>
  );
}
