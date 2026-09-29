/**
 * Periodic table data.
 *
 * Atomic weights: IUPAC CIAAW standard atomic weights (abridged/conventional values,
 * https://www.ciaaw.org/atomic-weights.htm). For elements whose standard atomic weight is an
 * interval (H, Li, B, C, N, O, Mg, Si, S, Cl, Ar, Br, Tl, Pb) the IUPAC conventional value is
 * used. For elements without a standard atomic weight, the mass number of a long-lived
 * isotope is given and flagged `standard: false` (shown in brackets).
 */

export type ElementCategory =
  | "logam alkali"
  | "logam alkali tanah"
  | "logam transisi"
  | "logam pasca-transisi"
  | "metaloid"
  | "nonlogam"
  | "halogen"
  | "gas mulia"
  | "lantanida"
  | "aktinida";

export interface ElementData {
  z: number;
  symbol: string;
  name: string;
  nameEn: string;
  weight: string;
  standard: boolean;
  period: number;
  group: number | null; // null for f-block (displayed in separate rows)
  category: ElementCategory;
}

// [symbol, Indonesian name, English name, weight, standard?]
const RAW: Array<[string, string, string, string, boolean]> = [
  ["H", "Hidrogen", "Hydrogen", "1.008", true], ["He", "Helium", "Helium", "4.002602", true],
  ["Li", "Litium", "Lithium", "6.94", true], ["Be", "Berilium", "Beryllium", "9.0121831", true], ["B", "Boron", "Boron", "10.81", true],
  ["C", "Karbon", "Carbon", "12.011", true], ["N", "Nitrogen", "Nitrogen", "14.007", true], ["O", "Oksigen", "Oxygen", "15.999", true],
  ["F", "Fluorin", "Fluorine", "18.998403162", true], ["Ne", "Neon", "Neon", "20.1797", true],
  ["Na", "Natrium", "Sodium", "22.98976928", true], ["Mg", "Magnesium", "Magnesium", "24.305", true], ["Al", "Aluminium", "Aluminium", "26.9815384", true],
  ["Si", "Silikon", "Silicon", "28.085", true], ["P", "Fosfor", "Phosphorus", "30.973761998", true], ["S", "Belerang", "Sulfur", "32.06", true],
  ["Cl", "Klorin", "Chlorine", "35.45", true], ["Ar", "Argon", "Argon", "39.95", true],
  ["K", "Kalium", "Potassium", "39.0983", true], ["Ca", "Kalsium", "Calcium", "40.078", true], ["Sc", "Skandium", "Scandium", "44.955907", true],
  ["Ti", "Titanium", "Titanium", "47.867", true], ["V", "Vanadium", "Vanadium", "50.9415", true], ["Cr", "Kromium", "Chromium", "51.9961", true],
  ["Mn", "Mangan", "Manganese", "54.938043", true], ["Fe", "Besi", "Iron", "55.845", true], ["Co", "Kobalt", "Cobalt", "58.933194", true],
  ["Ni", "Nikel", "Nickel", "58.6934", true], ["Cu", "Tembaga", "Copper", "63.546", true], ["Zn", "Seng", "Zinc", "65.38", true],
  ["Ga", "Galium", "Gallium", "69.723", true], ["Ge", "Germanium", "Germanium", "72.630", true], ["As", "Arsen", "Arsenic", "74.921595", true],
  ["Se", "Selenium", "Selenium", "78.971", true], ["Br", "Bromin", "Bromine", "79.904", true], ["Kr", "Kripton", "Krypton", "83.798", true],
  ["Rb", "Rubidium", "Rubidium", "85.4678", true], ["Sr", "Stronsium", "Strontium", "87.62", true], ["Y", "Itrium", "Yttrium", "88.905838", true],
  ["Zr", "Zirkonium", "Zirconium", "91.222", true], ["Nb", "Niobium", "Niobium", "92.90637", true], ["Mo", "Molibdenum", "Molybdenum", "95.95", true],
  ["Tc", "Teknesium", "Technetium", "97", false], ["Ru", "Rutenium", "Ruthenium", "101.07", true], ["Rh", "Rodium", "Rhodium", "102.90549", true],
  ["Pd", "Paladium", "Palladium", "106.42", true], ["Ag", "Perak", "Silver", "107.8682", true], ["Cd", "Kadmium", "Cadmium", "112.414", true],
  ["In", "Indium", "Indium", "114.818", true], ["Sn", "Timah", "Tin", "118.710", true], ["Sb", "Antimon", "Antimony", "121.760", true],
  ["Te", "Telurium", "Tellurium", "127.60", true], ["I", "Iodin", "Iodine", "126.90447", true], ["Xe", "Xenon", "Xenon", "131.293", true],
  ["Cs", "Sesium", "Caesium", "132.90545196", true], ["Ba", "Barium", "Barium", "137.327", true], ["La", "Lantanum", "Lanthanum", "138.90547", true],
  ["Ce", "Serium", "Cerium", "140.116", true], ["Pr", "Praseodimium", "Praseodymium", "140.90766", true], ["Nd", "Neodimium", "Neodymium", "144.242", true],
  ["Pm", "Prometium", "Promethium", "145", false], ["Sm", "Samarium", "Samarium", "150.36", true], ["Eu", "Europium", "Europium", "151.964", true],
  ["Gd", "Gadolinium", "Gadolinium", "157.249", true], ["Tb", "Terbium", "Terbium", "158.925354", true], ["Dy", "Disprosium", "Dysprosium", "162.500", true],
  ["Ho", "Holmium", "Holmium", "164.930329", true], ["Er", "Erbium", "Erbium", "167.259", true], ["Tm", "Tulium", "Thulium", "168.934219", true],
  ["Yb", "Iterbium", "Ytterbium", "173.045", true], ["Lu", "Lutesium", "Lutetium", "174.9668", true], ["Hf", "Hafnium", "Hafnium", "178.486", true],
  ["Ta", "Tantalum", "Tantalum", "180.94788", true], ["W", "Wolfram", "Tungsten", "183.84", true], ["Re", "Renium", "Rhenium", "186.207", true],
  ["Os", "Osmium", "Osmium", "190.23", true], ["Ir", "Iridium", "Iridium", "192.217", true], ["Pt", "Platina", "Platinum", "195.084", true],
  ["Au", "Emas", "Gold", "196.966570", true], ["Hg", "Raksa", "Mercury", "200.592", true], ["Tl", "Talium", "Thallium", "204.38", true],
  ["Pb", "Timbal", "Lead", "207.2", true], ["Bi", "Bismut", "Bismuth", "208.98040", true], ["Po", "Polonium", "Polonium", "209", false],
  ["At", "Astatin", "Astatine", "210", false], ["Rn", "Radon", "Radon", "222", false], ["Fr", "Fransium", "Francium", "223", false],
  ["Ra", "Radium", "Radium", "226", false], ["Ac", "Aktinium", "Actinium", "227", false], ["Th", "Torium", "Thorium", "232.0377", true],
  ["Pa", "Protaktinium", "Protactinium", "231.03588", true], ["U", "Uranium", "Uranium", "238.02891", true], ["Np", "Neptunium", "Neptunium", "237", false],
  ["Pu", "Plutonium", "Plutonium", "244", false], ["Am", "Amerisium", "Americium", "243", false], ["Cm", "Kurium", "Curium", "247", false],
  ["Bk", "Berkelium", "Berkelium", "247", false], ["Cf", "Kalifornium", "Californium", "251", false], ["Es", "Einsteinium", "Einsteinium", "252", false],
  ["Fm", "Fermium", "Fermium", "257", false], ["Md", "Mendelevium", "Mendelevium", "258", false], ["No", "Nobelium", "Nobelium", "259", false],
  ["Lr", "Lawrensium", "Lawrencium", "262", false], ["Rf", "Rutherfordium", "Rutherfordium", "267", false], ["Db", "Dubnium", "Dubnium", "268", false],
  ["Sg", "Seaborgium", "Seaborgium", "269", false], ["Bh", "Bohrium", "Bohrium", "270", false], ["Hs", "Hassium", "Hassium", "269", false],
  ["Mt", "Meitnerium", "Meitnerium", "278", false], ["Ds", "Darmstadtium", "Darmstadtium", "281", false], ["Rg", "Roentgenium", "Roentgenium", "282", false],
  ["Cn", "Kopernisium", "Copernicium", "285", false], ["Nh", "Nihonium", "Nihonium", "286", false], ["Fl", "Flerovium", "Flerovium", "289", false],
  ["Mc", "Moskovium", "Moscovium", "290", false], ["Lv", "Livermorium", "Livermorium", "293", false], ["Ts", "Tenesin", "Tennessine", "294", false],
  ["Og", "Oganeson", "Oganesson", "294", false],
];

function position(z: number): { period: number; group: number | null } {
  const starts = [1, 3, 11, 19, 37, 55, 87, 119];
  let period = 1;
  while (z >= starts[period]) period++;
  const idx = z - starts[period - 1];
  if (period === 1) return { period, group: z === 1 ? 1 : 18 };
  if (period <= 3) return { period, group: idx < 2 ? idx + 1 : idx + 10 };
  if (period <= 5) return { period, group: idx + 1 };
  // periods 6, 7 with f-block
  if (idx < 2) return { period, group: idx + 1 };
  if (idx < 17) return { period, group: null }; // La–Lu / Ac–Lr
  return { period, group: idx - 13 };
}

const ALKALI = new Set(["Li", "Na", "K", "Rb", "Cs", "Fr"]);
const ALKALINE = new Set(["Be", "Mg", "Ca", "Sr", "Ba", "Ra"]);
const METALLOID = new Set(["B", "Si", "Ge", "As", "Sb", "Te"]);
const HALOGEN = new Set(["F", "Cl", "Br", "I", "At", "Ts"]);
const NOBLE = new Set(["He", "Ne", "Ar", "Kr", "Xe", "Rn", "Og"]);
const NONMETAL = new Set(["H", "C", "N", "O", "P", "S", "Se"]);
const POST = new Set(["Al", "Ga", "In", "Sn", "Tl", "Pb", "Bi", "Po", "Nh", "Fl", "Mc", "Lv"]);

function category(symbol: string, z: number): ElementCategory {
  if (z >= 57 && z <= 71) return "lantanida";
  if (z >= 89 && z <= 103) return "aktinida";
  if (ALKALI.has(symbol)) return "logam alkali";
  if (ALKALINE.has(symbol)) return "logam alkali tanah";
  if (METALLOID.has(symbol)) return "metaloid";
  if (HALOGEN.has(symbol)) return "halogen";
  if (NOBLE.has(symbol)) return "gas mulia";
  if (NONMETAL.has(symbol)) return "nonlogam";
  if (POST.has(symbol)) return "logam pasca-transisi";
  return "logam transisi";
}

export const ELEMENTS: ElementData[] = RAW.map(([symbol, name, nameEn, weight, standard], i) => {
  const z = i + 1;
  return { z, symbol, name, nameEn, weight, standard, ...position(z), category: category(symbol, z) };
});

export const ELEMENT_BY_SYMBOL: Record<string, ElementData> = Object.fromEntries(ELEMENTS.map((e) => [e.symbol, e]));
