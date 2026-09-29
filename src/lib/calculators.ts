/**
 * Calculator registry: every indexable calculator page is generated from this data.
 * Pages reuse the shared engine (CLAUDE.md: "jangan hard-code setiap halaman sebagai
 * kalkulator terpisah"): a calculator is either a preset of the general solver, a formula
 * from the formula registry, a structured tool from engine/forms, or the unit converter.
 */
import type { Mode } from "@/engine/modes";
import { DOMAIN_LABELS, FORMULAS, type FormulaDef, type FormulaDomain } from "@/engine/science/formulas";
import { COMMON_UNITS } from "@/engine/units/units";
import type { Values } from "@/engine/forms";

export type CategoryId = "math" | "physics" | "chemistry" | "statistics" | "finance" | "computer-science" | "astronomy" | "engineering" | "geometry" | "units";

export interface Category {
  id: CategoryId;
  name: string;
  title: string;
  description: string;
  intro: string;
}

export const CATEGORIES: Category[] = [
  { id: "math", name: "Matematika", title: "Kalkulator Matematika", description: "Aljabar, persamaan, kalkulus, matriks, bilangan kompleks, teori bilangan, dan deret — dengan langkah penyelesaian yang diverifikasi.", intro: "Semua kalkulator matematika memakai mesin aljabar komputer (CAS) yang sama: soal diurai menjadi pohon ekspresi, diselesaikan dengan aturan yang tercatat di setiap langkah, lalu hasilnya diperiksa ulang dengan substitusi atau uji kesetaraan." },
  { id: "physics", name: "Fisika", title: "Kalkulator Fisika", description: "Rumus fisika SMA hingga universitas: kinematika, dinamika, energi, fluida, termodinamika, gelombang, optik, listrik-magnet, dan fisika modern — lengkap dengan konversi satuan.", intro: "Setiap rumus dapat diselesaikan untuk variabel mana pun. Nilai dikonversi ke satuan SI, konsistensi dimensi diperiksa, dan hasil diuji balik dengan substitusi ke rumus awal." },
  { id: "chemistry", name: "Kimia", title: "Kalkulator Kimia", description: "Massa molar, penyetaraan reaksi, stoikiometri, pereaksi pembatas, rumus empiris, pH, larutan, kinetika, dan elektrokimia.", intro: "Massa atom memakai nilai standar IUPAC/CIAAW. Penyetaraan reaksi dihitung dengan aljabar linear eksak (ruang nol matriks unsur), bukan tebakan." },
  { id: "statistics", name: "Statistika", title: "Kalkulator Statistika & Peluang", description: "Statistik deskriptif, regresi, distribusi binomial/Poisson/normal, uji t, uji z, chi-kuadrat, ANOVA, dan interval kepercayaan.", intro: "Distribusi diskret dihitung eksak dengan bilangan rasional; distribusi kontinu memakai algoritma numerik yang presisinya dinyatakan (misalnya fungsi galat dan fungsi beta tak lengkap)." },
  { id: "finance", name: "Keuangan", title: "Kalkulator Keuangan", description: "Bunga sederhana & majemuk, cicilan pinjaman/KPR (anuitas, efektif, flat), NPV, IRR, ROI, break-even, depresiasi, dan inflasi.", intro: "Perhitungan uang memakai aritmetika rasional eksak sehingga tidak ada galat pembulatan floating-point; pembulatan ke rupiah hanya dilakukan saat ditampilkan." },
  { id: "computer-science", name: "Ilmu Komputer", title: "Kalkulator Ilmu Komputer", description: "Konversi basis bilangan, komplemen dua, operasi bitwise, subnet IPv4, Base64, dan penyederhanaan aljabar Boolean.", intro: "Semua operasi bilangan bulat memakai BigInt sehingga tidak ada batas 32/53 bit yang diam-diam memotong hasil." },
  { id: "astronomy", name: "Astronomi", title: "Kalkulator Astronomi", description: "Hukum Kepler, kecepatan lepas dan orbit, luminositas bintang, hukum Wien, hukum Hubble, modulus jarak, dan waktu tempuh cahaya.", intro: "Konstanta fisika memakai nilai CODATA 2018 dan definisi eksak SI 2019 (misalnya c, h, k_B)." },
  { id: "engineering", name: "Teknik", title: "Kalkulator Teknik", description: "Mekanika bahan, momen balok, daya poros, roda gigi, rangkaian AC (reaktansi, resonansi, RMS), transformator, dan perpindahan panas.", intro: "Rumus teknik diselesaikan dengan analisis dimensi penuh: kombinasi satuan yang tidak konsisten ditolak sebelum dihitung." },
  { id: "geometry", name: "Geometri", title: "Kalkulator Geometri", description: "Luas, keliling, volume, luas permukaan, teorema Pythagoras, jarak dua titik, dan gradien garis.", intro: "Hasil geometri dipertahankan dalam bentuk eksak (misalnya 25π) sebelum didesimalkan, sehingga pembulatan terlihat jelas." },
  { id: "units", name: "Konversi Satuan", title: "Konversi Satuan", description: "Konversi satuan panjang, massa, suhu, luas, volume, kecepatan, tekanan, energi, daya, data, dan banyak lagi — dengan faktor eksak.", intro: "Faktor konversi disimpan secara eksak sesuai definisi resmi (misalnya 1 in = 0,0254 m tepat). Suhu ditangani sebagai konversi afin, dan satuan yang dimensinya berbeda ditolak." },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, Category>;

export interface Faq {
  q: string;
  a: string;
}

export type CalculatorKind =
  | { type: "solver"; mode?: Mode; examples: string[]; placeholder?: string }
  | { type: "formula"; formulaId: string }
  | { type: "tool"; tool: string; presets?: Array<{ label: string; values: Values }> }
  | { type: "units"; unitCategory?: string }
  | { type: "periodic-table" };

export interface Calculator {
  slug: string;
  category: CategoryId;
  title: string;
  /** Meta description (≈150 characters). */
  description: string;
  /** Short group heading on the category page. */
  topic: string;
  intro: string[];
  faq: Faq[];
  kind: CalculatorKind;
  keywords?: string[];
}

// ---------------------------------------------------------------------------
// Mathematics (presets of the general solver)
// ---------------------------------------------------------------------------

function math(slug: string, topic: string, title: string, description: string, examples: string[], intro: string[], faq: Faq[] = [], mode?: Mode, placeholder?: string): Calculator {
  return { slug, category: "math", title, description, topic, intro, faq, kind: { type: "solver", mode, examples, placeholder } };
}

const MATH: Calculator[] = [
  math("persamaan-linear", "Persamaan", "Kalkulator Persamaan Linear", "Selesaikan persamaan linear satu variabel langkah demi langkah: pindah ruas, kumpulkan suku sejenis, dan periksa jawaban dengan substitusi.", ["2x + 5 = 15", "3(x - 2) = 2x + 7", "x/4 + 1 = 3", "5 - 2(y + 1) = 3y"], [
    "Persamaan linear berbentuk ax + b = c. Strateginya: lakukan operasi yang sama pada kedua ruas sampai variabel sendirian di satu ruas.",
    "Kalkulator ini menampilkan setiap operasi (menjabarkan kurung, menjumlahkan suku sejenis, membagi kedua ruas) beserta alasannya, lalu memverifikasi jawaban dengan mensubstitusikannya ke persamaan awal.",
  ], [
    { q: "Bagaimana jika koefisien x menjadi nol?", a: "Jika setelah disederhanakan diperoleh 0 = 0, persamaan berlaku untuk semua bilangan real (identitas). Jika diperoleh 0 = c dengan c ≠ 0, persamaan tidak memiliki penyelesaian. Kalkulator akan melaporkan kedua kasus ini secara eksplisit." },
    { q: "Apakah hasilnya dalam bentuk pecahan?", a: "Ya. Mesin menghitung dengan bilangan rasional eksak, jadi 1/3 tetap 1/3 (bukan 0,333…). Hampiran desimal ditampilkan terpisah bila berguna." },
  ]),
  math("persamaan-kuadrat", "Persamaan", "Kalkulator Persamaan Kuadrat", "Cari akar persamaan kuadrat ax² + bx + c = 0 dengan faktorisasi, rumus ABC, atau melengkapkan kuadrat — lengkap dengan diskriminan dan verifikasi.", ["x^2 - 5x + 6 = 0", "2x^2 + 3x - 2 = 0", "x^2 + 2x + 5 = 0", "x^2 = 7"], [
    "Persamaan kuadrat ax² + bx + c = 0 (a ≠ 0) memiliki diskriminan D = b² − 4ac. Jika D > 0 ada dua akar real berbeda, D = 0 satu akar kembar, dan D < 0 dua akar kompleks sekawan.",
    "Kalkulator memilih metode yang paling sesuai (faktorisasi bila akarnya rasional, rumus ABC bila tidak) dan menampilkan metode lain pada tab Metode Lain. Akar ditulis eksak, misalnya (−3 ± √17)/4, lalu diverifikasi dengan substitusi.",
  ], [
    { q: "Apa itu rumus ABC?", a: "x = (−b ± √(b² − 4ac)) / (2a). Rumus ini selalu berlaku untuk persamaan kuadrat dan diturunkan dengan melengkapkan kuadrat." },
    { q: "Bagaimana jika diskriminan negatif?", a: "Akarnya bilangan kompleks: x = (−b ± i√(4ac − b²)) / (2a). Kalkulator menampilkannya dalam bentuk a + bi." },
  ]),
  math("persamaan-polinom", "Persamaan", "Kalkulator Persamaan Polinom (Kubik & Derajat Tinggi)", "Selesaikan persamaan kubik, kuartik, dan polinom derajat tinggi dengan teorema akar rasional, pembagian sintetik, dan metode numerik terverifikasi.", ["x^3 - 6x^2 + 11x - 6 = 0", "x^4 - 5x^2 + 4 = 0", "x^3 - 2 = 0", "x^5 - x - 1 = 0"], [
    "Untuk polinom berderajat tiga atau lebih, mesin mencari akar rasional dengan teorema akar rasional dan pembagian sintetik. Faktor kuadrat yang tersisa diselesaikan dengan rumus ABC secara eksak; faktor berderajat lebih tinggi yang tidak dapat difaktorkan diselesaikan dengan metode numerik Durand–Kerner.",
    "Akar numerik selalu diberi label hampiran dan diperiksa kembali dengan mengevaluasi polinom pada akar tersebut.",
  ]),
  math("persamaan-eksponen-logaritma", "Persamaan", "Kalkulator Persamaan Eksponen & Logaritma", "Selesaikan persamaan eksponen dan logaritma seperti 2^x = 32 atau log₂ x = 5 dengan sifat logaritma, lengkap dengan syarat domain.", ["2^x = 32", "log(x, 2) = 5", "e^(2x) = 7", "3^(x + 1) = 27"], [
    "Persamaan eksponen diselesaikan dengan mengambil logaritma kedua ruas; persamaan logaritma diselesaikan dengan mengubahnya ke bentuk eksponen.",
    "Syarat domain (numerus logaritma harus positif) diperiksa, sehingga akar yang tidak sah dibuang dan alasannya ditampilkan.",
  ]),
  math("persamaan-trigonometri", "Persamaan", "Kalkulator Persamaan Trigonometri", "Selesaikan persamaan trigonometri sin, cos, dan tan dengan penyelesaian umum (periodik) dan nilai-nilai sudut istimewa.", ["sin(x) = 1/2", "2cos(x) - 1 = 0", "tan(x) = 1", "sin(2x) = 0"], [
    "Persamaan trigonometri memiliki tak hingga banyak penyelesaian karena fungsi trigonometri periodik. Kalkulator menuliskan penyelesaian umum, misalnya x = π/6 + 2kπ, dengan k bilangan bulat.",
  ]),
  math("sistem-persamaan-linear", "Persamaan", "Kalkulator Sistem Persamaan Linear (SPLDV & SPLTV)", "Selesaikan sistem persamaan linear dua atau tiga variabel dengan eliminasi Gauss–Jordan, eliminasi-substitusi, atau aturan Cramer.", ["2x + y = 7; x - y = 2", "x + y + z = 6; 2x - y + z = 3; x + 2y - z = 2", "3a - 2b = 4; a + b = 3"], [
    "Pisahkan setiap persamaan dengan titik koma atau baris baru. Kalkulator menyusun matriks lengkap lalu mereduksinya dengan operasi baris elementer; setiap operasi baris ditampilkan.",
    "Sistem tanpa solusi atau dengan tak hingga banyak solusi dikenali dari bentuk eselon baris tereduksi dan dilaporkan dengan jelas.",
  ], [{ q: "Bagaimana cara menulis sistem persamaan?", a: "Tulis setiap persamaan dipisahkan titik koma, misalnya: 2x + y = 7; x - y = 2." }]),
  math("pertidaksamaan", "Persamaan", "Kalkulator Pertidaksamaan", "Selesaikan pertidaksamaan linear, kuadrat, dan rasional dengan garis bilangan dan uji tanda; hasil dalam notasi interval.", ["2x - 3 > 5", "x^2 - 4 < 0", "(x - 1)/(x + 2) >= 0", "x^2 - x - 6 >= 0"], [
    "Pertidaksamaan diselesaikan dengan mencari titik kritis (pembuat nol pembilang dan penyebut), lalu menguji tanda di setiap interval. Hasil ditulis dalam notasi interval dan himpunan.",
    "Ingat: mengalikan atau membagi dengan bilangan negatif membalik tanda pertidaksamaan — kalkulator menandai langkah ini.",
  ]),
  math("faktorisasi", "Aljabar", "Kalkulator Faktorisasi Aljabar", "Faktorkan polinom: faktor persekutuan, selisih kuadrat, trinomial kuadrat (metode AC), jumlah/selisih pangkat tiga, dan teorema akar rasional.", ["x^2 - 5x + 6", "x^3 - 8", "2x^2 + 7x + 3", "x^4 - 16"], [
    "Faktorisasi dilakukan di bilangan rasional. Setiap faktor diperiksa dengan mengalikan kembali seluruh faktor dan membandingkannya dengan bentuk awal.",
  ], [], "factor"),
  math("sederhanakan", "Aljabar", "Kalkulator Penyederhanaan Aljabar", "Sederhanakan ekspresi aljabar, pecahan aljabar, dan bentuk akar secara eksak, dengan pemeriksaan kesetaraan di setiap langkah.", ["(x^2 - 1)/(x - 1)", "sqrt(72)", "2x + 3x - x", "(a^2 b)^3 / (a b^2)"], [
    "Penyederhanaan memakai aturan aljabar standar (menggabungkan suku sejenis, sifat eksponen, mencoret faktor persekutuan). Pencoretan faktor disertai syarat, misalnya x ≠ 1.",
  ], [], "simplify"),
  math("jabarkan", "Aljabar", "Kalkulator Penjabaran (Ekspansi) Aljabar", "Jabarkan perkalian dan pangkat bentuk aljabar seperti (x + 2)³ atau (2x − 1)(x + 3) dengan sifat distributif dan binomial Newton.", ["(x + 2)^3", "(2x - 1)(x + 3)", "(a + b)^2", "(x - 1)(x^2 + x + 1)"], [
    "Penjabaran memakai sifat distributif dan teorema binomial. Hasil akhir diperiksa kesetaraannya dengan bentuk awal.",
  ], [], "expand"),
  math("pecahan", "Aritmetika", "Kalkulator Pecahan", "Hitung penjumlahan, pengurangan, perkalian, dan pembagian pecahan dengan hasil eksak dalam bentuk paling sederhana.", ["3/4 + 5/6", "(2/3) / (4/9)", "2/3 * 9/4 - 1/2", "1/2 + 1/3 + 1/6"], [
    "Pecahan dihitung dengan bilangan rasional eksak: penyebut disamakan memakai KPK, lalu hasil disederhanakan dengan FPB.",
  ]),
  math("akar-dan-pangkat", "Aritmetika", "Kalkulator Akar dan Pangkat", "Sederhanakan bentuk akar dan pangkat pecahan secara eksak: √50 + √18, 8^(2/3), dan rasionalisasi penyebut.", ["sqrt(50) + sqrt(18)", "8^(2/3)", "1/sqrt(2)", "cbrt(54)"], [
    "Bentuk akar disederhanakan dengan mengeluarkan faktor kuadrat sempurna. Pangkat pecahan a^(m/n) diartikan sebagai akar pangkat n dari a^m.",
  ]),
  math("trigonometri", "Aritmetika", "Kalkulator Trigonometri (Nilai Eksak)", "Hitung nilai sin, cos, tan dalam derajat atau radian dengan hasil eksak untuk sudut istimewa, misalnya sin 15° = (√6 − √2)/4.", ["sin(30°) + cos(60°)", "tan(pi/4)", "sin(pi/12)", "cos(135°)"], [
    "Gunakan simbol ° untuk derajat; tanpa simbol, sudut dianggap radian. Sudut kelipatan 15° (π/12) menghasilkan bentuk eksak.",
  ]),
  math("logaritma", "Aritmetika", "Kalkulator Logaritma", "Hitung logaritma basis berapa pun dengan sifat logaritma: log(8, 2), log 1000, ln e³, dan hasil eksak bila memungkinkan.", ["log(8, 2) + log(1000)", "ln(e^3)", "log(32, 4)", "log(5, 25)"], [
    "Tulis log(x, b) untuk logaritma x basis b, log(x) untuk basis 10, dan ln(x) untuk basis e.",
  ]),
  math("turunan", "Kalkulus", "Kalkulator Turunan", "Hitung turunan fungsi dengan aturan rantai, perkalian, dan pembagian — langkah demi langkah, diverifikasi dengan turunan numerik.", ["d/dx (x^3 sin(x))", "turunan ln(x^2 + 1)", "d/dx e^(2x) cos(x)", "d^2/dx^2 (x^4 - 3x^2)"], [
    "Setiap aturan turunan yang dipakai (aturan pangkat, rantai, perkalian, pembagian) ditampilkan beserta rumusnya.",
    "Hasil akhir diverifikasi dengan membandingkannya terhadap turunan numerik (ekstrapolasi Richardson) di beberapa titik.",
  ], [
    { q: "Bagaimana menulis turunan kedua?", a: "Gunakan d^2/dx^2 (f), misalnya d^2/dx^2 (x^4)." },
    { q: "Apakah bisa turunan parsial?", a: "Ya: tulis diff(f, y) untuk turunan terhadap y, variabel lain dianggap konstanta." },
  ], "derivative", "d/dx (x^2 sin(x))"),
  math("integral", "Kalkulus", "Kalkulator Integral", "Hitung integral tak tentu dengan substitusi, integral parsial, dan pecahan parsial — setiap antiturunan diverifikasi dengan menurunkannya kembali.", ["integral x^2 sin(x)", "integral 1/(x^2 + 1)", "integral x e^x", "integral 1/(x^2 - 1)"], [
    "Mesin mencoba tabel integral dasar, linearitas, substitusi, integral parsial, dan pecahan parsial. Antiturunan yang ditemukan selalu diperiksa dengan menurunkannya kembali.",
    "Jika tidak ada metode simbolik yang berhasil, kalkulator mengatakannya secara jujur — tidak menebak.",
  ], [{ q: "Mengapa ada + C?", a: "Antiturunan tidak tunggal: jika F′ = f, maka F + C juga antiturunan f untuk konstanta C sembarang." }], "integral", "integral x^2 e^x"),
  math("integral-tentu", "Kalkulus", "Kalkulator Integral Tentu", "Hitung integral tentu dan tak wajar (batas tak hingga) dengan Teorema Dasar Kalkulus, diverifikasi dengan kuadratur Gauss–Kronrod.", ["integral from 0 to pi of sin(x)", "∫_1^e ln(x) dx", "integral from 0 to inf of e^(-x)", "integral from -1 to 1 of x^2"], [
    "Tulis integral from a to b of f, integral f dari a sampai b, atau ∫_a^b f dx.",
    "Nilai eksak dari Teorema Dasar Kalkulus dibandingkan dengan integrasi numerik adaptif Gauss–Kronrod sebagai verifikasi independen.",
  ]),
  math("limit", "Kalkulus", "Kalkulator Limit", "Hitung limit fungsi di titik atau di tak hingga dengan substitusi, faktorisasi, aturan L'Hôpital, dan limit baku — dengan verifikasi numerik.", ["lim x->0 sin(x)/x", "lim x->inf (1 + 1/x)^x", "lim x->2 (x^2 - 4)/(x - 2)", "lim x->0+ x ln(x)"], [
    "Bentuk tak tentu (0/0, ∞/∞, 0·∞, 1^∞, …) dikenali dan diselesaikan dengan aturan yang sesuai. Limit sepihak ditulis dengan x->0+ atau x->0-.",
    "Hasil diperiksa dengan mengevaluasi fungsi pada barisan titik yang mendekati titik tujuan.",
  ]),
  math("deret-taylor", "Kalkulus", "Kalkulator Deret Taylor & Maclaurin", "Hitung polinom Taylor/Maclaurin orde n di sekitar titik mana pun, lengkap dengan turunan-turunan dan grafik pendekatannya.", ["taylor(e^x, x, 0, 5)", "taylor(sin(x), x, 0, 7)", "taylor(ln(x), x, 1, 4)", "taylor(1/(1 - x), x, 0, 4)"], [
    "Format: taylor(f, x, a, n) — fungsi f di sekitar x = a sampai orde n. Grafik menunjukkan fungsi asli dan polinom pendekatannya.",
  ]),
  math("titik-ekstrem", "Kalkulus", "Kalkulator Titik Stasioner & Ekstrem", "Cari titik kritis, maksimum dan minimum lokal fungsi dengan uji turunan pertama dan kedua.", ["extrema(x^3 - 3x)", "extrema(x^4 - 2x^2)", "extrema(x e^(-x))"], [
    "Titik kritis diperoleh dari f′(x) = 0; jenisnya ditentukan dengan uji turunan kedua (atau uji turunan pertama bila f″ = 0).",
  ]),
  math("turunan-implisit", "Kalkulus", "Kalkulator Turunan Implisit", "Hitung dy/dx dari persamaan implisit seperti x² + y² = 25 dengan menurunkan kedua ruas terhadap x.", ["implicit(x^2 + y^2 = 25)", "implicit(x^3 + y^3 = 6 x y)", "implicit(x y = 1)"], [
    "Kedua ruas diturunkan terhadap x dengan memperlakukan y sebagai fungsi x (aturan rantai), lalu dy/dx diisolasi.",
  ]),
  math("notasi-sigma", "Kalkulus", "Kalkulator Notasi Sigma & Deret", "Hitung jumlah deret dengan notasi sigma: rumus tertutup yang dibuktikan dengan induksi, deret geometri, dan deret tak hingga.", ["sum(k^2, k, 1, n)", "sum(1/k, k, 1, 10)", "sum((1/2)^k, k, 0, inf)", "sum(2k - 1, k, 1, n)"], [
    "Format: sum(suku, k, batas_bawah, batas_atas). Untuk suku polinom dengan batas atas n, rumus tertutup ditentukan lalu dibuktikan dengan induksi matematika oleh mesin.",
    "Deret geometri tak hingga dihitung bila |r| < 1; deret yang sukunya tidak menuju nol dinyatakan divergen.",
  ]),
  math("matriks", "Aljabar linear", "Kalkulator Matriks", "Hitung determinan, invers, transpose, rank, RREF, nilai dan vektor eigen, serta operasi matriks dengan langkah dan verifikasi.", ["det([[1, 2], [3, 4]])", "inv([[2, 1], [5, 3]])", "eigen([[4, 1], [2, 3]])", "rref([[1, 2, 3], [4, 5, 6], [7, 8, 10]])", "[[1, 2], [3, 4]] * [[0, 1], [1, 0]]"], [
    "Tulis matriks baris demi baris: [[1, 2], [3, 4]]. Fungsi yang tersedia: det, inv, transpose, rank, rref, trace, eigen, dot, cross, norm.",
    "Invers diverifikasi dengan A·A⁻¹ = I; nilai eigen diverifikasi dengan det(A − λI) = 0 dan A·v = λ·v.",
  ]),
  math("bilangan-kompleks", "Aljabar", "Kalkulator Bilangan Kompleks", "Hitung operasi bilangan kompleks, modulus, argumen, bentuk polar, dan pangkat dengan teorema De Moivre.", ["(3 + 4i)(1 - 2i)", "(1 + i)^8", "sqrt(-16)", "(2 + 3i)/(1 - i)"], [
    "Gunakan i untuk satuan imajiner (i² = −1). Hasil ditampilkan dalam bentuk a + bi dan bentuk polar r(cos θ + i sin θ).",
  ]),
  math("fpb-kpk", "Teori bilangan", "Kalkulator FPB dan KPK", "Hitung FPB (faktor persekutuan terbesar) dengan algoritma Euclid dan KPK untuk dua bilangan atau lebih.", ["gcd(84, 36)", "lcm(12, 18, 30)", "fpb(252, 105)", "kpk(4, 6, 10)"], [
    "FPB dihitung dengan algoritma Euclid (pembagian berulang); KPK dihitung dari hubungan KPK(a, b) = |a·b| / FPB(a, b).",
  ]),
  math("faktorisasi-prima", "Teori bilangan", "Kalkulator Faktorisasi Prima & Bilangan Prima", "Faktorkan bilangan menjadi faktor prima, uji apakah bilangan prima, dan daftar semua pembaginya.", ["primefactors(360)", "isprime(97)", "divisors(120)", "primefactors(1001)"], [
    "Uji prima memakai Miller–Rabin deterministik untuk bilangan hingga 3,3·10²⁴; faktorisasi memakai pembagian percobaan dan Pollard rho.",
  ]),
  math("aritmetika-modular", "Teori bilangan", "Kalkulator Aritmetika Modular", "Hitung invers modular dengan algoritma Euclid diperluas dan perpangkatan modular dengan kuadrat berulang.", ["modinv(17, 3120)", "modpow(4, 13, 497)", "modinv(3, 11)"], [
    "Invers a mod m ada jika dan hanya jika FPB(a, m) = 1. Perpangkatan modular dihitung dengan metode kuadrat-dan-kali yang efisien.",
  ]),
];

// ---------------------------------------------------------------------------
// Structured tools
// ---------------------------------------------------------------------------

function tool(category: CategoryId, slug: string, topic: string, toolId: string, title: string, description: string, intro: string[], faq: Faq[] = []): Calculator {
  return { slug, category, title, description, topic, intro, faq, kind: { type: "tool", tool: toolId } };
}

const TOOLS_PAGES: Calculator[] = [
  // chemistry
  tool("chemistry", "massa-molar", "Stoikiometri", "molar-mass", "Kalkulator Massa Molar (Mr)", "Hitung massa molar (Mr) senyawa dari rumus kimia, termasuk tanda kurung, hidrat, dan ion — dengan komposisi persen massa tiap unsur.", [
    "Massa molar adalah jumlah massa atom relatif semua atom dalam rumus. Kalkulator mengurai rumus (termasuk kurung bertingkat dan hidrat seperti CuSO4·5H2O) dan menampilkan kontribusi setiap unsur.",
  ], [{ q: "Dari mana nilai massa atom?", a: "Dari berat atom standar IUPAC/CIAAW (nilai konvensional untuk unsur yang beratnya bervariasi di alam)." }]),
  tool("chemistry", "penyetaraan-reaksi", "Reaksi", "balance", "Kalkulator Penyetaraan Reaksi Kimia", "Setarakan persamaan reaksi kimia secara otomatis dengan aljabar linear eksak, termasuk reaksi ion dan redoks.", [
    "Koefisien reaksi dicari sebagai ruang nol (null space) dari matriks jumlah atom tiap unsur, lalu diskalakan menjadi bilangan bulat terkecil. Hasil diverifikasi dengan menghitung ulang jumlah atom (dan muatan) di kedua ruas.",
  ], [{ q: "Bagaimana menulis ion?", a: "Tulis muatan setelah rumus, misalnya MnO4^-, Fe^3+, atau SO4^2-. Elektron ditulis e^-." }]),
  tool("chemistry", "rumus-empiris", "Stoikiometri", "empirical", "Kalkulator Rumus Empiris & Rumus Molekul", "Tentukan rumus empiris dari persen massa unsur, dan rumus molekul bila massa molar diketahui.", [
    "Persen massa diubah menjadi mol (anggap 100 g sampel), dibagi mol terkecil, lalu dikalikan faktor kecil agar menjadi bilangan bulat.",
  ]),
  tool("chemistry", "stoikiometri", "Stoikiometri", "stoichiometry", "Kalkulator Stoikiometri & Pereaksi Pembatas", "Hitung massa produk, pereaksi pembatas, dan sisa pereaksi dari persamaan reaksi dan massa zat yang diketahui.", [
    "Reaksi disetarakan terlebih dahulu. Massa diubah menjadi mol, pereaksi pembatas ditentukan dari perbandingan mol terhadap koefisien, lalu massa produk dihitung.",
  ]),
  tool("chemistry", "kalkulator-ph", "Asam–basa", "acid-ph", "Kalkulator pH Asam dan Basa", "Hitung pH dan pOH larutan asam/basa kuat maupun lemah dengan persamaan kesetimbangan yang tepat, termasuk larutan sangat encer.", [
    "Untuk asam/basa kuat, autoionisasi air diperhitungkan sehingga larutan sangat encer (misalnya 10⁻⁸ M HCl) tidak menghasilkan pH yang salah. Untuk asam/basa lemah, persamaan kuadrat kesetimbangan diselesaikan secara eksak, dengan hampiran √(Ka·C) sebagai metode lain.",
  ]),
  // statistics
  tool("statistics", "statistik-deskriptif", "Statistik deskriptif", "descriptive", "Kalkulator Statistik Deskriptif", "Hitung rata-rata, median, modus, varians, simpangan baku, kuartil, dan jangkauan data dengan langkah dan histogram.", [
    "Varians sampel memakai pembagi n − 1 dan varians populasi memakai n; keduanya ditampilkan. Kuartil memakai aturan letak p(n + 1) dengan interpolasi linear — konvensi yang umum di buku sekolah; perangkat lunak lain (misalnya Excel QUARTILE.INC) dapat memberi kuartil yang sedikit berbeda.",
  ]),
  tool("statistics", "regresi-linear", "Statistik deskriptif", "regression", "Kalkulator Regresi Linear & Korelasi", "Hitung persamaan garis regresi kuadrat terkecil, koefisien korelasi Pearson r, dan koefisien determinasi R² dari data berpasangan.", [
    "Kemiringan dan intersep dihitung eksak dari jumlah-jumlah Σx, Σy, Σxy, Σx². Diagram pencar menampilkan data dan garis regresi.",
  ]),
  tool("statistics", "distribusi-binomial", "Distribusi peluang", "binomial", "Kalkulator Distribusi Binomial", "Hitung peluang binomial P(X = k), P(X ≤ k), dan lainnya secara eksak, beserta rata-rata dan varians distribusi.", [
    "P(X = k) = C(n, k) pᵏ (1 − p)ⁿ⁻ᵏ dihitung dengan bilangan rasional eksak, lalu didesimalkan.",
  ]),
  tool("statistics", "distribusi-poisson", "Distribusi peluang", "poisson", "Kalkulator Distribusi Poisson", "Hitung peluang Poisson P(X = k) dan peluang kumulatif untuk rata-rata kejadian λ.", ["P(X = k) = e^(−λ) λᵏ / k!."]),
  tool("statistics", "distribusi-normal", "Distribusi peluang", "normal", "Kalkulator Distribusi Normal (Tabel Z)", "Hitung peluang distribusi normal P(X ≤ a), P(X ≥ a), dan P(a ≤ X ≤ b) melalui standardisasi z, dengan kurva yang diarsir.", [
    "Nilai dibakukan menjadi z = (x − μ)/σ, lalu peluang dihitung dengan fungsi galat (erf) berpresisi tinggi — pengganti tabel Z.",
  ]),
  tool("statistics", "nilai-z-invers-normal", "Distribusi peluang", "inverse-normal", "Kalkulator Invers Normal (Nilai Kritis z)", "Cari nilai x atau z sehingga P(X ≤ x) sama dengan peluang tertentu, misalnya z untuk 97,5% = 1,96.", ["Invers fungsi distribusi normal dihitung dengan algoritma Acklam yang dihaluskan dengan satu langkah Halley, lalu diverifikasi dengan menghitung balik peluangnya."]),
  tool("statistics", "uji-t-satu-sampel", "Uji hipotesis", "t-test", "Kalkulator Uji t Satu Sampel", "Lakukan uji t satu sampel: statistik t, derajat bebas, nilai-p, dan keputusan terhadap H₀ pada taraf α.", ["Nilai-p dihitung dari distribusi t Student melalui fungsi beta tak lengkap (bukan tabel)."]),
  tool("statistics", "interval-kepercayaan", "Uji hipotesis", "confidence-interval", "Kalkulator Interval Kepercayaan Rata-rata", "Hitung interval kepercayaan rata-rata populasi dengan distribusi z atau t, termasuk margin of error.", ["Jika simpangan baku populasi tidak diketahui (kasus umum), distribusi t dengan n − 1 derajat bebas digunakan."]),
  tool("statistics", "uji-t-dua-sampel", "Uji hipotesis", "t-test-2", "Kalkulator Uji t Dua Sampel (Welch)", "Bandingkan rata-rata dua kelompok independen dengan uji t Welch: statistik t, derajat bebas Welch–Satterthwaite, dan nilai-p.", ["Uji Welch tidak mengasumsikan varians kedua kelompok sama."]),
  tool("statistics", "uji-proporsi", "Uji hipotesis", "proportion-z", "Kalkulator Uji Proporsi (Uji z)", "Uji hipotesis proporsi satu populasi dengan pendekatan normal: statistik z dan nilai-p.", ["Syarat pendekatan normal (np₀ ≥ 10 dan n(1 − p₀) ≥ 10) diperiksa dan dilaporkan."]),
  tool("statistics", "uji-chi-kuadrat", "Uji hipotesis", "chi-square", "Kalkulator Uji Chi-Kuadrat Goodness of Fit", "Uji kecocokan frekuensi observasi dengan frekuensi harapan: statistik χ², derajat bebas, dan nilai-p.", ["Frekuensi harapan kurang dari 5 memicu peringatan karena pendekatan χ² menjadi kurang akurat."]),
  tool("statistics", "anova-satu-arah", "Uji hipotesis", "anova", "Kalkulator ANOVA Satu Arah", "Bandingkan rata-rata tiga kelompok atau lebih dengan ANOVA satu arah: tabel ANOVA, statistik F, dan nilai-p.", ["Jumlah kuadrat antar-kelompok dan dalam-kelompok dihitung, lalu F = MSB/MSW dibandingkan dengan distribusi F."]),
  tool("statistics", "distribusi-geometrik", "Distribusi peluang", "geometric", "Kalkulator Distribusi Geometrik", "Hitung peluang sukses pertama terjadi pada percobaan ke-k dengan distribusi geometrik.", ["P(X = k) = (1 − p)ᵏ⁻¹ p, dihitung eksak."]),
  tool("statistics", "distribusi-eksponensial", "Distribusi peluang", "exponential", "Kalkulator Distribusi Eksponensial", "Hitung peluang waktu tunggu dengan distribusi eksponensial berlaju λ.", ["P(X ≤ a) = 1 − e^(−λa)."]),
  // finance
  tool("finance", "bunga-sederhana", "Bunga", "simple-interest", "Kalkulator Bunga Sederhana", "Hitung bunga sederhana dan nilai akhir tabungan atau pinjaman dengan rumus I = P·r·t.", ["Bunga sederhana hanya dihitung dari pokok awal, tidak berbunga-berbunga."]),
  tool("finance", "bunga-majemuk", "Bunga", "compound-interest", "Kalkulator Bunga Majemuk", "Hitung nilai akhir investasi dengan bunga majemuk tahunan, bulanan, harian, atau kontinu, beserta tabel pertumbuhannya.", ["A = P(1 + r/m)^(m·t); untuk pemajemukan kontinu A = P·e^(r·t)."]),
  tool("finance", "cicilan-pinjaman", "Pinjaman", "loan", "Kalkulator Cicilan Pinjaman & KPR", "Hitung cicilan KPR, KTA, atau kredit kendaraan dengan metode anuitas, efektif, atau flat, lengkap dengan tabel angsuran.", [
    "Metode anuitas memberi cicilan tetap; metode efektif memberi pokok tetap dengan bunga menurun; metode flat menghitung bunga dari pokok awal. Tabel angsuran dihitung eksak lalu dibulatkan ke rupiah.",
  ], [{ q: "Mengapa total bunga flat lebih besar?", a: "Pada metode flat, bunga selalu dihitung dari pokok awal walaupun pokok sudah berkurang, sehingga bunga efektifnya lebih tinggi daripada suku bunga yang tertulis." }]),
  tool("finance", "npv", "Investasi", "npv", "Kalkulator NPV (Net Present Value)", "Hitung nilai sekarang bersih (NPV) arus kas investasi dengan tingkat diskonto tertentu.", ["NPV = Σ CFₜ/(1 + r)ᵗ. NPV > 0 berarti investasi menguntungkan pada tingkat diskonto tersebut."]),
  tool("finance", "irr", "Investasi", "irr", "Kalkulator IRR (Internal Rate of Return)", "Hitung tingkat pengembalian internal (IRR) arus kas dengan metode numerik terverifikasi.", ["IRR adalah tingkat diskonto yang membuat NPV = 0. Akar dicari secara numerik (metode Brent) pada rentang −99% sampai 1000%, lalu diverifikasi dengan menghitung NPV pada IRR. Jika ada lebih dari satu IRR, semuanya dilaporkan."]),
  tool("finance", "break-even", "Bisnis", "break-even", "Kalkulator Break-Even Point (BEP)", "Hitung titik impas dalam unit dan rupiah dari biaya tetap, harga jual, dan biaya variabel per unit.", ["BEP (unit) = Biaya tetap / (Harga − Biaya variabel per unit)."]),
  tool("finance", "depresiasi", "Bisnis", "depreciation", "Kalkulator Depresiasi (Penyusutan)", "Hitung penyusutan aset dengan metode garis lurus, saldo menurun, atau jumlah angka tahun, lengkap dengan jadwalnya.", ["Jadwal penyusutan menampilkan beban per tahun, akumulasi, dan nilai buku."]),
  tool("finance", "suku-bunga-riil", "Bunga", "real-rate", "Kalkulator Suku Bunga Riil (Persamaan Fisher)", "Hitung suku bunga riil dari suku bunga nominal dan inflasi dengan persamaan Fisher yang eksak.", ["(1 + nominal) = (1 + riil)(1 + inflasi); hampiran riil ≈ nominal − inflasi ditampilkan sebagai pembanding."]),
  tool("finance", "roi", "Investasi", "roi", "Kalkulator ROI (Return on Investment)", "Hitung ROI dalam persen dari nilai akhir dan biaya investasi.", ["ROI = (Nilai akhir − Biaya)/Biaya × 100%."]),
  tool("finance", "anuitas", "Investasi", "annuity", "Kalkulator Anuitas (Nilai Sekarang & Masa Depan)", "Hitung nilai sekarang (PV) dan nilai masa depan (FV) dari pembayaran berkala tetap, termasuk annuity due.", ["FV = PMT·((1 + i)ⁿ − 1)/i dan PV = PMT·(1 − (1 + i)⁻ⁿ)/i."]),
  // computer science
  tool("computer-science", "konversi-basis-bilangan", "Sistem bilangan", "base-conversion", "Kalkulator Konversi Bilangan Biner, Oktal, Desimal, Heksadesimal", "Konversi bilangan antar basis 2–36 termasuk pecahan, dengan langkah pembagian dan perkalian berulang.", ["Bagian bulat dikonversi dengan pembagian berulang; bagian pecahan dengan perkalian berulang. Pecahan berulang (misalnya 0,1 desimal dalam biner) dideteksi."]),
  tool("computer-science", "komplemen-dua", "Sistem bilangan", "twos-complement", "Kalkulator Komplemen Dua", "Ubah bilangan bulat bertanda ke representasi komplemen dua 4 hingga 64 bit, beserta langkah balik-bit-tambah-satu.", []),
  tool("computer-science", "operasi-bitwise", "Sistem bilangan", "bitwise", "Kalkulator Operasi Bitwise", "Hitung AND, OR, XOR, NOT, dan pergeseran bit dengan tampilan biner per bit.", []),
  tool("computer-science", "subnet-ipv4", "Jaringan", "subnet", "Kalkulator Subnet IPv4 (CIDR)", "Hitung alamat jaringan, broadcast, subnet mask, wildcard, rentang host, dan jumlah host dari alamat IPv4 dan prefix CIDR.", ["Perhitungan dilakukan dengan operasi bit pada alamat 32-bit."]),
  tool("computer-science", "base64", "Pengodean", "base64", "Encoder & Decoder Base64", "Enkode teks ke Base64 atau dekode Base64 ke teks (UTF-8), dengan langkah pengelompokan 6-bit.", []),
  tool("computer-science", "aljabar-boolean", "Logika", "boolean", "Kalkulator Aljabar Boolean & Tabel Kebenaran", "Buat tabel kebenaran dan sederhanakan ekspresi Boolean dengan metode Quine–McCluskey (bentuk SOP minimal).", ["Hasil penyederhanaan diverifikasi dengan membandingkan tabel kebenaran ekspresi awal dan akhir untuk semua kombinasi masukan."]),
];

// ---------------------------------------------------------------------------
// Formula calculators (generated from the formula registry)
// ---------------------------------------------------------------------------

const DOMAIN_TO_CATEGORY: Record<FormulaDomain, CategoryId> = { fisika: "physics", kimia: "chemistry", astronomi: "astronomy", teknik: "engineering", geometri: "geometry" };

function formulaCalculator(def: FormulaDef): Calculator {
  const solvable = def.variables.filter((v) => !v.constant);
  const names = solvable.map((v) => v.name).join(", ");
  const category = DOMAIN_TO_CATEGORY[def.domain];
  return {
    slug: def.id,
    category,
    topic: def.topic,
    title: `Kalkulator ${def.name}`,
    description: `${def.description} Hitung ${names} — dengan konversi satuan, analisis dimensi, langkah, dan verifikasi.`.slice(0, 300),
    intro: [
      `${def.description} Kalkulator ini dapat menyelesaikan rumus untuk variabel mana pun: pilih besaran yang dicari, isi besaran lain beserta satuannya.`,
      "Semua nilai dikonversi ke satuan SI, konsistensi dimensi diperiksa, lalu hasil diverifikasi dengan mensubstitusikannya kembali ke rumus.",
      ...(def.assumptions ?? []).map((a) => `Asumsi: ${a}`),
    ],
    faq: [
      { q: `Apa rumus ${def.name.toLowerCase()}?`, a: `Rumusnya ${def.equation.replace(/\*/g, "·")}, dengan ${def.variables.map((v) => `${v.s.replace(/_/g, "")} = ${v.name}${v.unit ? ` (${v.unit})` : ""}`).join(", ")}.` },
      { q: "Bisakah memakai satuan selain SI?", a: "Bisa. Setiap kolom menerima satuan yang dimensinya sesuai (misalnya km/h untuk kecepatan, g untuk massa); kalkulator mengonversinya secara eksak dan menolak satuan yang dimensinya salah." },
    ],
    kind: { type: "formula", formulaId: def.id },
    keywords: [def.name, def.topic, DOMAIN_LABELS[def.domain]],
  };
}

const FORMULA_PAGES = FORMULAS.map(formulaCalculator);

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const UNIT_PAGES: Calculator[] = [
  {
    slug: "konversi-satuan",
    category: "units",
    topic: "Umum",
    title: "Konversi Satuan Lengkap",
    description: "Konversi ratusan satuan: panjang, massa, suhu, luas, volume, kecepatan, tekanan, energi, daya, data, dan satuan gabungan seperti kg·m/s².",
    intro: [
      "Ketik satuan apa pun, termasuk satuan gabungan (misalnya kWh, N·m, km/h, g/cm^3). Mesin menguraikan satuan menjadi dimensi dasar SI, memastikan kedua satuan berdimensi sama, lalu mengalikan faktor konversi eksak.",
    ],
    faq: [
      { q: "Mengapa meter tidak bisa dikonversi ke kilogram?", a: "Karena dimensinya berbeda (panjang vs massa). Konversi hanya sah antara satuan berdimensi sama; kalkulator menjelaskan dimensi masing-masing satuan." },
      { q: "Seberapa akurat faktor konversinya?", a: "Faktor yang didefinisikan secara eksak (inci, pon, kalori termokimia, dll.) disimpan eksak. Faktor hasil pengukuran (misalnya satuan astronomi berbasis konstanta) diberi label bukan eksak." },
    ],
    kind: { type: "units" },
  },
  ...Object.keys(COMMON_UNITS).map((cat): Calculator => ({
    slug: `konversi-${slugify(cat)}`,
    category: "units",
    topic: "Per besaran",
    title: `Konversi Satuan ${cat.charAt(0).toUpperCase()}${cat.slice(1)}`,
    description: `Konversi satuan ${cat} (${COMMON_UNITS[cat].slice(0, 6).join(", ")}, …) dengan faktor eksak dan langkah perhitungan.`,
    intro: [`Pilih satuan ${cat} asal dan tujuan. Konversi dilakukan lewat satuan SI dengan faktor eksak, dan setiap langkah ditampilkan.`],
    faq: [],
    kind: { type: "units", unitCategory: cat },
  })),
];

const PERIODIC: Calculator = {
  slug: "tabel-periodik",
  category: "chemistry",
  topic: "Referensi",
  title: "Tabel Periodik Unsur Interaktif",
  description: "Tabel periodik 118 unsur dengan nomor atom, massa atom standar IUPAC, golongan, periode, dan kategori — klik unsur untuk detail.",
  intro: ["Data massa atom memakai berat atom standar IUPAC/CIAAW. Klik sebuah unsur untuk melihat detail dan menghitung massa molar senyawa yang mengandungnya."],
  faq: [],
  kind: { type: "periodic-table" },
};

export const CALCULATORS: Calculator[] = [...MATH, ...TOOLS_PAGES, PERIODIC, ...FORMULA_PAGES, ...UNIT_PAGES];

export function calculatorPath(c: Pick<Calculator, "category" | "slug">): string {
  return `/calculator/${c.category}/${c.slug}`;
}

export function findCalculator(category: string, slug: string): Calculator | undefined {
  return CALCULATORS.find((c) => c.category === category && c.slug === slug);
}

export function calculatorsIn(category: CategoryId): Calculator[] {
  return CALCULATORS.filter((c) => c.category === category);
}
