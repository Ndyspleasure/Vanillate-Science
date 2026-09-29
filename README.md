# Vanillate Science

Kalkulator matematika dan sains berbahasa Indonesia dengan **langkah penyelesaian yang benar-benar dihitung** dan **verifikasi independen** untuk setiap hasil. Seluruh perhitungan inti dilakukan oleh mesin matematika deterministik buatan sendiri (TypeScript, aritmetika rasional eksak BigInt) yang berjalan di peramban — tanpa AI generatif.

> Masukkan soalnya. Sistem menghitung, menunjukkan caranya, menjelaskan alasannya, dan memverifikasi hasilnya.

## Fitur

| Area          | Isi                                                                                                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Solver bebas  | Aritmetika & pecahan eksak, bentuk akar, trigonometri eksak, logaritma, penyederhanaan/penjabaran/faktorisasi, persamaan (linear, kuadrat, polinom, eksponen, logaritma, trigonometri, rasional, akar, nilai mutlak), pertidaksamaan, sistem persamaan, bilangan kompleks, matriks & vektor, teori bilangan, notasi sigma |
| Kalkulus      | Turunan (termasuk parsial, orde tinggi, implisit), integral tak tentu/tentu/tak wajar, limit (termasuk sepihak & di tak hingga), deret Taylor, titik ekstrem                                                                                                                                                              |
| Sains         | 113 rumus fisika, kimia, astronomi, teknik, dan geometri — dapat diselesaikan untuk variabel mana pun, dengan satuan, analisis dimensi, dan angka penting                                                                                                                                                                 |
| Kimia         | Massa molar, penyetaraan reaksi (ruang nol eksak), rumus empiris/molekul, stoikiometri & pereaksi pembatas, pH asam/basa kuat & lemah, tabel periodik                                                                                                                                                                     |
| Statistika    | Statistik deskriptif, regresi, binomial, Poisson, normal, invers normal, uji t (1 & 2 sampel), interval kepercayaan, uji proporsi, chi-kuadrat, ANOVA, geometrik, eksponensial                                                                                                                                            |
| Keuangan      | Bunga sederhana & majemuk, cicilan (anuitas/efektif/flat) dengan tabel angsuran, NPV, IRR, ROI, BEP, depresiasi, bunga riil, anuitas                                                                                                                                                                                      |
| Ilmu komputer | Konversi basis (termasuk pecahan), komplemen dua, bitwise, subnet IPv4, Base64, aljabar Boolean (Quine–McCluskey)                                                                                                                                                                                                         |
| Satuan        | Ratusan satuan dengan faktor eksak, satuan gabungan, suhu afin, penolakan dimensi yang tidak cocok                                                                                                                                                                                                                        |
| Pembelajaran  | Tab Jawaban · Langkah · Penjelasan · Verifikasi · Grafik · Metode Lain, lima tingkat penjelasan (Dasar → Expert), **Cek Pekerjaan Saya** (menemukan baris pertama yang salah dan kesalahan yang terbawa)                                                                                                                  |
| Lainnya       | Kalkulator grafik (fungsi, polar, parametrik), riwayat & favorit lokal, tautan berbagi, ekspor Markdown/LaTeX, cetak, mode gelap, aksesibel (WCAG 2.1 AA diuji dengan axe), 204 halaman kalkulator statis untuk SEO                                                                                                       |

## Menjalankan secara lokal

Prasyarat: Node.js ≥ 20.9 (disarankan 22).

```bash
npm install
npm run dev            # http://localhost:3000
```

Perintah lain:

```bash
npm run lint           # ESLint
npm run format:check   # Prettier
npm run typecheck      # next typegen + tsc
npm test               # unit, property-based, dan regression test (Vitest)
npm run build          # build produksi (mem-prerender semua halaman kalkulator)
npm run test:e2e       # Playwright end-to-end + audit aksesibilitas (butuh build)
npm run check          # lint + typecheck + test + build
```

Untuk e2e pertama kali: `npx playwright install chromium`.

## Deploy ke Vercel

Proyek ini siap deploy tanpa konfigurasi tambahan. Ringkasnya: impor repository di Vercel → framework **Next.js** terdeteksi otomatis → Deploy. Detail, variabel lingkungan opsional, dan pemeriksaan pasca-deploy ada di [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Dokumentasi

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — struktur aplikasi, alur data, worker, halaman statis, keamanan.
- [`docs/ENGINE.md`](docs/ENGINE.md) — desain mesin matematika: representasi, penyederhanaan, solver, verifikasi, presisi, konvensi.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — deploy ke Vercel dan operasional.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — batasan saat ini dan rencana berikutnya.
- [`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md) — brief produk asli.
- Di dalam aplikasi: `/panduan` (cara menulis soal) dan `/tentang` (metodologi & batasan).

## Struktur singkat

```
src/
  engine/        mesin matematika (tanpa dependensi UI) + tes
  workers/       Web Worker yang menjalankan mesin
  app/           halaman Next.js (App Router)
  components/    komponen UI (solver, hasil, grafik, kalkulator)
  lib/           registri kalkulator, klien worker, penyimpanan lokal, ekspor
tests/e2e/       Playwright + axe
```

## Lisensi & kontribusi

Setiap bug matematika diperlakukan sebagai prioritas tertinggi dan harus disertai tes regresi. Lihat `CLAUDE.md` untuk aturan pengembangan proyek.
