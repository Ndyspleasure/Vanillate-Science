/**
 * Helpers to assemble solutions and verify individual steps.
 */
import { checkEquivalent } from "../expr/equivalence";
import type { Expr } from "../expr/types";
import {
  ENGINE_VERSION,
  type Alternative,
  type Answer,
  type ProblemKind,
  type Reference,
  type Solution,
  type Step,
  type StepCheck,
  type Verification,
  type PlotSpec,
  type TableData,
} from "./types";

export interface SolutionInit {
  kind: ProblemKind;
  title: string;
  input: string;
  inputLatex: string;
  answers: Answer[];
  method: { name: string; description: string; formula?: string };
  steps: Step[];
  verification: Verification;
  module: string;
  assumptions?: string[];
  notes?: string[];
  alternatives?: Alternative[];
  plot?: PlotSpec;
  tables?: TableData[];
  references?: Reference[];
}

export function makeSolution(init: SolutionInit): Solution {
  return {
    kind: init.kind,
    title: init.title,
    input: init.input,
    inputLatex: init.inputLatex,
    answers: init.answers,
    method: init.method,
    steps: init.steps,
    verification: init.verification,
    assumptions: init.assumptions ?? [],
    notes: init.notes ?? [],
    alternatives: init.alternatives ?? [],
    plot: init.plot,
    tables: init.tables,
    references: init.references,
    meta: { engineVersion: ENGINE_VERSION, module: init.module },
  };
}

/** Verify that a rewriting step preserved the value of an expression. */
export function checkRewrite(
  before: Expr,
  after: Expr,
  options: { positiveOnly?: boolean } = {},
): StepCheck {
  try {
    const r = checkEquivalent(before, after, { positiveOnly: options.positiveOnly });
    if (r.equivalent) {
      return {
        status: r.method === "symbolic" ? "verified" : "verified-numeric",
        method: r.method === "symbolic" ? "Kesetaraan simbolik" : "Kesetaraan numerik",
        detail: r.detail,
      };
    }
    if (r.method === "inconclusive")
      return { status: "unverified", method: "Kesetaraan numerik", detail: r.detail };
    return { status: "failed", method: "Kesetaraan numerik", detail: r.detail };
  } catch (e) {
    return {
      status: "unverified",
      method: "Kesetaraan",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export const REFERENCES = {
  cohen: {
    name: "Computer Algebra and Symbolic Computation: Elementary Algorithms",
    source: "Joel S. Cohen, A K Peters",
    edition: "2002",
    notes:
      "Algoritma penyederhanaan otomatis (automatic simplification) dan manipulasi polinomial.",
  },
  openstaxAlgebra: {
    name: "College Algebra 2e",
    source: "OpenStax (Rice University)",
    url: "https://openstax.org/details/books/college-algebra-2e",
  },
  openstaxCalc1: {
    name: "Calculus Volume 1",
    source: "OpenStax (Rice University)",
    url: "https://openstax.org/details/books/calculus-volume-1",
  },
  openstaxCalc2: {
    name: "Calculus Volume 2",
    source: "OpenStax (Rice University)",
    url: "https://openstax.org/details/books/calculus-volume-2",
  },
  openstaxCalc3: {
    name: "Calculus Volume 3",
    source: "OpenStax (Rice University)",
    url: "https://openstax.org/details/books/calculus-volume-3",
  },
  openstaxPrealgebra: {
    name: "Prealgebra 2e",
    source: "OpenStax (Rice University)",
    url: "https://openstax.org/details/books/prealgebra-2e",
  },
  openstaxStats: {
    name: "Introductory Statistics 2e",
    source: "OpenStax (Rice University)",
    url: "https://openstax.org/details/books/introductory-statistics-2e",
  },
  openstaxPhysics1: {
    name: "University Physics Volume 1",
    source: "OpenStax (Rice University)",
    url: "https://openstax.org/details/books/university-physics-volume-1",
  },
  openstaxPhysics2: {
    name: "University Physics Volume 2",
    source: "OpenStax (Rice University)",
    url: "https://openstax.org/details/books/university-physics-volume-2",
  },
  openstaxPhysics3: {
    name: "University Physics Volume 3",
    source: "OpenStax (Rice University)",
    url: "https://openstax.org/details/books/university-physics-volume-3",
  },
  openstaxChem: {
    name: "Chemistry 2e",
    source: "OpenStax (Rice University)",
    url: "https://openstax.org/details/books/chemistry-2e",
  },
  openstaxAstro: {
    name: "Astronomy 2e",
    source: "OpenStax (Rice University)",
    url: "https://openstax.org/details/books/astronomy-2e",
  },
  codata: {
    name: "CODATA Internationally Recommended Values of the Fundamental Physical Constants",
    source: "NIST Physical Measurement Laboratory",
    url: "https://physics.nist.gov/cuu/Constants/",
  },
  siBrochure: {
    name: "The International System of Units (SI Brochure)",
    source: "Bureau International des Poids et Mesures (BIPM)",
    edition: "9th edition, 2019",
    url: "https://www.bipm.org/en/publications/si-brochure",
  },
  nistSp811: {
    name: "NIST Special Publication 811: Guide for the Use of the International System of Units",
    source: "National Institute of Standards and Technology",
    edition: "2008",
    url: "https://www.nist.gov/pml/special-publication-811",
  },
  ciaaw: {
    name: "Standard Atomic Weights",
    source: "IUPAC Commission on Isotopic Abundances and Atomic Weights (CIAAW)",
    url: "https://www.ciaaw.org/atomic-weights.htm",
  },
  numericalRecipes: {
    name: "Numerical Recipes: The Art of Scientific Computing",
    source:
      "W. H. Press, S. A. Teukolsky, W. T. Vetterling, B. P. Flannery, Cambridge University Press",
    edition: "3rd edition, 2007",
  },
  burdenFaires: {
    name: "Numerical Analysis",
    source: "R. L. Burden, J. D. Faires, Cengage Learning",
    notes: "Metode bagi dua, Newton-Raphson, integrasi numerik Simpson, Runge-Kutta.",
  },
  strang: {
    name: "Introduction to Linear Algebra",
    source: "Gilbert Strang, Wellesley-Cambridge Press",
  },
  rosen: {
    name: "Discrete Mathematics and Its Applications",
    source: "Kenneth H. Rosen, McGraw-Hill",
  },
} satisfies Record<string, Reference>;
