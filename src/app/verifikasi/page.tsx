import type { Metadata } from "next";
import { CheckWorkApp } from "@/components/checkwork/CheckWorkApp";

export const metadata: Metadata = {
  title: "Cek Pekerjaan Saya — Temukan Langkah yang Salah",
  description: "Tempel langkah pengerjaan Anda dan sistem akan memeriksa setiap baris: persamaan, penyederhanaan, turunan, dan integral. Temukan baris pertama yang salah beserta alasannya.",
  alternates: { canonical: "/verifikasi" },
};

export default function VerifikasiPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">Cek pekerjaan saya</h1>
        <p className="text-muted">Tulis soal dan langkah-langkah pengerjaan Anda. Setiap baris diperiksa terhadap soal awal: untuk persamaan, himpunan penyelesaiannya harus tetap sama; untuk penyederhanaan, nilainya harus tetap setara; untuk turunan dan integral, hasilnya dibandingkan dengan jawaban yang terverifikasi.</p>
      </header>
      <CheckWorkApp />
      <section className="prose-edu text-sm text-muted">
        <h2 className="text-base font-semibold text-text">Kesalahan yang dapat dideteksi</h2>
        <ul>
          <li>Salah menjabarkan kurung atau salah tanda saat pindah ruas.</li>
          <li>Kehilangan akar, misalnya membagi kedua ruas dengan x yang bisa bernilai nol.</li>
          <li>Akar palsu akibat mengkuadratkan kedua ruas.</li>
          <li>Turunan atau antiturunan yang tidak sesuai.</li>
          <li>Penyederhanaan yang mengubah nilai ekspresi (disertai contoh nilai pembeda).</li>
        </ul>
      </section>
    </div>
  );
}
