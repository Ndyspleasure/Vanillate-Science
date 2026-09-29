/**
 * Units and dimensions engine.
 *
 * Dimensions are vectors over the SI base quantities (length, mass, time, electric current,
 * thermodynamic temperature, amount of substance, luminous intensity) plus a pseudo-base for
 * information (bit). Conversion factors are exact expressions (rationals, or π for angles)
 * whenever the unit is exactly defined; measured values are marked `exact: false`.
 *
 * References: BIPM SI Brochure (9th ed., 2019); NIST SP 811 (2008), Appendix B.
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { div, mul, num, pow, PI } from "../expr/simplify";
import type { Expr } from "../expr/types";

export const BASE_DIMS = ["L", "M", "T", "I", "Θ", "N", "J", "D"] as const;
export type Dim = number[]; // length 8

export const DIMLESS: Dim = [0, 0, 0, 0, 0, 0, 0, 0];

export function dimMul(a: Dim, b: Dim): Dim {
  return a.map((v, i) => v + b[i]);
}
export function dimPow(a: Dim, k: number): Dim {
  return a.map((v) => v * k);
}
export function dimEquals(a: Dim, b: Dim): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) < 1e-12);
}
export function isDimensionless(a: Dim): boolean {
  return a.every((v) => Math.abs(v) < 1e-12);
}

const SUPERS: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  ".": "·",
  "/": "ᐟ",
};
function sup(n: number): string {
  return String(n)
    .split("")
    .map((c) => SUPERS[c] ?? c)
    .join("");
}

export function dimToString(d: Dim): string {
  if (isDimensionless(d)) return "tak berdimensi";
  return BASE_DIMS.map((b, i) => (d[i] === 0 ? "" : d[i] === 1 ? b : `${b}${sup(d[i])}`))
    .filter(Boolean)
    .join(" ");
}

export function dimToLatex(d: Dim): string {
  if (isDimensionless(d)) return "1";
  return BASE_DIMS.map((b, i) =>
    d[i] === 0 ? "" : d[i] === 1 ? `\\mathsf{${b}}` : `\\mathsf{${b}}^{${d[i]}}`,
  )
    .filter(Boolean)
    .join("\\,");
}

function D(L = 0, M = 0, T = 0, I = 0, Th = 0, N = 0, J = 0, Dt = 0): Dim {
  return [L, M, T, I, Th, N, J, Dt];
}

export const DIMS = {
  length: D(1),
  mass: D(0, 1),
  time: D(0, 0, 1),
  current: D(0, 0, 0, 1),
  temperature: D(0, 0, 0, 0, 1),
  amount: D(0, 0, 0, 0, 0, 1),
  luminous: D(0, 0, 0, 0, 0, 0, 1),
  information: D(0, 0, 0, 0, 0, 0, 0, 1),
  area: D(2),
  volume: D(3),
  speed: D(1, 0, -1),
  acceleration: D(1, 0, -2),
  force: D(1, 1, -2),
  pressure: D(-1, 1, -2),
  energy: D(2, 1, -2),
  power: D(2, 1, -3),
  frequency: D(0, 0, -1),
  charge: D(0, 0, 1, 1),
  voltage: D(2, 1, -3, -1),
  resistance: D(2, 1, -3, -2),
  conductance: D(-2, -1, 3, 2),
  capacitance: D(-2, -1, 4, 2),
  inductance: D(2, 1, -2, -2),
  magneticFlux: D(2, 1, -2, -1),
  magneticField: D(0, 1, -2, -1),
  density: D(-3, 1),
  dynamicViscosity: D(-1, 1, -1),
  kinematicViscosity: D(2, 0, -1),
  concentration: D(-3, 0, 0, 0, 0, 1),
  molality: D(0, -1, 0, 0, 0, 1),
  momentum: D(1, 1, -1),
  torque: D(2, 1, -2),
  angularVelocity: D(0, 0, -1),
  dimensionless: DIMLESS,
  dataRate: D(0, 0, -1, 0, 0, 0, 0, 1),
  specificHeat: D(2, 0, -2, 0, -1),
  molarMass: D(0, 1, 0, 0, 0, -1),
};

export type Category =
  | "panjang"
  | "massa"
  | "waktu"
  | "suhu"
  | "luas"
  | "volume"
  | "kecepatan"
  | "percepatan"
  | "gaya"
  | "tekanan"
  | "energi"
  | "daya"
  | "frekuensi"
  | "muatan"
  | "tegangan"
  | "arus"
  | "hambatan"
  | "konduktansi"
  | "kapasitansi"
  | "induktansi"
  | "fluks magnet"
  | "medan magnet"
  | "massa jenis"
  | "viskositas dinamis"
  | "viskositas kinematik"
  | "konsentrasi"
  | "jumlah zat"
  | "sudut"
  | "data"
  | "laju data"
  | "torsi"
  | "momentum"
  | "intensitas cahaya"
  | "kecepatan sudut"
  | "rasio"
  | "kalor jenis"
  | "massa molar"
  | "molalitas";

export interface UnitDef {
  symbol: string;
  name: string;
  dim: Dim;
  /** Multiply a value in this unit by `factor` to get the coherent SI value. */
  factor: Expr;
  /** Affine offset (in SI units) for absolute temperatures: SI = value·factor + offset. */
  offset?: Expr;
  exact: boolean;
  category: Category;
  prefixable?: "si" | "si+binary" | false;
  aliases?: string[];
  latex?: string;
  note?: string;
}

const R = (s: string) => {
  const r = s.includes("/")
    ? Rational.parseDecimal(s.split("/")[0])!.div(Rational.parseDecimal(s.split("/")[1])!)
    : Rational.parseDecimal(s)!;
  return num(r);
};

// Exact derived factors
const LB = Rational.parseDecimal("0.45359237")!;
const IN = Rational.parseDecimal("0.0254")!;
const FT = Rational.parseDecimal("0.3048")!;
const GN = Rational.parseDecimal("9.80665")!;
const LBF = LB.mul(GN); // 4.4482216152605 N (exact)
const PSI = LBF.div(IN.mul(IN));
const AU = Rational.parseDecimal("149597870700")!;
const JULIAN_YEAR = Rational.of(31557600n);
const C_LIGHT = Rational.of(299792458n);
const HP_MECH = FT.mul(LBF).mul(Rational.of(550)); // 550 ft·lbf/s
const US_GALLON = Rational.parseDecimal("0.003785411784")!;

export const UNITS: UnitDef[] = [
  // length
  {
    symbol: "m",
    name: "meter",
    dim: DIMS.length,
    factor: num(1),
    exact: true,
    category: "panjang",
    prefixable: "si",
    aliases: ["meter", "metre"],
  },
  {
    symbol: "in",
    name: "inci",
    dim: DIMS.length,
    factor: num(IN),
    exact: true,
    category: "panjang",
    aliases: ["inch", "inci", "″"],
  },
  {
    symbol: "ft",
    name: "kaki (feet)",
    dim: DIMS.length,
    factor: num(FT),
    exact: true,
    category: "panjang",
    aliases: ["feet", "foot", "kaki"],
  },
  {
    symbol: "yd",
    name: "yard",
    dim: DIMS.length,
    factor: R("0.9144"),
    exact: true,
    category: "panjang",
    aliases: ["yard"],
  },
  {
    symbol: "mi",
    name: "mil (statute mile)",
    dim: DIMS.length,
    factor: R("1609.344"),
    exact: true,
    category: "panjang",
    aliases: ["mile", "mil"],
  },
  {
    symbol: "nmi",
    name: "mil laut",
    dim: DIMS.length,
    factor: num(1852),
    exact: true,
    category: "panjang",
    aliases: ["mil laut", "nautical mile"],
  },
  {
    symbol: "Å",
    name: "angstrom",
    dim: DIMS.length,
    factor: R("1e-10"),
    exact: true,
    category: "panjang",
    aliases: ["angstrom", "A0"],
  },
  {
    symbol: "au",
    name: "satuan astronomi",
    dim: DIMS.length,
    factor: num(AU),
    exact: true,
    category: "panjang",
    aliases: ["AU", "SA"],
    note: "Didefinisikan eksak oleh IAU 2012 (Resolusi B2).",
  },
  {
    symbol: "ly",
    name: "tahun cahaya",
    dim: DIMS.length,
    factor: num(C_LIGHT.mul(JULIAN_YEAR)),
    exact: true,
    category: "panjang",
    aliases: ["lightyear", "tahun cahaya", "tc"],
    note: "c × satu tahun Julian (365,25 hari).",
  },
  {
    symbol: "pc",
    name: "parsec",
    dim: DIMS.length,
    factor: div(mul(num(648000), num(AU)), PI),
    exact: true,
    category: "panjang",
    prefixable: "si",
    aliases: ["parsec"],
    note: "1 pc = (648000/π) au (IAU 2015 Resolusi B2).",
  },
  // mass
  {
    symbol: "g",
    name: "gram",
    dim: DIMS.mass,
    factor: R("0.001"),
    exact: true,
    category: "massa",
    prefixable: "si",
    aliases: ["gram", "gr"],
  },
  {
    symbol: "t",
    name: "ton (metrik)",
    dim: DIMS.mass,
    factor: num(1000),
    exact: true,
    category: "massa",
    aliases: ["ton", "tonne"],
  },
  {
    symbol: "kuintal",
    name: "kuintal",
    dim: DIMS.mass,
    factor: num(100),
    exact: true,
    category: "massa",
    aliases: ["kwintal"],
  },
  {
    symbol: "ons",
    name: "ons (Indonesia, 100 g)",
    dim: DIMS.mass,
    factor: R("0.1"),
    exact: true,
    category: "massa",
    aliases: [],
  },
  {
    symbol: "lb",
    name: "pon (pound)",
    dim: DIMS.mass,
    factor: num(LB),
    exact: true,
    category: "massa",
    aliases: ["pound", "lbs"],
  },
  {
    symbol: "oz",
    name: "ounce (avoirdupois)",
    dim: DIMS.mass,
    factor: num(LB.div(Rational.of(16))),
    exact: true,
    category: "massa",
    aliases: ["ounce"],
  },
  {
    symbol: "ct",
    name: "karat",
    dim: DIMS.mass,
    factor: R("0.0002"),
    exact: true,
    category: "massa",
    aliases: ["carat", "karat"],
  },
  {
    symbol: "Da",
    name: "dalton (u)",
    dim: DIMS.mass,
    factor: R("1.66053906660e-27"),
    exact: false,
    category: "massa",
    aliases: ["u", "amu"],
    note: "CODATA 2018 (terukur).",
  },
  // time
  {
    symbol: "s",
    name: "detik",
    dim: DIMS.time,
    factor: num(1),
    exact: true,
    category: "waktu",
    prefixable: "si",
    aliases: ["sec", "detik", "second", "sekon"],
  },
  {
    symbol: "min",
    name: "menit",
    dim: DIMS.time,
    factor: num(60),
    exact: true,
    category: "waktu",
    aliases: ["menit", "minute"],
  },
  {
    symbol: "h",
    name: "jam",
    dim: DIMS.time,
    factor: num(3600),
    exact: true,
    category: "waktu",
    aliases: ["jam", "hour", "hr"],
  },
  {
    symbol: "d",
    name: "hari",
    dim: DIMS.time,
    factor: num(86400),
    exact: true,
    category: "waktu",
    aliases: ["hari", "day"],
  },
  {
    symbol: "wk",
    name: "minggu",
    dim: DIMS.time,
    factor: num(604800),
    exact: true,
    category: "waktu",
    aliases: ["minggu", "week", "pekan"],
  },
  {
    symbol: "yr",
    name: "tahun (Julian)",
    dim: DIMS.time,
    factor: num(JULIAN_YEAR),
    exact: true,
    category: "waktu",
    aliases: ["tahun", "year", "a"],
    note: "Tahun Julian = 365,25 hari.",
  },
  // temperature
  {
    symbol: "K",
    name: "kelvin",
    dim: DIMS.temperature,
    factor: num(1),
    exact: true,
    category: "suhu",
    prefixable: "si",
    aliases: ["kelvin"],
  },
  {
    symbol: "°C",
    name: "derajat Celsius",
    dim: DIMS.temperature,
    factor: num(1),
    offset: R("273.15"),
    exact: true,
    category: "suhu",
    aliases: ["C", "degC", "celsius", "oC"],
    latex: "{}^{\\circ}\\mathrm{C}",
  },
  {
    symbol: "°F",
    name: "derajat Fahrenheit",
    dim: DIMS.temperature,
    factor: R("5/9"),
    offset: num(Rational.parseDecimal("459.67")!.mul(Rational.of(5, 9))),
    exact: true,
    category: "suhu",
    aliases: ["F", "degF", "fahrenheit", "oF"],
    latex: "{}^{\\circ}\\mathrm{F}",
  },
  {
    symbol: "°R",
    name: "derajat Rankine",
    dim: DIMS.temperature,
    factor: R("5/9"),
    exact: true,
    category: "suhu",
    aliases: ["degR", "rankine"],
    latex: "{}^{\\circ}\\mathrm{R}",
  },
  {
    symbol: "°Ré",
    name: "derajat Réaumur",
    dim: DIMS.temperature,
    factor: R("5/4"),
    offset: R("273.15"),
    exact: true,
    category: "suhu",
    aliases: ["reaumur", "Re"],
    latex: "{}^{\\circ}\\mathrm{R\\acute{e}}",
  },
  // area
  {
    symbol: "ha",
    name: "hektare",
    dim: DIMS.area,
    factor: num(10000),
    exact: true,
    category: "luas",
    aliases: ["hektar", "hectare"],
  },
  {
    symbol: "are",
    name: "are",
    dim: DIMS.area,
    factor: num(100),
    exact: true,
    category: "luas",
    aliases: ["ar"],
  },
  {
    symbol: "acre",
    name: "ekar",
    dim: DIMS.area,
    factor: num(FT.mul(FT).mul(Rational.of(43560))),
    exact: true,
    category: "luas",
    aliases: ["ekar"],
  },
  // volume
  {
    symbol: "L",
    name: "liter",
    dim: DIMS.volume,
    factor: R("0.001"),
    exact: true,
    category: "volume",
    prefixable: "si",
    aliases: ["l", "liter", "litre"],
  },
  {
    symbol: "cc",
    name: "sentimeter kubik",
    dim: DIMS.volume,
    factor: R("1e-6"),
    exact: true,
    category: "volume",
    aliases: [],
  },
  {
    symbol: "gal",
    name: "galon (AS)",
    dim: DIMS.volume,
    factor: num(US_GALLON),
    exact: true,
    category: "volume",
    aliases: ["gallon", "galon"],
  },
  {
    symbol: "qt",
    name: "quart (AS)",
    dim: DIMS.volume,
    factor: num(US_GALLON.div(Rational.of(4))),
    exact: true,
    category: "volume",
    aliases: ["quart"],
  },
  {
    symbol: "pt",
    name: "pint (AS)",
    dim: DIMS.volume,
    factor: num(US_GALLON.div(Rational.of(8))),
    exact: true,
    category: "volume",
    aliases: ["pint"],
  },
  {
    symbol: "cup",
    name: "cangkir (AS)",
    dim: DIMS.volume,
    factor: num(US_GALLON.div(Rational.of(16))),
    exact: true,
    category: "volume",
    aliases: ["cangkir"],
  },
  {
    symbol: "floz",
    name: "fluid ounce (AS)",
    dim: DIMS.volume,
    factor: num(US_GALLON.div(Rational.of(128))),
    exact: true,
    category: "volume",
    aliases: ["fl_oz"],
  },
  {
    symbol: "bbl",
    name: "barel minyak",
    dim: DIMS.volume,
    factor: num(US_GALLON.mul(Rational.of(42))),
    exact: true,
    category: "volume",
    aliases: ["barrel", "barel"],
  },
  // speed & acceleration
  {
    symbol: "kph",
    name: "kilometer per jam",
    dim: DIMS.speed,
    factor: R("1000/3600"),
    exact: true,
    category: "kecepatan",
    aliases: ["kmh", "kmph"],
  },
  {
    symbol: "mph",
    name: "mil per jam",
    dim: DIMS.speed,
    factor: R("0.44704"),
    exact: true,
    category: "kecepatan",
    aliases: [],
  },
  {
    symbol: "kn",
    name: "knot",
    dim: DIMS.speed,
    factor: num(Rational.of(1852, 3600)),
    exact: true,
    category: "kecepatan",
    aliases: ["knot", "knots"],
  },
  {
    symbol: "c0",
    name: "kecepatan cahaya",
    dim: DIMS.speed,
    factor: num(C_LIGHT),
    exact: true,
    category: "kecepatan",
    aliases: ["c_light"],
    latex: "c",
  },
  {
    symbol: "gn",
    name: "gravitasi standar",
    dim: DIMS.acceleration,
    factor: num(GN),
    exact: true,
    category: "percepatan",
    aliases: ["g0", "gee"],
    latex: "g_n",
  },
  {
    symbol: "Gal",
    name: "gal (galileo)",
    dim: DIMS.acceleration,
    factor: R("0.01"),
    exact: true,
    category: "percepatan",
    aliases: ["galileo"],
  },
  // force
  {
    symbol: "N",
    name: "newton",
    dim: DIMS.force,
    factor: num(1),
    exact: true,
    category: "gaya",
    prefixable: "si",
    aliases: ["newton"],
  },
  {
    symbol: "dyn",
    name: "dyne",
    dim: DIMS.force,
    factor: R("1e-5"),
    exact: true,
    category: "gaya",
    aliases: ["dyne"],
  },
  {
    symbol: "kgf",
    name: "kilogram-gaya",
    dim: DIMS.force,
    factor: num(GN),
    exact: true,
    category: "gaya",
    aliases: ["kgw"],
  },
  {
    symbol: "lbf",
    name: "pound-force",
    dim: DIMS.force,
    factor: num(LBF),
    exact: true,
    category: "gaya",
    aliases: [],
  },
  // pressure
  {
    symbol: "Pa",
    name: "pascal",
    dim: DIMS.pressure,
    factor: num(1),
    exact: true,
    category: "tekanan",
    prefixable: "si",
    aliases: ["pascal"],
  },
  {
    symbol: "bar",
    name: "bar",
    dim: DIMS.pressure,
    factor: num(100000),
    exact: true,
    category: "tekanan",
    prefixable: "si",
    aliases: [],
  },
  {
    symbol: "atm",
    name: "atmosfer standar",
    dim: DIMS.pressure,
    factor: num(101325),
    exact: true,
    category: "tekanan",
    aliases: ["atmosfer"],
  },
  {
    symbol: "mmHg",
    name: "milimeter raksa",
    dim: DIMS.pressure,
    factor: R("133.322387415"),
    exact: true,
    category: "tekanan",
    aliases: ["mmhg"],
    note: "Nilai konvensional (NIST SP 811).",
  },
  {
    symbol: "Torr",
    name: "torr",
    dim: DIMS.pressure,
    factor: num(Rational.of(101325, 760)),
    exact: true,
    category: "tekanan",
    aliases: ["torr"],
  },
  {
    symbol: "psi",
    name: "pound per inci persegi",
    dim: DIMS.pressure,
    factor: num(PSI),
    exact: true,
    category: "tekanan",
    aliases: [],
  },
  // energy
  {
    symbol: "J",
    name: "joule",
    dim: DIMS.energy,
    factor: num(1),
    exact: true,
    category: "energi",
    prefixable: "si",
    aliases: ["joule"],
  },
  {
    symbol: "cal",
    name: "kalori (termokimia)",
    dim: DIMS.energy,
    factor: R("4.184"),
    exact: true,
    category: "energi",
    prefixable: "si",
    aliases: ["kalori"],
  },
  {
    symbol: "eV",
    name: "elektronvolt",
    dim: DIMS.energy,
    factor: R("1.602176634e-19"),
    exact: true,
    category: "energi",
    prefixable: "si",
    aliases: [],
    note: "Eksak sejak redefinisi SI 2019.",
  },
  {
    symbol: "Wh",
    name: "watt-jam",
    dim: DIMS.energy,
    factor: num(3600),
    exact: true,
    category: "energi",
    prefixable: "si",
    aliases: [],
  },
  {
    symbol: "BTU",
    name: "British thermal unit (IT)",
    dim: DIMS.energy,
    factor: R("1055.05585262"),
    exact: true,
    category: "energi",
    aliases: ["Btu"],
  },
  {
    symbol: "erg",
    name: "erg",
    dim: DIMS.energy,
    factor: R("1e-7"),
    exact: true,
    category: "energi",
    aliases: [],
  },
  // power
  {
    symbol: "W",
    name: "watt",
    dim: DIMS.power,
    factor: num(1),
    exact: true,
    category: "daya",
    prefixable: "si",
    aliases: ["watt"],
  },
  {
    symbol: "hp",
    name: "daya kuda (mekanik)",
    dim: DIMS.power,
    factor: num(HP_MECH),
    exact: true,
    category: "daya",
    aliases: ["HP"],
  },
  {
    symbol: "PK",
    name: "tenaga kuda metrik (PS/PK)",
    dim: DIMS.power,
    factor: R("735.49875"),
    exact: true,
    category: "daya",
    aliases: ["PS", "pk"],
  },
  // frequency & rotation
  {
    symbol: "Hz",
    name: "hertz",
    dim: DIMS.frequency,
    factor: num(1),
    exact: true,
    category: "frekuensi",
    prefixable: "si",
    aliases: ["hertz"],
  },
  {
    symbol: "rpm",
    name: "putaran per menit",
    dim: DIMS.frequency,
    factor: num(Rational.of(1, 60)),
    exact: true,
    category: "frekuensi",
    aliases: ["RPM"],
    note: "Frekuensi putaran (bukan kecepatan sudut rad/s).",
  },
  // electricity & magnetism
  {
    symbol: "C",
    name: "coulomb",
    dim: DIMS.charge,
    factor: num(1),
    exact: true,
    category: "muatan",
    prefixable: "si",
    aliases: ["coulomb"],
  },
  {
    symbol: "Ah",
    name: "ampere-jam",
    dim: DIMS.charge,
    factor: num(3600),
    exact: true,
    category: "muatan",
    prefixable: "si",
    aliases: [],
  },
  {
    symbol: "A",
    name: "ampere",
    dim: DIMS.current,
    factor: num(1),
    exact: true,
    category: "arus",
    prefixable: "si",
    aliases: ["ampere", "amp"],
  },
  {
    symbol: "V",
    name: "volt",
    dim: DIMS.voltage,
    factor: num(1),
    exact: true,
    category: "tegangan",
    prefixable: "si",
    aliases: ["volt"],
  },
  {
    symbol: "Ω",
    name: "ohm",
    dim: DIMS.resistance,
    factor: num(1),
    exact: true,
    category: "hambatan",
    prefixable: "si",
    aliases: ["ohm", "Ohm"],
  },
  {
    symbol: "S",
    name: "siemens",
    dim: DIMS.conductance,
    factor: num(1),
    exact: true,
    category: "konduktansi",
    prefixable: "si",
    aliases: ["siemens"],
  },
  {
    symbol: "F",
    name: "farad",
    dim: DIMS.capacitance,
    factor: num(1),
    exact: true,
    category: "kapasitansi",
    prefixable: "si",
    aliases: ["farad"],
  },
  {
    symbol: "H",
    name: "henry",
    dim: DIMS.inductance,
    factor: num(1),
    exact: true,
    category: "induktansi",
    prefixable: "si",
    aliases: ["henry"],
  },
  {
    symbol: "Wb",
    name: "weber",
    dim: DIMS.magneticFlux,
    factor: num(1),
    exact: true,
    category: "fluks magnet",
    prefixable: "si",
    aliases: ["weber"],
  },
  {
    symbol: "T",
    name: "tesla",
    dim: DIMS.magneticField,
    factor: num(1),
    exact: true,
    category: "medan magnet",
    prefixable: "si",
    aliases: ["tesla"],
  },
  {
    symbol: "G",
    name: "gauss",
    dim: DIMS.magneticField,
    factor: R("1e-4"),
    exact: true,
    category: "medan magnet",
    aliases: ["gauss"],
  },
  // amount, luminous
  {
    symbol: "mol",
    name: "mol",
    dim: DIMS.amount,
    factor: num(1),
    exact: true,
    category: "jumlah zat",
    prefixable: "si",
    aliases: ["mole"],
  },
  {
    symbol: "M",
    name: "molar (mol/L)",
    dim: DIMS.concentration,
    factor: num(1000),
    exact: true,
    category: "konsentrasi",
    prefixable: "si",
    aliases: ["molar"],
  },
  {
    symbol: "molal",
    name: "molal (mol/kg)",
    dim: DIMS.molality,
    factor: num(1),
    exact: true,
    category: "molalitas",
    aliases: [],
  },
  {
    symbol: "cd",
    name: "kandela",
    dim: DIMS.luminous,
    factor: num(1),
    exact: true,
    category: "intensitas cahaya",
    prefixable: "si",
    aliases: ["candela"],
  },
  // viscosity
  {
    symbol: "P",
    name: "poise",
    dim: DIMS.dynamicViscosity,
    factor: R("0.1"),
    exact: true,
    category: "viskositas dinamis",
    prefixable: "si",
    aliases: ["poise"],
  },
  {
    symbol: "St",
    name: "stokes",
    dim: DIMS.kinematicViscosity,
    factor: R("1e-4"),
    exact: true,
    category: "viskositas kinematik",
    prefixable: "si",
    aliases: ["stokes"],
  },
  // angle (dimensionless)
  {
    symbol: "rad",
    name: "radian",
    dim: DIMLESS,
    factor: num(1),
    exact: true,
    category: "sudut",
    prefixable: "si",
    aliases: ["radian"],
  },
  {
    symbol: "°",
    name: "derajat",
    dim: DIMLESS,
    factor: div(PI, num(180)),
    exact: true,
    category: "sudut",
    aliases: ["deg", "derajat", "degree"],
    latex: "^{\\circ}",
  },
  {
    symbol: "grad",
    name: "gradian",
    dim: DIMLESS,
    factor: div(PI, num(200)),
    exact: true,
    category: "sudut",
    aliases: ["gon"],
  },
  {
    symbol: "rev",
    name: "putaran",
    dim: DIMLESS,
    factor: mul(num(2), PI),
    exact: true,
    category: "sudut",
    aliases: ["putaran", "turn"],
  },
  {
    symbol: "arcmin",
    name: "menit busur",
    dim: DIMLESS,
    factor: div(PI, num(10800)),
    exact: true,
    category: "sudut",
    aliases: ["′"],
  },
  {
    symbol: "arcsec",
    name: "detik busur",
    dim: DIMLESS,
    factor: div(PI, num(648000)),
    exact: true,
    category: "sudut",
    aliases: ["″"],
  },
  // ratios
  {
    symbol: "%",
    name: "persen",
    dim: DIMLESS,
    factor: R("0.01"),
    exact: true,
    category: "rasio",
    aliases: ["persen", "percent"],
  },
  {
    symbol: "ppm",
    name: "bagian per sejuta",
    dim: DIMLESS,
    factor: R("1e-6"),
    exact: true,
    category: "rasio",
    aliases: [],
  },
  {
    symbol: "ppb",
    name: "bagian per miliar",
    dim: DIMLESS,
    factor: R("1e-9"),
    exact: true,
    category: "rasio",
    aliases: [],
  },
  // information
  {
    symbol: "bit",
    name: "bit",
    dim: DIMS.information,
    factor: num(1),
    exact: true,
    category: "data",
    prefixable: "si+binary",
    aliases: ["b", "bits"],
  },
  {
    symbol: "B",
    name: "byte",
    dim: DIMS.information,
    factor: num(8),
    exact: true,
    category: "data",
    prefixable: "si+binary",
    aliases: ["byte", "bytes"],
  },
  {
    symbol: "bps",
    name: "bit per detik",
    dim: DIMS.dataRate,
    factor: num(1),
    exact: true,
    category: "laju data",
    prefixable: "si",
    aliases: [],
  },
];

export interface Prefix {
  symbol: string;
  name: string;
  factor: Rational;
  binary?: boolean;
}

export const PREFIXES: Prefix[] = [
  { symbol: "Q", name: "quetta", factor: Rational.of(10n ** 30n) },
  { symbol: "R", name: "ronna", factor: Rational.of(10n ** 27n) },
  { symbol: "Y", name: "yotta", factor: Rational.of(10n ** 24n) },
  { symbol: "Z", name: "zetta", factor: Rational.of(10n ** 21n) },
  { symbol: "E", name: "exa", factor: Rational.of(10n ** 18n) },
  { symbol: "P", name: "peta", factor: Rational.of(10n ** 15n) },
  { symbol: "T", name: "tera", factor: Rational.of(10n ** 12n) },
  { symbol: "G", name: "giga", factor: Rational.of(10n ** 9n) },
  { symbol: "M", name: "mega", factor: Rational.of(10n ** 6n) },
  { symbol: "k", name: "kilo", factor: Rational.of(1000n) },
  { symbol: "h", name: "hekto", factor: Rational.of(100n) },
  { symbol: "da", name: "deka", factor: Rational.of(10n) },
  { symbol: "d", name: "desi", factor: Rational.of(1n, 10n) },
  { symbol: "c", name: "senti", factor: Rational.of(1n, 100n) },
  { symbol: "m", name: "mili", factor: Rational.of(1n, 1000n) },
  { symbol: "µ", name: "mikro", factor: Rational.of(1n, 10n ** 6n) },
  { symbol: "u", name: "mikro", factor: Rational.of(1n, 10n ** 6n) },
  { symbol: "μ", name: "mikro", factor: Rational.of(1n, 10n ** 6n) },
  { symbol: "n", name: "nano", factor: Rational.of(1n, 10n ** 9n) },
  { symbol: "p", name: "piko", factor: Rational.of(1n, 10n ** 12n) },
  { symbol: "f", name: "femto", factor: Rational.of(1n, 10n ** 15n) },
  { symbol: "a", name: "atto", factor: Rational.of(1n, 10n ** 18n) },
  { symbol: "z", name: "zepto", factor: Rational.of(1n, 10n ** 21n) },
  { symbol: "y", name: "yokto", factor: Rational.of(1n, 10n ** 24n) },
  { symbol: "r", name: "ronto", factor: Rational.of(1n, 10n ** 27n) },
  { symbol: "q", name: "quekto", factor: Rational.of(1n, 10n ** 30n) },
  { symbol: "Ki", name: "kibi", factor: Rational.of(1024n), binary: true },
  { symbol: "Mi", name: "mebi", factor: Rational.of(1024n ** 2n), binary: true },
  { symbol: "Gi", name: "gibi", factor: Rational.of(1024n ** 3n), binary: true },
  { symbol: "Ti", name: "tebi", factor: Rational.of(1024n ** 4n), binary: true },
  { symbol: "Pi", name: "pebi", factor: Rational.of(1024n ** 5n), binary: true },
  { symbol: "Ei", name: "exbi", factor: Rational.of(1024n ** 6n), binary: true },
];

const BY_SYMBOL = new Map<string, UnitDef>();
const BY_ALIAS = new Map<string, UnitDef>();
for (const u of UNITS) {
  BY_SYMBOL.set(u.symbol, u);
  for (const a of u.aliases ?? []) if (!BY_ALIAS.has(a)) BY_ALIAS.set(a, u);
}
// kilogram is the SI base unit even though "g" carries the prefix system
const KG: UnitDef = {
  symbol: "kg",
  name: "kilogram",
  dim: DIMS.mass,
  factor: num(1),
  exact: true,
  category: "massa",
  aliases: ["kilogram", "kilo"],
};

/** A single resolved unit factor (possibly prefixed) raised to a power. */
export interface UnitAtom {
  unit: UnitDef;
  prefix?: Prefix;
  power: number;
  text: string;
}

export interface CompoundUnit {
  atoms: UnitAtom[];
  dim: Dim;
  factor: Expr;
  offset?: Expr;
  exact: boolean;
  text: string;
  latex: string;
}

function lookupAtom(token: string): { unit: UnitDef; prefix?: Prefix } | null {
  if (token === "kg") return { unit: KG };
  const direct = BY_SYMBOL.get(token) ?? BY_ALIAS.get(token) ?? BY_ALIAS.get(token.toLowerCase());
  if (direct) return { unit: direct };
  for (const p of [...PREFIXES].sort((a, b) => b.symbol.length - a.symbol.length)) {
    if (token.startsWith(p.symbol) && token.length > p.symbol.length) {
      const rest = token.slice(p.symbol.length);
      const u = BY_SYMBOL.get(rest);
      if (u && u.prefixable && (!p.binary || u.prefixable === "si+binary"))
        return { unit: u, prefix: p };
    }
  }
  return null;
}

function atomLatex(a: UnitAtom): string {
  const base =
    a.unit.latex ??
    `\\mathrm{${a.unit.symbol.replace(/Ω/g, "\\Omega").replace(/µ|μ/g, "\\mu ").replace(/%/g, "\\%")}}`;
  const pre = a.prefix ? `\\mathrm{${a.prefix.symbol.replace(/µ|μ|u/, "\\mu ")}}` : "";
  const p = Math.abs(a.power);
  return `${pre}${base}${p !== 1 ? `^{${p}}` : ""}`;
}

/**
 * Parse a unit expression such as "km/h", "m/s^2", "kg*m^2/s^2", "N·m", "J/(kg·K)", "°C".
 */
export function parseUnit(text: string): CompoundUnit {
  const src = text.trim().replace(/\s+/g, " ");
  if (src === "" || src === "1" || src === "-") {
    return { atoms: [], dim: DIMLESS, factor: num(1), exact: true, text: "", latex: "" };
  }
  const atoms: UnitAtom[] = [];
  let i = 0;
  const err = (msg: string) =>
    new MathError("invalid-input", `Satuan '${text}' tidak dikenali.`, {
      module: "units",
      cause: msg,
      hint: "Contoh satuan: m, km/h, m/s^2, kg*m^2/s^2, °C, kPa, mol/L.",
    });
  const parseGroup = (sign: number, depth: number): void => {
    let currentSign = sign;
    while (i < src.length) {
      const ch = src[i];
      if (ch === " " || ch === "*" || ch === "·" || ch === "⋅" || ch === ".") {
        i++;
        continue;
      }
      if (ch === "/") {
        currentSign = -sign;
        i++;
        continue;
      }
      if (ch === "(") {
        i++;
        parseGroup(currentSign, depth + 1);
        if (src[i] !== ")") throw err("Tanda kurung tidak ditutup.");
        i++;
        continue;
      }
      if (ch === ")") {
        if (depth === 0) throw err("Tanda kurung tutup tanpa pasangan.");
        return;
      }
      if (ch === "1" && !/[0-9]/.test(src[i + 1] ?? "")) {
        i++; // dimensionless numerator, e.g. 1/K
        continue;
      }
      const m = /^(°[A-Za-zé]+|[A-Za-zµμΩÅ%°′″][A-Za-zµμΩ0-9_]*)/.exec(src.slice(i));
      if (!m) throw err(`Karakter '${ch}' tidak valid dalam satuan.`);
      let token = m[1];
      i += token.length;
      // exponent: ^2, ^-1, ², ³, or trailing digits (m2 -> m^2)
      let power = 1;
      const expMatch = /^(\^(?:\(-?\d+\)|-?\d+)|[²³⁴]|⁻[¹²³])/.exec(src.slice(i));
      if (expMatch) {
        const e = expMatch[1];
        i += e.length;
        const map: Record<string, number> = {
          "²": 2,
          "³": 3,
          "⁴": 4,
          "⁻¹": -1,
          "⁻²": -2,
          "⁻³": -3,
        };
        power = map[e] ?? parseInt(e.replace(/[\^()]/g, ""), 10);
      } else {
        const trailing = /^([A-Za-zµμΩ]+?)([23])$/.exec(token);
        if (trailing && !lookupAtom(token) && lookupAtom(trailing[1])) {
          token = trailing[1];
          power = Number(trailing[2]);
        }
      }
      const found = lookupAtom(token);
      if (!found) throw err(`Satuan '${token}' tidak ada dalam daftar.`);
      atoms.push({
        unit: found.unit,
        prefix: found.prefix,
        power: power * currentSign,
        text: token,
      });
    }
  };
  parseGroup(1, 0);
  if (atoms.length === 0) throw err("Tidak ada satuan.");
  let dim = DIMLESS;
  let factor: Expr = num(1);
  let exact = true;
  for (const a of atoms) {
    dim = dimMul(dim, dimPow(a.unit.dim, a.power));
    const f = a.prefix ? mul(num(a.prefix.factor), a.unit.factor) : a.unit.factor;
    factor = mul(factor, pow(f, num(a.power)));
    exact = exact && a.unit.exact;
  }
  const offset =
    atoms.length === 1 && atoms[0].power === 1 && !atoms[0].prefix
      ? atoms[0].unit.offset
      : undefined;
  const numer = atoms
    .filter((a) => a.power > 0)
    .map(atomLatex)
    .join("\\,");
  const denom = atoms
    .filter((a) => a.power < 0)
    .map(atomLatex)
    .join("\\,");
  const latex = denom ? (numer ? `\\frac{${numer}}{${denom}}` : `\\frac{1}{${denom}}`) : numer;
  return { atoms, dim, factor, offset, exact, text: src, latex };
}

export function unitsCompatible(a: CompoundUnit, b: CompoundUnit): boolean {
  return dimEquals(a.dim, b.dim);
}

export function unitsForCategory(cat: Category): UnitDef[] {
  return UNITS.filter((u) => u.category === cat);
}

/** Common unit choices per dimension, for UI dropdowns. */
export const COMMON_UNITS: Record<string, string[]> = {
  panjang: ["m", "km", "cm", "mm", "µm", "nm", "in", "ft", "yd", "mi", "nmi", "au", "ly", "pc"],
  massa: ["kg", "g", "mg", "t", "kuintal", "ons", "lb", "oz", "ct", "Da"],
  waktu: ["s", "ms", "µs", "min", "h", "d", "wk", "yr"],
  suhu: ["K", "°C", "°F", "°R", "°Ré"],
  luas: ["m^2", "km^2", "cm^2", "mm^2", "ha", "are", "acre", "ft^2", "in^2"],
  volume: ["m^3", "L", "mL", "cm^3", "dm^3", "cc", "gal", "qt", "pt", "cup", "floz", "bbl"],
  kecepatan: ["m/s", "km/h", "mph", "kn", "ft/s", "cm/s"],
  percepatan: ["m/s^2", "gn", "ft/s^2", "Gal"],
  gaya: ["N", "kN", "dyn", "kgf", "lbf"],
  tekanan: ["Pa", "kPa", "MPa", "bar", "mbar", "atm", "mmHg", "Torr", "psi"],
  energi: ["J", "kJ", "MJ", "cal", "kcal", "eV", "keV", "MeV", "Wh", "kWh", "BTU", "erg"],
  daya: ["W", "kW", "MW", "mW", "hp", "PK"],
  frekuensi: ["Hz", "kHz", "MHz", "GHz", "rpm"],
  muatan: ["C", "mC", "µC", "nC", "Ah", "mAh"],
  tegangan: ["V", "mV", "kV"],
  arus: ["A", "mA", "µA", "kA"],
  hambatan: ["Ω", "kΩ", "MΩ", "mΩ"],
  kapasitansi: ["F", "mF", "µF", "nF", "pF"],
  induktansi: ["H", "mH", "µH"],
  "medan magnet": ["T", "mT", "µT", "G"],
  "massa jenis": ["kg/m^3", "g/cm^3", "g/mL", "kg/L"],
  konsentrasi: ["mol/L", "M", "mM", "mol/m^3"],
  sudut: ["rad", "°", "grad", "rev", "arcmin", "arcsec"],
  data: ["bit", "B", "kB", "MB", "GB", "TB", "KiB", "MiB", "GiB", "TiB", "kbit", "Mbit", "Gbit"],
  "laju data": ["bps", "kbps", "Mbps", "Gbps", "B/s", "MB/s"],
  "viskositas dinamis": ["Pa*s", "mPa*s", "P", "cP"],
  "jumlah zat": ["mol", "mmol", "kmol"],
  rasio: ["%", "ppm", "ppb"],
};

export function categoryOfDim(d: Dim): string | null {
  for (const [cat, list] of Object.entries(COMMON_UNITS)) {
    try {
      if (dimEquals(parseUnit(list[0]).dim, d)) return cat;
    } catch {
      // ignore
    }
  }
  return null;
}
