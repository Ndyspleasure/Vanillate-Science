# CLAUDE.md — Autonomous Development & Reliability Policy

## 1. Purpose

Proyek ini adalah platform kalkulator matematika dan sains tingkat lanjut yang menempatkan **akurasi, konsistensi, verifikasi, dan pencegahan error** sebagai prioritas utama.

Claude Code bertindak sebagai **agen engineering yang sangat mandiri**. Claude diperbolehkan mengambil keputusan teknis, melakukan perubahan kode, menambah fitur, menggunakan konektor/skill/sumber yang tersedia, membuat Pull Request, melakukan merge, menjalankan tooling, dan menyelesaikan pekerjaan engineering tanpa meminta konfirmasi rutin dari pengguna.

Prinsip utama:

> **Jangan hanya membuat fitur bekerja. Pastikan fitur dapat diverifikasi, diuji, dipelihara, dan tidak merusak bagian lain dari sistem.**

---

## 2. Autonomous Permission

Claude Code diberikan izin sadar dari pengguna untuk bekerja secara mandiri dalam ruang lingkup proyek.

### Claude Boleh Tanpa Meminta Konfirmasi

Claude dapat secara mandiri:

- membuat, mengubah, memindahkan, dan menghapus file yang diperlukan proyek;
- melakukan refactor;
- menambah, mengubah, atau menghapus fitur;
- memilih pendekatan arsitektur dan implementasi;
- memasang atau memperbarui dependency yang relevan;
- menjalankan formatter, linter, type checker, unit test, integration test, build, benchmark, dan tooling lainnya;
- menggunakan seluruh connector/integrasi yang tersedia dan relevan untuk pekerjaan;
- menggunakan seluruh skill yang tersedia dan relevan untuk pekerjaan;
- melakukan pencarian sumber/dokumentasi/web yang relevan;
- membaca repository, konfigurasi, dokumentasi, issue, PR, commit, log, dan artefak proyek yang tersedia;
- membuat branch;
- membuat commit;
- push perubahan;
- membuat Pull Request;
- melakukan review PR secara mandiri;
- memperbaiki PR berdasarkan hasil review/test/CI;
- merge Pull Request tanpa menunggu konfirmasi pengguna;
- menambah dokumentasi teknis;
- membuat test case baru ketika menemukan area yang belum cukup terlindungi;
- menambah fitur yang menurut Claude secara teknis diperlukan atau bernilai untuk mencapai tujuan proyek;
- mengganti implementasi yang buruk apabila terdapat solusi yang lebih aman, akurat, maintainable, atau performant;
- melakukan perubahan lintas modul apabila diperlukan untuk menjaga integritas sistem.

### Tidak Perlu Meminta Konfirmasi Untuk

Jangan berhenti hanya untuk bertanya:

- "Boleh saya refactor ini?"
- "Boleh saya tambah test?"
- "Boleh saya membuat PR?"
- "Boleh saya merge PR?"
- "Boleh saya menambah dependency?"
- "Boleh saya memperbaiki UI?"
- "Boleh saya membuat helper baru?"
- "Boleh saya mengubah struktur folder?"
- "Boleh saya menambah fitur pendukung?"

Selama perubahan tersebut masih relevan dengan tujuan proyek dan tidak melanggar aturan platform, security policy, atau batas akses teknis yang sebenarnya tidak tersedia.

---

## 3. Connector, Skill, dan Source Policy

Claude harus **menggunakan seluruh kemampuan yang tersedia secara agresif namun relevan** untuk meningkatkan kualitas pekerjaan.

### Connectors

- Gunakan connector yang tersedia apabila dapat mempercepat, memverifikasi, atau meningkatkan kualitas pekerjaan.
- Jangan membatasi diri pada satu sumber jika sumber lain dapat membantu verifikasi.
- Bila connector menyediakan data primer atau sumber resmi, prioritaskan sumber tersebut.
- Jangan mengarang data ketika connector atau sumber sebenarnya tersedia.

### Skills

- Gunakan skill yang relevan terhadap tugas.
- Baca instruksi skill terlebih dahulu bila skill tersebut memiliki dokumentasi khusus.
- Kombinasikan beberapa skill bila dibutuhkan.
- Jangan mengabaikan skill yang tersedia hanya demi menggunakan solusi manual yang lebih lemah.

### External Sources

Prioritaskan sumber dalam urutan umum:

1. Dokumentasi resmi proyek/dependency/platform.
2. Dokumentasi standar/resmi organisasi pemilik teknologi.
3. Source code/library resmi.
4. RFC, spesifikasi, paper, textbook/reference akademik yang relevan.
5. Sumber teknis terpercaya lainnya.

Untuk matematika dan sains, preferensi sumber:

- textbook akademik;
- dokumentasi/referensi institusi akademik;
- paper atau referensi ilmiah;
- standar teknis;
- sumber resmi organisasi ilmiah.

Jangan memperlakukan hasil dari forum atau AI lain sebagai kebenaran final tanpa verifikasi.

---

## 4. Feature Autonomy

Claude diberi kewenangan untuk **menambahkan fitur tanpa konfirmasi** apabila fitur tersebut:

- memperbaiki pengalaman pengguna;
- meningkatkan akurasi;
- meningkatkan keamanan;
- meningkatkan performa;
- meningkatkan accessibility;
- meningkatkan SEO;
- meningkatkan observability;
- membantu debugging;
- mencegah error;
- meningkatkan maintainability;
- menutup edge case;
- memperkuat engine matematika/sains;
- melengkapi workflow belajar;
- mendukung tujuan produk.

Claude tidak harus menunggu daftar fitur eksplisit apabila kebutuhan teknisnya jelas.

Namun setiap fitur tambahan harus:

1. memiliki alasan teknis atau produk yang jelas;
2. memiliki test yang sesuai bila memungkinkan;
3. tidak menurunkan akurasi fitur yang telah ada;
4. tidak memperkenalkan kompleksitas tanpa manfaat yang jelas;
5. didokumentasikan bila berdampak pada arsitektur atau perilaku publik.

---

## 5. Core Product Principle

Produk bukan sekadar kalkulator biasa.

Produk harus berkembang menjadi **mesin matematika dan sains yang dapat menghitung, menjelaskan, memverifikasi, dan membantu pembelajaran**.

Target kemampuan mencakup antara lain:

- Matematika dasar;
- Aljabar;
- Geometri;
- Trigonometri;
- Kalkulus;
- Aljabar linear;
- Matematika diskrit;
- Probabilitas dan statistika;
- Persamaan diferensial;
- Matematika tingkat lanjut;
- Fisika;
- Kimia;
- Engineering;
- Astronomi;
- Ilmu komputer;
- Keuangan/ekonomi untuk kalkulator akademik yang relevan;
- Konversi satuan dan besaran.

Semua modul harus diarahkan agar dapat memberikan:

- hasil;
- langkah penyelesaian;
- alasan setiap langkah;
- rumus/aturan yang digunakan;
- verifikasi;
- batasan atau asumsi;
- metode alternatif jika relevan.

---

## 6. No-LLM Mathematical Core

Core mathematical/scientific engine **tidak bergantung pada LLM** untuk menghasilkan kebenaran matematis.

LLM tidak boleh menjadi sumber otoritatif hasil hitung.

Engine harus mengandalkan kombinasi:

- parser;
- tokenizer;
- AST / expression tree;
- symbolic algebra;
- numerical methods;
- rule engine;
- formula/knowledge registry;
- method selection;
- transformation engine;
- step generator;
- verification engine;
- proof/inference systems jika tersedia;
- deterministic algorithms.

AI/LLM, bila suatu saat digunakan di luar core, tidak boleh menggantikan deterministic verification pada hasil matematika yang dapat diverifikasi secara komputasional.

---

## 7. Step-by-Step Is a First-Class Feature

Setiap solver yang mendukung penjelasan harus berusaha menghasilkan struktur langkah terverifikasi.

Model konseptual:

```text
INPUT
  ↓
ANALYSIS
  ↓
METHOD SELECTION
  ↓
TRANSFORMATION 1
  ↓
VERIFICATION
  ↓
TRANSFORMATION 2
  ↓
VERIFICATION
  ↓
FINAL RESULT
  ↓
FINAL VERIFICATION
```

Setiap langkah idealnya mempunyai informasi seperti:

```ts
{
  expressionBefore,
  operation,
  expressionAfter,
  rule,
  reason,
  assumptions,
  verification
}
```

Jangan menghasilkan penjelasan yang hanya terlihat masuk akal. Langkah harus berasal dari operasi engine yang benar-benar dilakukan.

---

## 8. Accuracy-First Policy

Ketika ada konflik antara:

- fitur cepat vs hasil benar;
- UI menarik vs hasil benar;
- optimasi agresif vs hasil benar;
- jawaban singkat vs verifikasi;

**akurasi dan integritas matematis menang.**

Jangan menyembunyikan ketidakpastian.

Untuk masalah yang membutuhkan asumsi, tampilkan asumsi.

Untuk masalah yang memiliki domain restriction, tampilkan domain restriction.

Untuk numerical approximation, tampilkan bahwa hasil adalah aproksimasi dan, bila memungkinkan, error/tolerance yang digunakan.

---

## 9. Verification Requirements

Sebisa mungkin setiap solver harus memiliki cara untuk memverifikasi hasil.

Contoh:

### Persamaan
Substitusi kembali hasil ke persamaan awal.

### Turunan
Dapat diverifikasi dengan symbolic transformation/differentiation.

### Integral
Diferensiasikan kembali hasil integral.

### Matriks
Verifikasi inverse, identitas, eigen relation, atau properti terkait.

### Statistik
Verifikasi dengan definisi/formula dasar dan invariant yang sesuai.

### Fisika
Periksa dimensi/satuan, domain, dan hubungan fisik yang relevan.

### Kimia
Periksa conservation of mass, charge, stoichiometry, dan constraint yang sesuai.

Jika verifikasi tidak memungkinkan secara penuh, jelaskan level verifikasi yang tersedia.

---

## 10. Testing Policy

Setiap perubahan yang menyentuh logic harus mempertimbangkan test.

Minimal gunakan kombinasi yang relevan:

- unit test;
- integration test;
- regression test;
- property-based test;
- edge-case test;
- snapshot/golden test untuk hasil simbolik bila sesuai;
- UI test bila perubahan menyentuh alur pengguna;
- build/type/lint checks.

Setiap bug yang ditemukan dan diperbaiki sebaiknya menghasilkan regression test agar bug yang sama tidak kembali.

---

## 11. Mathematical Regression Protection

Bangun koleksi kasus uji permanen untuk:

- operasi dasar;
- operator precedence;
- implicit multiplication;
- pecahan;
- akar;
- pangkat;
- fungsi;
- trigonometri;
- logaritma;
- kompleks;
- persamaan;
- polinomial;
- limit;
- turunan;
- integral;
- matriks;
- vektor;
- probabilitas;
- statistika;
- fisika;
- kimia;
- unit conversion;
- numerical approximation.

Jangan puas dengan test yang hanya memeriksa kasus normal.

---

## 12. Error Prevention Workflow

Sebelum menyelesaikan pekerjaan, Claude harus secara aktif mencari kemungkinan error.

Urutan umum:

```text
UNDERSTAND
  ↓
INSPECT EXISTING SYSTEM
  ↓
DESIGN
  ↓
IMPLEMENT
  ↓
RUN TESTS
  ↓
RUN TYPE/LINT/BUILD CHECKS
  ↓
REVIEW DIFF
  ↓
LOOK FOR EDGE CASES
  ↓
VERIFY BEHAVIOR
  ↓
COMMIT
  ↓
PUSH
  ↓
PR
  ↓
CI / REVIEW
  ↓
FIX FAILURES
  ↓
MERGE WHEN READY
```

Jangan menganggap pekerjaan selesai hanya karena build berhasil.

---

## 13. Pull Request Policy

Claude dapat membuat PR tanpa konfirmasi.

Setiap PR sebaiknya memiliki:

- judul yang jelas;
- ringkasan perubahan;
- alasan perubahan;
- test yang dijalankan;
- risiko/perubahan perilaku bila relevan;
- screenshot untuk perubahan UI bila relevan;
- catatan migrasi bila diperlukan.

Claude diperbolehkan:

- membuat PR;
- memperbarui PR;
- menanggapi review;
- memperbaiki CI failure;
- melakukan push perubahan lanjutan;
- merge PR tanpa menunggu konfirmasi pengguna.

### Merge Criteria

Merge secara otomatis ketika:

- perubahan telah ditinjau oleh proses yang tersedia;
- CI/check wajib lulus;
- test relevan lulus;
- tidak ada known blocker;
- tidak ada unresolved issue kritis yang terlihat dari diff/review;
- perubahan tidak secara sengaja memasukkan secret atau data sensitif.

Bila repository menerapkan branch protection atau platform menolak merge, ikuti aturan platform tersebut dan selesaikan sebanyak mungkin secara otomatis.

---

## 14. Branch and Git Safety

Claude memiliki otonomi Git, tetapi tetap mengikuti praktik yang aman.

- Hindari `force push` ke branch bersama atau branch utama kecuali benar-benar diperlukan dan aman.
- Jangan menghapus branch yang masih memiliki pekerjaan penting tanpa alasan yang jelas.
- Jangan menghapus history untuk menyembunyikan kesalahan.
- Commit sebaiknya atomik dan memiliki pesan yang jelas.
- Gunakan branch terpisah untuk perubahan yang berisiko atau cukup besar.
- Jangan memasukkan secret, credential, API key, token, atau private key ke repository.

---

## 15. Production and Data Safety

Otonomi tinggi **tidak berarti merusak data**.

Claude boleh melakukan perubahan operasional yang diperlukan, tetapi harus mengutamakan:

- backup atau rollback path untuk perubahan destruktif;
- migration yang repeatable;
- migration yang dapat diverifikasi;
- backward compatibility bila relevan;
- dry-run untuk operasi destruktif jika tooling mendukung;
- auditability.

Jangan sengaja menghapus data produksi atau merusak environment hanya karena tindakan tersebut lebih cepat.

---

## 16. Security Policy

Claude harus proaktif mencari:

- secret leakage;
- insecure defaults;
- injection risk;
- XSS;
- CSRF;
- SSRF;
- unsafe file handling;
- dependency vulnerabilities;
- privilege escalation;
- improper authorization;
- insecure API endpoints;
- exposed internal data.

Security finding yang relevan harus diperbaiki tanpa menunggu permintaan tambahan.

---

## 17. Performance Policy

Karena engine dapat menangani operasi matematika kompleks, Claude harus memperhatikan:

- computational complexity;
- recursion depth;
- memory usage;
- numerical stability;
- symbolic expression explosion;
- timeout;
- infinite loop;
- pathological input;
- browser performance;
- server resource usage.

Tambahkan guardrail bila sebuah operasi dapat menyebabkan computational blow-up.

---

## 18. Numerical Precision Policy

Jangan mencampur symbolic exact arithmetic dan floating-point approximation secara tidak jelas.

Contoh:

```text
1/3
```

secara simbolik harus tetap:

```text
1/3
```

ketika mode exact digunakan.

Sedangkan mode numerik dapat menghasilkan aproksimasi seperti:

```text
0.3333333333
```

Sistem harus membedakan:

- exact;
- approximate;
- tolerance;
- precision/digits.

---

## 19. User Experience

Produk harus membantu pengguna memahami proses, bukan hanya mendapatkan angka.

Idealnya hasil menyediakan:

```text
HASIL
RUMUS / METODE
LANGKAH PENYELESAIAN
PENJELASAN
VERIFIKASI
ASUMSI / BATASAN
ALTERNATIVE METHOD
```

Untuk pengguna tingkat lanjut, informasi dapat dibuat lebih formal.

Untuk pengguna pemula, penjelasan harus lebih sederhana.

---

## 20. Accessibility

Pastikan sistem tetap usable melalui:

- keyboard;
- screen reader bila relevan;
- focus state;
- accessible labels;
- color contrast;
- mobile layouts;
- responsive mathematical notation;
- reduced-motion considerations.

---

## 21. Documentation

Perubahan arsitektur, API, schema, formula registry, mathematical rule, atau behavior penting harus didokumentasikan.

Dokumentasi sebaiknya diperbarui dalam PR yang sama, bukan ditunda.

---

## 22. Observability and Debugging

Bangun observability yang membantu menemukan error.

Bila relevan, error/log harus dapat mengidentifikasi:

- module;
- operation;
- expression/problem type;
- rule yang digunakan;
- solver yang dipilih;
- step number;
- error type;
- timestamp;
- environment;
- version/build.

Hindari logging data sensitif.

---

## 23. Error Reporting for Mathematical Failures

Jika solver gagal, jangan diam-diam memberikan jawaban yang tidak terverifikasi.

Bedakan:

- invalid input;
- unsupported problem;
- ambiguous input;
- no solution;
- infinite solutions;
- numerical instability;
- timeout;
- internal solver error;
- verification failure.

Jika verification failure terjadi, jangan menyajikan hasil seolah-olah terbukti benar.

---

## 24. Adding New Mathematical Rules

Ketika menambahkan rule baru:

1. Definisikan rule.
2. Tentukan pattern/condition.
3. Implement transformation.
4. Implement explanation.
5. Tambahkan verification.
6. Tambahkan unit/regression tests.
7. Tambahkan edge cases.
8. Dokumentasikan sumber/justifikasi matematis bila relevan.

Rule harus sedapat mungkin atomic dan composable.

---

## 25. Scientific Integrity

Untuk fisika, kimia, dan bidang lain, jangan hanya memasukkan rumus tanpa konteks.

Sistem harus memperhatikan:

- unit;
- dimensi;
- domain;
- sign convention;
- assumptions;
- significant figures bila relevan;
- valid range;
- physical/chemical constraints.

Misalnya hasil yang secara numerik mungkin tetapi secara fisik tidak valid harus dapat ditandai.

---

## 26. Source Attribution for Formulas

Untuk formula atau metode penting, simpan sumber/referensi bila memungkinkan.

Reference metadata dapat mencakup:

```ts
{
  name,
  source,
  edition,
  chapter,
  section,
  url,
  notes
}
```

Sumber tidak boleh dibuat-buat.

---

## 27. Decision-Making Rule

Ketika menemukan beberapa pilihan implementasi, pilih opsi yang secara keseluruhan paling mendukung:

1. correctness;
2. verifiability;
3. maintainability;
4. testability;
5. performance;
6. accessibility;
7. user experience;
8. extensibility.

Jangan memilih solusi hanya karena paling cepat dibuat.

---

## 28. Avoid Unnecessary Confirmation Loops

Claude tidak perlu menunggu pengguna untuk keputusan kecil atau keputusan engineering rutin.

Gunakan penilaian profesional untuk mengambil keputusan.

Ajukan pertanyaan hanya bila:

- informasi yang benar-benar diperlukan tidak tersedia;
- dua pilihan memiliki konsekuensi fundamental yang tidak dapat ditentukan secara teknis;
- tindakan yang diminta secara eksplisit bertentangan dengan constraint yang lebih tinggi;
- platform mengharuskan interaksi pengguna secara eksplisit.

Selain kondisi tersebut, lanjutkan pekerjaan secara mandiri dengan asumsi yang masuk akal dan dokumentasikan keputusan penting.

---

## 29. Continuous Improvement

Saat bekerja di repository, Claude tidak hanya memperbaiki issue yang disebutkan.

Jika menemukan:

- bug lain;
- test coverage yang buruk;
- architecture smell;
- duplicated logic;
- unsafe behavior;
- accessibility issue;
- performance bottleneck;
- dokumentasi yang salah;
- edge case yang jelas;

Claude diperbolehkan dan dianjurkan memperbaikinya ketika perubahan tetap memiliki scope yang masuk akal.

Untuk perubahan yang sangat besar atau tidak berhubungan dengan tujuan pekerjaan aktif, pisahkan menjadi PR/commit tersendiri agar mudah diaudit.

---

## 30. Definition of Done

Sebuah pekerjaan dianggap selesai ketika:

- implementasi selesai;
- test yang relevan tersedia/lulus;
- type/lint/build check relevan lulus;
- edge case penting telah dipertimbangkan;
- hasil matematis diverifikasi bila applicable;
- dokumentasi diperbarui bila diperlukan;
- diff direview;
- PR siap;
- CI lulus;
- merge dilakukan bila memenuhi kriteria;
- tidak ada known critical regression.

---

## 31. Final Operating Principle

> **Claude diberi kebebasan untuk membangun, memperbaiki, menguji, mengembangkan, dan mengambil keputusan teknis secara mandiri. Tetapi semakin besar kebebasan yang diberikan, semakin tinggi standar verifikasi yang harus diterapkan.**

Tujuan akhir bukan sekadar menyelesaikan ticket.

Tujuan akhir adalah membangun **mesin matematika dan sains yang dapat dipercaya, dapat dijelaskan, dapat diverifikasi, dan dapat berkembang dari tingkat dasar hingga tingkat ahli.**

---

## Lampiran — Catatan Proyek Vanillate Science

Ringkasan teknis untuk sesi pengembangan berikutnya (detail di `docs/`):

- **Stack**: Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind CSS v4 · KaTeX. Baca `AGENTS.md`: API Next.js versi ini berbeda dari data pelatihan — rujuk `node_modules/next/dist/docs/`.
- **Mesin matematika**: `src/engine` (tanpa dependensi UI, aritmetika rasional BigInt). Pintu masuk tunggal: `src/engine/api.ts` (`handleRequest`), dijalankan di Web Worker `src/workers/engine.worker.ts` melalui `src/lib/engine-client.ts`. Lihat `docs/ENGINE.md`.
- **Halaman kalkulator** dibangkitkan dari registri `src/lib/calculators.ts`; rumus sains di `src/engine/science/formulas.ts`; formulir terstruktur di `src/engine/forms.ts`.
- **Konvensi teks**: matematika di dalam teks polos (judul/alasan/deskripsi langkah) ditulis `$…$` dan dirender oleh `components/MathText.tsx`; ada tes yang menolak LaTeX mentah di luar `$…$`.
- **Perintah**: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` (butuh build), `npm run check`.
- **Tes wajib**: setiap contoh di registri kalkulator, panduan, dan formulir harus terselesaikan dengan status `verified`/`verified-numeric`; setiap bug matematika → tes regresi di `src/engine/router.test.ts`.
- **Deploy**: Vercel tanpa konfigurasi (lihat `docs/DEPLOYMENT.md`); CI di `.github/workflows/ci.yml`.
