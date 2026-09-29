# Mesin matematika

Dokumen ini menjelaskan desain `src/engine`. Seluruh mesin ditulis dalam TypeScript tanpa dependensi pihak ketiga dan tidak memakai model bahasa (LLM) untuk perhitungan maupun pembuatan langkah.

## Alur

```
teks ─► lexer ─► splitWords ─► parser ─► pohon sintaks (SNode)
                                            │  (mempertahankan notasi pengguna;
                                            │   dipakai untuk "Dibaca sebagai")
                                            ▼
                                 convert ─► ekspresi kanonik (Expr)
                                            │
                        router (pemilih metode deterministik)
                                            │
       ┌──────────┬──────────┬──────────┬───┴──────┬──────────┬──────────┐
    aritmetika  aljabar  persamaan  kalkulus   matriks   statistik  …solver lain
       └──────────┴──────────┴──────────┴───┬──────┴──────────┴──────────┘
                                            ▼
                        Solution (jawaban + langkah + verifikasi)
```

## Representasi

- **Bilangan**: `core/rational.ts` — pecahan eksak `num/den` di atas BigInt, selalu dalam bentuk paling sederhana. Bilangan desimal yang diketik (mis. `0.1`) langsung menjadi pecahan eksak (`1/10`).
- **Ekspresi**: `expr/types.ts` — pohon kanonik: `num`, `sym`, `add`, `mul`, `pow`, `fn`. Konstruktor pintar di `expr/simplify.ts` menerapkan **penyederhanaan otomatis** (Cohen, _Computer Algebra and Symbolic Computation_): penjumlahan/perkalian datar dan terurut, penggabungan suku sejenis, aturan pangkat, akar numerik eksak (√72 = 6√2), nilai trigonometri eksak pada kelipatan π/12, pasangan invers ln/exp.
- **Sintaks**: `parse/syntax.ts` — pohon yang mempertahankan notasi pengguna (pengurangan, pembagian, perkalian implisit, operator kalkulus) untuk ditampilkan kembali apa adanya.

### Konvensi

- Simbol dianggap **bilangan real** kecuali `i` (satuan imajiner), `pi`, dan `e`.
- Untuk basis negatif dan eksponen rasional p/q dengan q ganjil, dipakai akar real: `(-8)^(1/3) = -2`.
- Pangkat kompleks memakai **cabang utama**: `z^w = e^(w·Log z)`, `Log z = ln|z| + i·Arg z`, `Arg z ∈ (−π, π]`.
- Sudut tanpa `°` adalah radian.
- `1/2x` dibaca `(1/2)·x`, `sin x^2` dibaca `sin(x²)`; setiap tafsir ambigu menghasilkan **peringatan** yang ditampilkan.
- Huruf berdampingan dikalikan (`xy = x·y`), tetapi kata ≥ 4 huruf yang langsung diikuti `(` dan bukan fungsi yang dikenal ditolak dengan saran (`sine(x)` → “mungkin maksud Anda sin”).

## Parser

Recursive descent dengan _precedence climbing_: relasi < `+ −` < `× ÷` & perkalian implisit < unary minus < `^` (asosiatif kanan) < postfix (`! % ° '`) < primer. Mendukung:

- fungsi (sin … atanh, ln, log basis apa pun, sqrt/cbrt/root, abs, faktorial, binomial, gcd/lcm, …) dan alias Indonesia (`fpb`, `kpk`, `tg`, …);
- notasi kalkulus: `d/dx f`, `d^2/dx^2 f`, `f'`, `∫ f dx`, `∫_a^b f dx`, `integral from a to b of f`, `integral f dari a sampai b`, `lim x->a f`, `lim x menuju a f`, `lim_{x→a^+}`;
- matriks `[[1,2],[3,4]]`, sistem `persamaan; persamaan`, data `1, 2, 3`, pasangan `(x, y)`;
- kata perintah di awal soal (router): `sederhanakan`, `jabarkan`, `faktorkan`, `turunan`, `integralkan`, `titik kritis`, `deret taylor`, `apakah prima`, `statistik`, `selesaikan`, …, serta akhiran `untuk y`.

Kesalahan sintaks menghasilkan `MathError` terstruktur dengan jenis, pesan, penyebab, saran, dan rentang posisi di input asli (rentang disesuaikan bila kata perintah di awal dibuang).

## Solver dan metode

| Modul                     | Metode                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `solvers/arithmetic.ts`   | Urutan operasi (KaBaTaKu) langkah demi langkah, pecahan eksak, desimal berulang, pecahan campuran                                                                                                                                                                                                                                                                        |
| `solvers/algebra.ts`      | Penyederhanaan (termasuk pecahan aljabar dengan syarat pencoretan), penjabaran, substitusi nilai                                                                                                                                                                                                                                                                         |
| `solvers/factor.ts`       | FPB, teorema akar rasional + pembagian sintetik, metode AC, selisih kuadrat, jumlah/selisih pangkat tiga                                                                                                                                                                                                                                                                 |
| `solvers/equation.ts`     | Linear (keseimbangan), kuadrat (faktorisasi / rumus ABC / melengkapkan kuadrat sebagai metode lain), bikuadrat & substitusi, polinom (akar rasional + Durand–Kerner), rasional (KPK penyebut + pemeriksaan domain), akar (kuadratkan + buang akar palsu), nilai mutlak, isolasi dengan operasi invers (termasuk keluarga solusi periodik trigonometri), fallback numerik |
| `solvers/inequality.ts`   | Linear, garis bilangan/tabel tanda untuk polinom & rasional, notasi interval                                                                                                                                                                                                                                                                                             |
| `solvers/system.ts`       | Gauss–Jordan (dengan operasi baris), eliminasi & Cramer sebagai metode lain, sistem nonlinear sederhana                                                                                                                                                                                                                                                                  |
| `solvers/complex.ts`      | Bentuk a + bi (rumus Euler, cabang utama), modulus, argumen, sekawan, bentuk polar                                                                                                                                                                                                                                                                                       |
| `solvers/numbertheory.ts` | Euclid, faktorisasi prima (pembagian percobaan + Pollard rho/Brent), Miller–Rabin deterministik (< 3,3·10²⁴), invers & pangkat modular                                                                                                                                                                                                                                   |
| `solvers/sum.ts`          | Notasi sigma: jumlah eksak, rumus tertutup polinom (interpolasi Lagrange) & geometri **dibuktikan dengan induksi**, deret tak hingga geometri, uji divergensi                                                                                                                                                                                                            |
| `calculus/derivative.ts`  | Aturan dasar, perkalian, pembagian, rantai, turunan logaritmik untuk `f^g`                                                                                                                                                                                                                                                                                               |
| `calculus/integral.ts`    | Tabel, linearitas, substitusi-u, integral parsial (LIATE), pecahan parsial                                                                                                                                                                                                                                                                                               |
| `calculus/limit.ts`       | Substitusi langsung, aljabar limit di bilangan real diperluas, faktorisasi & pencoretan, L'Hôpital (dengan deteksi siklus), limit baku                                                                                                                                                                                                                                   |
| `linalg/*`                | Determinan (eliminasi & kofaktor), invers, RREF, rank, trace, eigen (polinom karakteristik), operasi vektor                                                                                                                                                                                                                                                              |
| `stats/*`                 | Deskriptif & regresi eksak; binomial/Poisson/geometrik eksak; normal, t, χ², F melalui fungsi khusus (erf, gamma & beta tak lengkap)                                                                                                                                                                                                                                     |
| `units/*`                 | Vektor dimensi 8-komponen, faktor eksak, prefiks SI & biner, suhu afin                                                                                                                                                                                                                                                                                                   |
| `science/*`               | Registri 113 rumus, konstanta CODATA 2018, penyusunan ulang simbolik, konversi ke SI, analisis dimensi, batasan fisis, angka penting                                                                                                                                                                                                                                     |
| `chemistry/*`             | Parser rumus (kurung, hidrat, muatan), massa atom IUPAC/CIAAW, penyetaraan melalui ruang nol eksak, stoikiometri, pH dengan neraca muatan                                                                                                                                                                                                                                |
| `finance/solvers.ts`      | Aritmetika rasional eksak untuk uang, jadwal angsuran, NPV/IRR (Brent)                                                                                                                                                                                                                                                                                                   |
| `cs/solvers.ts`           | BigInt untuk basis/komplemen/bitwise, subnet IPv4, Base64 UTF-8, Quine–McCluskey                                                                                                                                                                                                                                                                                         |
| `verify-work.ts`          | Pemeriksaan pekerjaan pengguna per baris, termasuk kesalahan yang terbawa                                                                                                                                                                                                                                                                                                |

## Verifikasi

Setiap solver menghasilkan `VerificationCheck` yang independen dari cara hasil diperoleh:

- **Kesetaraan** (`expr/equivalence.ts`): pertama secara simbolik (selisih disederhanakan menjadi 0); bila tidak dapat dipastikan, secara numerik dengan titik uji acak **deterministik** (PRNG ber-seed tetap, rentang [−3, 3] dan [0,1, 3], hingga 12 titik valid, toleransi relatif 10⁻⁸). Hasil numerik diberi status `verified-numeric`, bukan `verified`.
- **Persamaan**: substitusi setiap akar ke persamaan awal (eksak bila mungkin), pemeriksaan domain.
- **Integral**: turunan balik; integral tentu dibandingkan dengan kuadratur Gauss–Kronrod adaptif (toleransi 10⁻¹¹).
- **Turunan**: turunan numerik (ekstrapolasi Richardson) di beberapa titik.
- **Limit**: barisan titik yang mendekati target dari kedua sisi.
- **Matriks**: A·A⁻¹ = I, A·v = λv, substitusi solusi sistem, determinan dengan metode kedua (kofaktor).
- **Rumus sains**: analisis dimensi rumus dan hasil susunan ulang, substitusi balik.
- **Notasi sigma**: basis dan langkah induksi diperiksa secara simbolik.
- **Bilangan kompleks**: bentuk a + bi harus cocok dengan evaluasi numerik kompleks independen; bila tidak, solver beralih ke jawaban numerik berlabel.

Status agregat: semua lolos → `verified` (atau `verified-numeric` bila semuanya numerik); sebagian → `partial`; tidak ada pemeriksaan → `unverified`; semua gagal → `failed`. Status selalu ditampilkan, tidak pernah disembunyikan.

## Metode numerik (`numeric/methods.ts`)

Bisection, Newton, secant, Brent (toleransi bawaan 10⁻¹²), pencarian akar real dengan pemindaian tanda, Simpson adaptif (10⁻¹⁰), Gauss–Kronrod 7–15 adaptif (10⁻¹¹), turunan Richardson, Runge–Kutta 4. Setiap hasil membawa jumlah iterasi dan status konvergensi.

## Batas komputasi (`core/budget.ts`)

| Batas              | Nilai                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| Waktu per soal     | 6 s (solver), 8 s (cek pekerjaan), 0,5 s (pratinjau); worker dihentikan pada 15 s |
| Operasi (“tick”)   | 50 juta                                                                           |
| Ukuran BigInt      | 200.000 bit                                                                       |
| Jumlah suku        | 5.000                                                                             |
| Kedalaman ekspresi | 200                                                                               |
| Panjang input      | 2.000 karakter                                                                    |

Melewati batas menghasilkan kesalahan `timeout`/`limit-exceeded` yang jelas, bukan hasil parsial diam-diam.

## Menambah kemampuan

- **Rumus sains baru**: tambahkan entri di `science/formulas.ts` (persamaan, variabel + satuan + batasan, contoh, rujukan). Tes `science/formulas.test.ts` otomatis memeriksa parse, konsistensi dimensi, dan contoh yang terverifikasi; halaman kalkulatornya otomatis dibuat.
- **Kalkulator terstruktur baru**: tambahkan `ToolDef` di `engine/forms.ts` lalu entri `tool(...)` di `lib/calculators.ts`.
- **Preset solver**: tambahkan `math(...)` di `lib/calculators.ts`; setiap contoh diuji harus terselesaikan dan terverifikasi penuh.
- **Bug matematika**: perbaiki di mesin dan **selalu** tambahkan tes regresi (lihat blok `regressions` di `router.test.ts`).
