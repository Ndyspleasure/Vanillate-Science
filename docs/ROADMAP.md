# Status & peta jalan

## Status saat ini (v1.0)

Fase 1–3 dari brief produk sudah tersedia: parser, AST, inti simbolik & numerik, mesin satuan, solver persamaan, mesin langkah, verifikasi, UI kalkulator; matematika inti (aljabar, persamaan, trigonometri, matriks, turunan, integral, limit, grafik); sains dasar (fisika, kimia, statistik/peluang, satuan & dimensi). Sebagian Fase 4 juga tersedia (statistik inferensial, metode numerik terverifikasi, aljabar linear: eigen/RREF/rank).

Jaminan kualitas: 540+ tes unit/property/regresi, kontrak registri (setiap contoh di setiap halaman terverifikasi penuh), 34 tes end-to-end, audit aksesibilitas axe WCAG 2.1 AA pada mode terang dan gelap.

## Batasan yang diketahui

- Integral simbolik: belum ada substitusi trigonometri, reduksi rekursif umum, atau algoritma Risch. Integral yang tidak ditemukan antiturunannya dilaporkan jujur; untuk integral tentu nilai numeriknya tetap dihitung.
- Polinom derajat 3–4 umum tanpa akar rasional diselesaikan numerik (kecuali bentuk khusus seperti xⁿ = c dan bikuadrat); belum ada rumus Cardano/Ferrari eksak.
- Sistem nonlinear hanya 2×2 dengan satu persamaan linear dalam salah satu variabel.
- Belum ada persamaan diferensial, integral lipat, grafik 3D, medan vektor, dan kontur.
- Notasi sigma: bentuk tertutup untuk suku polinom dan geometri; deret tak hingga hanya geometri + uji divergensi.
- Satu bahasa antarmuka (Indonesia).

## Rencana berikutnya

1. **Kalkulus lanjut**: persamaan diferensial biasa orde 1 (terpisah, linear, eksak) dan orde 2 koefisien konstan dengan verifikasi substitusi; solusi numerik RK45 dengan grafik; integral lipat dua pada daerah persegi.
2. **Aljabar**: rumus Cardano untuk kubik dengan verifikasi, pecahan parsial dengan faktor kuadrat berulang, substitusi trigonometri pada integral.
3. **Grafik**: grafik 3D permukaan, kontur, medan vektor; grafik mengikuti langkah (misalnya titik kritis dan garis singgung).
4. **Statistik**: uji nonparametrik (Mann–Whitney, Wilcoxon), korelasi Spearman, ANOVA dua arah, regresi berganda.
5. **Kimia & teknik**: penyetaraan redoks setengah reaksi, stoikiometri gas, impedansi kompleks rangkaian RLC, defleksi balok.
6. **Pembelajaran**: halaman pelajaran dasar per topik yang ditautkan dari setiap kalkulator; latihan dengan pemeriksaan otomatis memakai mesin “Cek Pekerjaan”.
7. **Platform**: PWA/offline (service worker), bahasa Inggris, sinkronisasi riwayat opsional (login tidak wajib), masukan tulisan tangan/foto (dengan konfirmasi pengguna sebelum dihitung).
8. **Kinerja**: memuat KaTeX secara bertahap, memecah bundle worker per domain.

Setiap penambahan mengikuti aturan proyek: aturan & solver di mesin (bukan halaman khusus), verifikasi independen, tes regresi, dan dokumentasi pada PR yang sama.
