# Arsitektur

## Gambaran umum

```
                 ┌────────────── Peramban ───────────────────────────────┐
  pengguna ──►   │  React UI (Next.js App Router, client components)      │
                 │     │  permintaan data murni (EngineRequest)           │
                 │     ▼                                                  │
                 │  lib/engine-client.ts ──postMessage──► Web Worker      │
                 │     ▲    (timeout, batal, fallback)     workers/engine │
                 │     │                                   .worker.ts     │
                 │     └────────── EngineResponse ◄─── engine/api.ts      │
                 └────────────────────────────────────────────────────────┘

  build (Vercel/`next build`): server components memanggil engine/api.ts
  langsung untuk mem-prerender contoh soal di 204 halaman kalkulator.
```

Prinsip utama:

1. **Mesin terpisah dari UI.** `src/engine` tidak mengimpor React/Next; semua keluaran berupa data polos (`Solution`, `Step`, `Verification`) sehingga dapat melintasi batas worker dan diserialisasi.
2. **Perhitungan di perangkat pengguna.** Soal tidak dikirim ke server. Worker mencegah UI macet; permintaan yang melewati batas waktu (15 detik) menghentikan worker lalu membuat yang baru. Di dalam mesin ada anggaran waktu/ukuran tersendiri (`core/budget.ts`).
3. **Halaman statis.** Semua halaman di-prerender (SSG). Satu-satunya rute dinamis adalah `/api/health`.
4. **Satu registri, banyak halaman.** Halaman kalkulator dibangkitkan dari `src/lib/calculators.ts` (preset solver, rumus sains, alat terstruktur, konversi satuan, tabel periodik) — bukan halaman yang ditulis satu per satu.

## Kontrak data

`src/engine/steps/types.ts` mendefinisikan `Solution`:

- `answers[]` — jawaban (LaTeX + teks + hampiran desimal bila relevan; `latex` sudah memuat satuan, `unit` hanya metadata).
- `steps[]` — langkah yang benar-benar dilakukan (`title`, `before`, `after`, `rule`, `reason`, `detail`, `check`, `substeps`).
- `verification` — status (`verified`, `verified-numeric`, `partial`, `unverified`, `failed`) + daftar pemeriksaan.
- `alternatives[]` — metode lain yang dihitung sungguhan.
- `plot`, `tables`, `notes`, `assumptions`, `references`, `meta`.

**Konvensi teks:** matematika di dalam teks polos (`title`, `reason`, `detail`, deskripsi pemeriksaan) ditulis sebagai `$…$`; UI merendernya dengan KaTeX (`components/MathText.tsx`). Tes `src/lib/calculators.test.ts` gagal bila LaTeX mentah bocor di luar `$…$`.

## API mesin (`src/engine/api.ts`)

`handleRequest(req)` tidak pernah melempar exception. Jenis permintaan:

| `type`       | Fungsi                                                                                  |
| ------------ | --------------------------------------------------------------------------------------- |
| `solve`      | Soal bebas melalui router (`engine/router.ts`)                                          |
| `preview`    | Hanya mengurai: pratinjau “Dibaca sebagai” + peringatan tafsir                          |
| `formula`    | Rumus sains dari registri, dengan satuan                                                |
| `units`      | Konversi satuan                                                                         |
| `tool`       | Formulir terstruktur dari `engine/forms.ts` (kimia, statistik, keuangan, ilmu komputer) |
| `check-work` | “Cek Pekerjaan Saya” baris demi baris                                                   |
| `sample`     | Sampling titik untuk grafik (fungsi, polar, parametrik)                                 |

## UI

- `components/solver/SolverApp.tsx` — input dengan pratinjau langsung, keyboard matematika, mode, contoh, tautan `?q=`.
- `components/solution/*` — tampilan hasil (tab ARIA, tingkat penjelasan, verifikasi, ekspor, favorit). `WorkedExample` adalah versi server-rendered untuk halaman kalkulator.
- `components/plot/PlotView.tsx` — plotter SVG sendiri: sampling di worker, pemisahan asimtot, geser/zoom, keyboard.
- `components/calculators/*` — kalkulator rumus, formulir alat, konverter satuan, tabel periodik, pencarian.
- `lib/storage.ts` — riwayat, favorit, preferensi (localStorage + `useSyncExternalStore`).

## Rute

| Rute                                                                                                   | Isi                                                                         |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `/`                                                                                                    | Solver utama                                                                |
| `/calculator`, `/calculator/[category]`, `/calculator/[category]/[slug]`                               | Indeks, kategori, dan 204 halaman kalkulator (SSG, `dynamicParams = false`) |
| `/grafik`                                                                                              | Kalkulator grafik                                                           |
| `/verifikasi`                                                                                          | Cek Pekerjaan Saya                                                          |
| `/riwayat`                                                                                             | Riwayat & favorit (noindex)                                                 |
| `/panduan`, `/tentang`                                                                                 | Panduan penulisan soal; metodologi & batasan                                |
| `/api/health`                                                                                          | Self-test mesin (JSON, `no-store`)                                          |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, `/opengraph-image`, `/icon.svg`, `/apple-icon` | Metadata                                                                    |

## SEO

Setiap halaman kalkulator memiliki judul & deskripsi spesifik, URL kanonis, breadcrumb, contoh soal lengkap dengan langkah yang dirender di server, FAQ, dan JSON-LD (`WebApplication`, `FAQPage`, `BreadcrumbList`). Beranda memiliki `WebSite` + `SearchAction` (`/?q=`).

## Keamanan

Header diatur di `next.config.ts`: CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, worker hanya dari origin sendiri), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP. Karena halaman statis, skrip inline Next.js memerlukan `'unsafe-inline'` (nonce hanya tersedia pada rendering dinamis). KaTeX dijalankan dengan `trust: false`; LaTeX hanya berasal dari printer mesin. JSON-LD di-escape (`<` → `<`). Tidak ada rahasia/kunci API yang dibutuhkan.

## Pengujian

| Lapisan                                                                                                      | Alat                | Lokasi                                          |
| ------------------------------------------------------------------------------------------------------------ | ------------------- | ----------------------------------------------- |
| Unit, property-based, regresi, golden bank                                                                   | Vitest + fast-check | `src/**/*.test.ts`                              |
| Kontrak registri (setiap contoh, setiap halaman, setiap formulir terverifikasi penuh; tidak ada LaTeX bocor) | Vitest              | `src/lib/*.test.ts`, `src/engine/forms.test.ts` |
| End-to-end, SEO, header keamanan, seluler                                                                    | Playwright          | `tests/e2e/*.spec.ts`                           |
| Aksesibilitas WCAG 2.1 AA (terang & gelap)                                                                   | axe-core            | `tests/e2e/a11y.spec.ts`                        |

CI (`.github/workflows/ci.yml`) menjalankan lint → format → typecheck → unit test → build → e2e.
