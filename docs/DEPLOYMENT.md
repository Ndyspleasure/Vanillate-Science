# Deploy ke Vercel

Aplikasi ini adalah proyek Next.js standar tanpa database, tanpa layanan eksternal, dan tanpa rahasia. Semua halaman di-prerender saat build; perhitungan berjalan di peramban pengguna.

## Langkah pertama kali

1. Pastikan kode sudah ada di branch utama repository GitHub (`main`).
2. Buka <https://vercel.com/new> → **Import Git Repository** → pilih repository ini.
3. Vercel mendeteksi **Framework Preset: Next.js**. Biarkan pengaturan bawaan:
   - Build Command: `next build` (atau `npm run build`)
   - Output Directory: bawaan Next.js
   - Install Command: bawaan (`npm install` / `npm ci`)
4. (Disarankan) **Settings → Build and Deployment → Node.js Version: 22.x** (minimal 20.9, sesuai `engines` di `package.json`).
5. Klik **Deploy**. Build memakan waktu sekitar 1–2 menit dan mem-prerender ±230 halaman.

## Variabel lingkungan (semuanya opsional)

| Nama                      | Kegunaan                                                                                                                            | Bawaan                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`    | URL kanonis untuk metadata, sitemap, robots, Open Graph, JSON-LD. Isi dengan domain final, misalnya `https://science.vanillate.id`. | `https://$VERCEL_PROJECT_PRODUCTION_URL` (otomatis dari Vercel), lalu `http://localhost:3000` |
| `NEXT_PUBLIC_APP_VERSION` | Versi yang ditampilkan di footer dan `/api/health`                                                                                  | `1.0.0`                                                                                       |

`VERCEL_GIT_COMMIT_SHA` dan `VERCEL_PROJECT_PRODUCTION_URL` dibaca otomatis (System Environment Variables Vercel aktif secara bawaan). Tidak ada API key atau secret yang perlu dimasukkan.

> Setelah menambahkan domain kustom, set `NEXT_PUBLIC_SITE_URL` lalu **Redeploy** agar URL kanonis dan sitemap memakai domain tersebut.

## Domain kustom

**Settings → Domains → Add** lalu ikuti petunjuk DNS dari Vercel (A/CNAME). HTTPS diterbitkan otomatis. Header HSTS sudah dikirim oleh aplikasi.

## Pemeriksaan setelah deploy

1. `https://<domain>/api/health` → `{"status":"ok","engine":"ok",…}` (mesin menyelesaikan soal uji dan memeriksa jawabannya).
2. Buka beranda, ketik `x^2 - 5x + 6 = 0`, tekan Enter → jawaban 2 dan 3 dengan lencana **Terverifikasi**.
3. `https://<domain>/sitemap.xml` berisi daftar halaman kalkulator dengan domain yang benar.
4. Opsional — jalankan seluruh tes end-to-end terhadap deployment:

   ```bash
   npx playwright install chromium
   E2E_BASE_URL=https://<domain> npx playwright test
   ```

## Preview dan rollback

- Setiap Pull Request mendapat **Preview Deployment** otomatis. CSP mengizinkan `vercel.live` agar toolbar komentar Vercel tetap berfungsi di preview.
- Rollback: **Deployments → pilih deployment lama → Instant Rollback / Promote to Production**.

## Catatan operasional

- **Caching**: halaman statis disajikan dari CDN Vercel; setiap deploy membangun ulang semuanya. `/api/health` tidak di-cache.
- **Keamanan**: header (CSP, HSTS, X-Frame-Options, dll.) diatur di `next.config.ts`. Jika menambahkan layanan pihak ketiga (analytics, font eksternal), perbarui CSP di file tersebut. Vercel Web Analytics memakai path satu origin (`/_vercel/insights`) sehingga kompatibel dengan CSP saat ini.
- **Privasi**: server tidak menerima isi soal; riwayat/favorit tersimpan di localStorage pengguna.
- **Biaya**: seluruh situs statis + satu fungsi ringan (`/api/health`), cocok untuk paket Hobby.

## Deploy di luar Vercel (opsional)

```bash
npm ci
npm run build
npm run start   # PORT=3000 bawaan
```

Dapat dijalankan di platform Node.js mana pun (Docker, VPS). Set `NEXT_PUBLIC_SITE_URL` saat build.

## Domain produksi

Situs produksi: **https://science.vanillate.id**. `next.config.ts` mengalihkan (308, path & query dipertahankan) semua permintaan ke `vanillate-science.vercel.app` menuju domain tersebut; URL preview deployment tidak terpengaruh.
