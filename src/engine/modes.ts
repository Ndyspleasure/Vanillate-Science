/** Solver modes (dependency-free so UI code can import it without pulling in the engine). */
export type Mode =
  | "auto"
  | "simplify"
  | "expand"
  | "factor"
  | "derivative"
  | "integral"
  | "extrema"
  | "taylor"
  | "isprime"
  | "divisors"
  | "statistics";

export const MODE_LABELS: Record<Mode, string> = {
  auto: "Otomatis",
  simplify: "Sederhanakan",
  expand: "Jabarkan",
  factor: "Faktorkan",
  derivative: "Turunan",
  integral: "Integral",
  extrema: "Titik ekstrem",
  taylor: "Deret Taylor",
  isprime: "Uji bilangan prima",
  divisors: "Pembagi",
  statistics: "Statistik",
};
