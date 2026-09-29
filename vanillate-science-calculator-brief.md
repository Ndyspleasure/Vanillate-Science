# Brief Proyek — Vanillate Science & Mathematics Calculator

## 1. Ringkasan Proyek

Membangun satu website kalkulator akademik terpadu yang tidak hanya menghitung dan menampilkan jawaban akhir, tetapi juga menjelaskan proses penyelesaian secara **step-by-step** agar pengguna memahami konsep, rumus, transformasi, dan alasan di balik setiap langkah.

Produk ini ditujukan untuk pelajar, mahasiswa, pengajar, dan pengguna tingkat lanjut. Cakupan harus dapat berkembang dari matematika dasar hingga matematika tingkat lanjut/ahli, serta mencakup fisika, kimia, statistika, ilmu komputer, engineering, ekonomi/keuangan, astronomi, konversi satuan, dan visualisasi.

> Prinsip utama: **bukan hanya memberi tahu jawaban, tetapi menunjukkan bagaimana jawaban diperoleh dan bagaimana memverifikasinya.**

---

## 2. Tujuan Utama

1. Menjadi satu platform kalkulator pembelajaran untuk berbagai bidang STEM dan bidang kuantitatif.
2. Memberikan hasil yang akurat, deterministik, dan dapat diverifikasi.
3. Menampilkan proses penyelesaian yang runtut, bukan hanya hasil akhir.
4. Memungkinkan pengguna memahami alasan penggunaan rumus atau metode tertentu.
5. Mendukung tingkat kesulitan dari dasar, sekolah, universitas, advanced, hingga expert.
6. Menyediakan fondasi engine yang modular sehingga kategori dan metode baru dapat ditambahkan tanpa membangun ulang seluruh sistem.
7. Mengutamakan pengalaman belajar, bukan sekadar pengalaman menghitung.

---

## 3. Prinsip Teknologi

### 3.1 Tidak menggunakan LLM

Sistem utama **tidak menggunakan LLM/generative AI** untuk menghasilkan jawaban matematika atau sains.

Seluruh reasoning utama harus dibangun menggunakan kode, algoritma, aturan matematika, symbolic manipulation, numerical methods, heuristic/method selection, dan verification engine.

LLM tidak menjadi dependensi untuk:
- perhitungan,
- pemilihan langkah utama,
- validasi hasil,
- derivasi simbolik,
- pembuktian deterministik,
- atau penyelesaian soal.

### 3.2 Deterministik

Untuk input yang sama, engine harus menghasilkan hasil dan jalur penyelesaian yang konsisten, kecuali pengguna secara eksplisit memilih metode alternatif.

### 3.3 Dapat diverifikasi

Sebisa mungkin setiap hasil memiliki mekanisme verifikasi internal. Contoh:
- persamaan diverifikasi dengan substitusi kembali,
- turunan dapat diverifikasi dengan diferensiasi,
- integral dapat diverifikasi dengan turunan balik,
- konversi satuan diverifikasi berdasarkan dimensi,
- hasil numerik dibandingkan dengan toleransi yang sesuai.

### 3.4 Modular

Engine harus dipisahkan dari UI sehingga satu engine dapat digunakan untuk banyak kalkulator dan mode pembelajaran.

---

# 4. Arsitektur Konseptual

```text
INPUT PENGGUNA
      ↓
Parser / Lexer
      ↓
Abstract Syntax Tree (AST) / Structured Representation
      ↓
Problem Analyzer
      ↓
Method Selector / Heuristic Engine
      ↓
Domain Engine
      │
      ├── Symbolic Algebra
      ├── Numerical Engine
      ├── Calculus Engine
      ├── Linear Algebra Engine
      ├── Statistics Engine
      ├── Physics Engine
      ├── Chemistry Engine
      ├── Unit & Dimension Engine
      └── Domain-specific engines lainnya
      ↓
Step Generator
      ↓
Step Verifier
      ↓
Explanation / Teaching Layer
      ↓
Result + Step-by-step + Verification + Visualization
```

---

# 5. Komponen Engine Utama

## 5.1 Parser / Lexer

Harus dapat memahami input seperti:

```text
2x + 5 = 15
sqrt(x^2 + 1)
sin(pi/4)
∫ x^2 dx
lim x->0 (sin(x)/x)
d/dx (x^2 sin(x))
det([[1,2],[3,4]])
```

Parser harus menangani:
- angka,
- variabel,
- operator,
- fungsi,
- konstanta,
- pecahan,
- akar,
- pangkat,
- integral,
- limit,
- turunan,
- matriks,
- vektor,
- satuan,
- simbol kimia/fisika jika diperlukan.

---

## 5.2 AST / Representasi Internal

Ekspresi harus diubah menjadi struktur yang mudah dimanipulasi.

Contoh:

```text
2x + 5

Add
├── Multiply
│   ├── 2
│   └── x
└── 5
```

Representasi ini menjadi fondasi symbolic manipulation, simplifikasi, derivasi, integrasi, dan step generation.

---

## 5.3 Symbolic Math Engine

Minimal mendukung:
- simplifikasi,
- ekspansi,
- faktorisasi,
- substitusi,
- pengumpulan suku,
- operasi pecahan,
- operasi pangkat,
- akar,
- logaritma,
- trigonometri,
- diferensiasi,
- integrasi,
- limit,
- persamaan,
- pertidaksamaan,
- polynomial manipulation.

---

## 5.4 Numerical Engine

Untuk perhitungan numerik dan masalah yang tidak atau belum dapat diselesaikan secara simbolik.

Metode dapat mencakup:
- Newton-Raphson,
- bisection,
- secant,
- numerical integration,
- numerical differentiation,
- interpolation,
- approximation,
- iterative methods,
- matrix numerical methods,
- ODE/PDE numerical methods sesuai tahap pengembangan.

Setiap hasil numerik harus memiliki:
- precision,
- tolerance,
- error estimate bila tersedia,
- status convergence/non-convergence.

---

# 6. Step-by-Step Reasoning Engine

Ini adalah fitur pembeda utama produk.

Setiap penyelesaian harus direpresentasikan sebagai rangkaian langkah terstruktur.

Contoh:

```text
Soal:
2x + 5 = 15

Langkah 1:
Kurangi kedua ruas dengan 5.

2x + 5 - 5 = 15 - 5
2x = 10

Langkah 2:
Bagi kedua ruas dengan 2.

2x / 2 = 10 / 2
x = 5

Verifikasi:
2(5) + 5 = 15
15 = 15 ✓
```

Setiap step idealnya memiliki field konseptual:

```text
input expression
operation
transformation
output expression
reason
rule/theorem used
verification status
```

---

# 7. Method Selector

Sistem harus dapat memilih metode berdasarkan struktur soal.

Contoh integral:

```text
Direct integration
Substitution
Integration by parts
Partial fractions
Trigonometric identities
Trigonometric substitution
Series / approximation
Numerical integration
```

Contoh persamaan:

```text
Simplification
Factoring
Quadratic formula
Substitution
Elimination
Matrix method
Numerical solver
```

Method selector harus menggunakan rule/heuristic engine dan tidak bergantung pada LLM.

---

# 8. Mode Pembelajaran

## 8.1 Jawaban Cepat

Menampilkan:
- hasil,
- satuan,
- tingkat keyakinan/verification status jika relevan.

## 8.2 Langkah Lengkap

Menampilkan seluruh langkah penyelesaian.

## 8.3 Mengapa?

Pengguna dapat membuka alasan di balik sebuah langkah.

Contoh:

> Mengapa menggunakan Product Rule?

Sistem menjelaskan aturan yang digunakan dan mengapa struktur ekspresi memenuhi syarat aturan tersebut.

## 8.4 Metode Lain

Jika ada beberapa metode yang valid, pengguna dapat melihat alternatif.

## 8.5 Verifikasi Pekerjaan Saya

Pengguna dapat memasukkan langkah versinya sendiri. Sistem memeriksa langkah satu per satu.

Contoh:

```text
✓ Langkah 1 benar
✓ Langkah 2 benar
✗ Langkah 3 salah

Kesalahan terjadi saat ...
```

Sistem sebaiknya mengarahkan pengguna ke bagian yang salah, bukan hanya menampilkan jawaban akhir.

---

# 9. Tingkat Penjelasan

Sediakan beberapa tingkat kedalaman:

### Dasar
Bahasa sederhana untuk pelajar pemula.

### Pelajar
Penjelasan konseptual + rumus.

### Universitas
Notasi dan terminologi akademik.

### Advanced
Langkah lebih formal dan asumsi yang digunakan.

### Expert
Detail transformasi, teorema, kondisi keberlakuan, domain, dan batasan metode bila relevan.

---

# 10. Cakupan Modul

## 10.1 Matematika

### Dasar
- aritmetika,
- pecahan,
- desimal,
- persentase,
- rasio,
- pangkat,
- akar,
- faktorisasi,
- FPB/KPK,
- bilangan prima,
- notasi ilmiah.

### Aljabar
- persamaan linear,
- pertidaksamaan,
- sistem persamaan,
- persamaan kuadrat,
- polynomial,
- faktorisasi,
- fungsi,
- komposisi fungsi,
- fungsi invers,
- nilai mutlak,
- barisan,
- deret,
- persamaan eksponensial,
- persamaan logaritma.

### Trigonometri
- sin, cos, tan,
- sec, csc, cot,
- invers trigonometri,
- identitas,
- persamaan trigonometrik,
- hukum sinus,
- hukum cosinus,
- radian/derajat,
- grafik trigonometrik.

### Geometri
- luas,
- keliling,
- volume,
- permukaan,
- Pythagoras,
- segitiga,
- segiempat,
- lingkaran,
- poligon,
- koordinat,
- jarak,
- titik tengah,
- gradien,
- transformasi.

### Kalkulus
- limit,
- turunan,
- turunan tingkat tinggi,
- turunan implisit,
- turunan parsial,
- integral tak tentu,
- integral tentu,
- integral lipat,
- integral garis,
- integral permukaan,
- optimisasi,
- Taylor/Maclaurin,
- persamaan diferensial.

### Aljabar Linear
- vektor,
- matriks,
- determinan,
- invers,
- eigenvalue,
- eigenvector,
- ruang vektor,
- dot product,
- cross product,
- proyeksi,
- transformasi linear.

### Matematika Diskrit
- logika,
- himpunan,
- relasi,
- fungsi,
- kombinatorika,
- permutasi,
- kombinasi,
- graf,
- pohon,
- rekurensi,
- boolean algebra,
- teori bilangan.

### Matematika Lanjut
- analisis real,
- analisis kompleks,
- aljabar abstrak,
- teori grup,
- teori ring,
- teori medan,
- teori bilangan lanjut,
- topologi,
- teori ukuran,
- analisis fungsional,
- PDE,
- optimisasi matematis,
- kalkulus tensor,
- metode numerik lanjut.

---

# 11. Fisika

## Mekanika
- kinematika,
- dinamika,
- hukum Newton,
- gaya,
- momentum,
- impuls,
- energi,
- usaha,
- daya,
- torsi,
- kesetimbangan,
- pusat massa,
- gerak rotasi.

## Fluida
- massa jenis,
- tekanan,
- hidrostatika,
- Pascal,
- Archimedes,
- kontinuitas,
- Bernoulli,
- debit,
- viskositas.

## Termodinamika
- suhu,
- kalor,
- gas ideal,
- hukum termodinamika,
- entropi,
- entalpi,
- efisiensi,
- siklus termodinamika.

## Gelombang
- frekuensi,
- periode,
- panjang gelombang,
- cepat rambat,
- gelombang berjalan,
- gelombang berdiri,
- resonansi,
- interferensi,
- difraksi,
- Doppler.

## Listrik & Magnet
- muatan,
- Coulomb,
- medan listrik,
- potensial,
- kapasitansi,
- arus,
- tegangan,
- resistansi,
- Ohm,
- Kirchhoff,
- rangkaian seri/paralel,
- daya,
- medan magnet,
- Lorentz,
- fluks,
- Faraday,
- Lenz,
- induktansi.

## Optik
- cermin,
- lensa,
- refleksi,
- refraksi,
- indeks bias,
- interferensi,
- difraksi,
- polarisasi.

## Fisika Modern
- relativitas,
- foton,
- efek fotolistrik,
- de Broglie,
- atom,
- radioaktivitas,
- peluruhan,
- waktu paruh,
- fisika nuklir.

---

# 12. Kimia

## Dasar & Stoikiometri
- atom,
- massa atom,
- massa molekul,
- mol,
- Avogadro,
- komposisi persen,
- rumus empiris,
- rumus molekul,
- stoikiometri.

## Larutan
- molaritas,
- molalitas,
- normalitas,
- fraksi mol,
- pengenceran,
- ppm,
- ppb.

## Asam-Basa
- pH,
- pOH,
- Ka,
- Kb,
- Kw,
- asam/basa kuat,
- asam/basa lemah,
- buffer,
- Henderson-Hasselbalch,
- titrasi.

## Kesetimbangan
- Kc,
- Kp,
- Q,
- Le Chatelier,
- kesetimbangan ion.

## Termokimia
- kalor,
- entalpi,
- entropi,
- Gibbs,
- Hess,
- kalorimetri.

## Elektrokimia
- potensial sel,
- galvanik,
- elektrolisis,
- Nernst,
- Faraday,
- redoks.

## Kinetika
- laju reaksi,
- orde,
- konstanta laju,
- waktu paruh,
- Arrhenius,
- energi aktivasi.

## Kimia Lanjut
- kimia kuantum,
- spektroskopi,
- kimia fisik,
- kimia analitik,
- kimia koordinasi,
- mekanisme reaksi.

---

# 13. Statistika & Probabilitas

- mean,
- median,
- modus,
- range,
- varians,
- simpangan baku,
- kuartil,
- persentil,
- IQR,
- z-score,
- probabilitas,
- probabilitas bersyarat,
- Bayes,
- permutasi,
- kombinasi,
- binomial,
- Poisson,
- geometrik,
- normal,
- uniform,
- eksponensial,
- t-distribution,
- chi-square,
- F-distribution,
- confidence interval,
- hypothesis testing,
- uji-t,
- ANOVA,
- korelasi,
- regresi linear,
- regresi berganda,
- maximum likelihood,
- Bayesian statistics,
- Markov chain,
- Monte Carlo,
- time series.

---

# 14. Ilmu Komputer / Teknik Komputasi

- konversi basis bilangan,
- operasi biner,
- bit/byte,
- bitwise,
- boolean,
- kompleksitas sederhana,
- hash/encoding utilities,
- Base64,
- XOR,
- subnet calculator,
- IP/CIDR,
- network range,
- bandwidth,
- storage.

---

# 15. Engineering

### Teknik Sipil
- tegangan,
- regangan,
- beban,
- momen,
- gaya geser,
- balok,
- struktur,
- hidrolika.

### Teknik Mesin
- torsi,
- RPM,
- daya,
- efisiensi,
- gear ratio,
- energi,
- termodinamika,
- perpindahan panas.

### Teknik Elektro
- Ohm,
- Kirchhoff,
- impedansi,
- reaktansi,
- AC/DC,
- RMS,
- power factor,
- RLC,
- resonansi,
- transformator.

### Teknik Kimia
- mass balance,
- energy balance,
- reactor calculations,
- heat exchanger,
- fluid flow,
- thermodynamics.

---

# 16. Ekonomi & Keuangan

- bunga sederhana,
- bunga majemuk,
- anuitas,
- cicilan,
- pinjaman,
- KPR,
- PV,
- FV,
- NPV,
- IRR,
- ROI,
- break-even,
- depresiasi,
- inflasi.

---

# 17. Astronomi

- hukum Kepler,
- gravitasi,
- kecepatan orbit,
- periode orbit,
- escape velocity,
- luminositas,
- magnitudo,
- redshift,
- AU,
- parsec,
- light-year,
- waktu tempuh cahaya.

---

# 18. Konversi Satuan & Dimensi

Harus memiliki unit engine terpusat.

Kategori minimal:
- panjang,
- massa,
- waktu,
- suhu,
- luas,
- volume,
- kecepatan,
- percepatan,
- gaya,
- tekanan,
- energi,
- daya,
- frekuensi,
- muatan,
- tegangan,
- arus,
- hambatan,
- kapasitansi,
- induktansi,
- viskositas,
- konsentrasi.

Sistem harus memahami dimensi fisika sehingga kesalahan unit dapat dideteksi.

Contoh:

```text
meter + kilogram
```

harus ditolak karena dimensi tidak kompatibel.

---

# 19. Grafik & Visualisasi

Sediakan visualisasi sesuai jenis input:

- grafik fungsi 2D,
- grafik 3D,
- parametric plot,
- polar plot,
- vector field,
- contour,
- scatter plot,
- histogram,
- distribusi probabilitas,
- grafik data.

Grafik harus dapat mengikuti langkah penyelesaian ketika relevan.

---

# 20. Format Output

Hasil idealnya mempunyai struktur:

```text
[Hasil]

[Rumus / metode]

[Langkah 1]

[Langkah 2]

[Langkah 3]

[Verifikasi]

[Catatan / asumsi]

[Metode alternatif]
```

Untuk hasil numerik:
- gunakan significant figures bila relevan,
- tampilkan precision,
- jangan menyembunyikan pembulatan,
- tampilkan unit.

---

# 21. Error Handling

Sistem harus menjelaskan kesalahan dengan bahasa yang dapat dipahami.

Contoh:

```text
Input tidak valid.

Penyebab:
Kurung buka '(' tidak memiliki pasangan ')'.
```

atau:

```text
Tidak dapat menyelesaikan secara simbolik.

Sistem beralih ke metode numerik.

Metode: Newton-Raphson
Toleransi: 1e-10
Iterasi maksimum: 100
```

Jangan hanya menampilkan error code internal.

---

# 22. UI/UX

Desain harus bersih, modern, dan fokus pada pembelajaran.

### Halaman utama
- input kalkulator besar,
- kategori kalkulator,
- history,
- favorites,
- shortcut kategori,
- contoh soal.

### Halaman hasil
Gunakan panel/tab:

```text
Jawaban
Langkah
Penjelasan
Verifikasi
Grafik
Metode Lain
```

### Input
Mendukung:
- keyboard,
- tombol kalkulator,
- simbol matematika,
- mobile,
- copy/paste,
- natural mathematical notation yang terkontrol.

---

# 23. Aksesibilitas & Responsif

Website harus nyaman digunakan di:
- desktop,
- laptop,
- tablet,
- mobile.

Perhatikan:
- keyboard navigation,
- screen reader labels,
- kontras,
- ukuran tombol,
- notasi matematika yang terbaca,
- mode gelap/terang.

---

# 24. Riwayat & Workspace

Pengguna sebaiknya dapat:
- melihat riwayat perhitungan,
- mengulang perhitungan,
- menyimpan perhitungan lokal,
- menyalin langkah,
- mengekspor hasil,
- membagikan tautan soal jika arsitektur backend mendukung.

Login tidak harus menjadi syarat untuk kalkulator dasar.

---

# 25. SEO

Setiap kategori kalkulator sebaiknya memiliki halaman yang dapat diindeks.

Contoh struktur:

```text
/calculator/
/calculator/math/
/calculator/math/quadratic-equation/
/calculator/math/derivative/
/calculator/math/integral/
/calculator/physics/
/calculator/physics/kinetic-energy/
/calculator/chemistry/
/calculator/chemistry/ph-calculator/
/calculator/statistics/
...
```

Setiap halaman harus memiliki:
- title yang spesifik,
- meta description,
- heading yang jelas,
- contoh penggunaan,
- FAQ bila relevan,
- schema markup bila sesuai,
- konten edukasi singkat.

---

# 26. Akurasi & Pengujian

Ini bagian kritis.

Setiap domain harus memiliki automated tests.

### Unit test
Menguji fungsi individual.

### Symbolic equivalence test
Memastikan dua ekspresi yang seharusnya ekuivalen dianggap benar.

### Numerical test
Membandingkan hasil dengan referensi dengan tolerance tertentu.

### Dimensional test
Mengecek konsistensi satuan.

### Regression test
Setiap bug yang diperbaiki harus menghasilkan test baru.

### Step verification test
Memastikan setiap langkah benar sebelum ditampilkan ke pengguna.

---

# 27. Prioritas Pengembangan

Jangan membuat seluruh daftar sekaligus.

## Fase 1 — Fondasi

Bangun:
- parser,
- AST,
- numeric engine,
- symbolic simplifier,
- unit engine,
- equation solver dasar,
- step engine,
- verification engine,
- calculator UI.

## Fase 2 — Matematika Inti

- aljabar,
- persamaan,
- trigonometri,
- matriks,
- turunan,
- integral,
- limit,
- grafik.

## Fase 3 — Sains

- fisika dasar,
- kimia dasar,
- statistik/probabilitas,
- unit dan dimensi lebih lengkap.

## Fase 4 — Universitas

- kalkulus lanjut,
- aljabar linear lanjut,
- persamaan diferensial,
- numerical methods,
- statistik inferensial,
- fisika universitas,
- kimia universitas.

## Fase 5 — Advanced / Expert

- analisis real,
- analisis kompleks,
- aljabar abstrak,
- PDE,
- optimisasi,
- teori bilangan lanjut,
- topologi,
- metode numerik lanjut,
- proof-oriented features.

---

# 28. Prinsip Pengembangan

1. **Jangan prioritaskan jumlah kalkulator di awal.** Prioritaskan engine yang kuat.
2. **Jangan hard-code setiap halaman sebagai kalkulator terpisah.** Gunakan domain engine yang reusable.
3. **Setiap hasil harus bisa ditelusuri ke langkah yang menghasilkan hasil tersebut.**
4. **Jangan menampilkan langkah yang tidak dapat diverifikasi.**
5. **Pisahkan perhitungan dari penjelasan.** Engine menghitung; teaching layer menjelaskan.
6. **Metode alternatif harus bersifat nyata**, bukan sekadar memformat hasil yang sama.
7. **Sistem harus jujur ketika tidak memiliki metode yang dapat diverifikasi.**
8. **Gunakan precision/tolerance yang jelas untuk operasi numerik.**
9. **Pertahankan unit dan dimensi sepanjang perhitungan bila applicable.**
10. **Semua bug matematika harus menjadi regression test.**

---

# 29. Definition of Done untuk setiap kalkulator

Sebuah kalkulator dianggap selesai apabila:

- dapat menerima input valid,
- dapat memvalidasi input,
- dapat menghitung hasil dengan benar,
- dapat menampilkan langkah,
- setiap langkah dapat diverifikasi,
- dapat menampilkan rumus/metode yang digunakan,
- memiliki penanganan error,
- memiliki automated tests,
- dapat digunakan di desktop dan mobile,
- memiliki halaman dokumentasi/pelajaran dasar,
- dan tidak bergantung pada LLM untuk perhitungan utama.

---

# 30. Hasil Akhir yang Diharapkan

Produk akhir harus terasa seperti gabungan antara:

```text
Scientific Calculator
        +
Computer Algebra System
        +
Numerical Calculator
        +
Graphing Calculator
        +
Physics Calculator
        +
Chemistry Calculator
        +
Statistics Calculator
        +
Unit/Dimension Engine
        +
Step-by-step Tutor
        +
Verification System
```

Namun seluruhnya berada dalam **satu website dan satu ekosistem engine**.

### Prinsip produk

> **Masukkan masalahnya. Sistem menghitung, menunjukkan caranya, menjelaskan alasannya, dan memverifikasi hasilnya.**

---

# 31. Catatan untuk Developer

Jangan langsung mengimplementasikan seluruh daftar fitur di atas sebagai satu sprint besar.

Mulai dengan desain core engine dan kontrak data yang memungkinkan setiap domain menjadi plugin/module.

Prioritas pertama adalah:

```text
Parser
→ AST
→ Symbolic/Numerical Core
→ Rule Engine
→ Step Engine
→ Verification
→ UI
```

Setelah fondasi stabil, baru tambahkan domain satu per satu.

Target arsitektur adalah agar penambahan kalkulator baru lebih banyak berarti **menambah rules, formulas, solver, dan tests**, bukan membuat sistem baru dari nol.

---

## Nama sementara

**Vanillate Calculator** / **Vanillate Math** / **Vanillate Science**

Nama final dapat ditentukan kemudian.
