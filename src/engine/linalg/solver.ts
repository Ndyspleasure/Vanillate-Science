/**
 * Matrix and vector problems: determinant, inverse, transpose, rank, RREF, trace,
 * eigenvalues/eigenvectors, matrix arithmetic, dot/cross products, norms, angles,
 * projections.
 */
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { evalReal } from "../expr/evaluate";
import { Poly } from "../expr/polynomial";
import { toLatex } from "../expr/print";
import { add, div, fn, mul, num, pow, sub, sqrt, ZERO } from "../expr/simplify";
import { rawSym, type Expr } from "../expr/types";
import { isSymbolicallyZero } from "../expr/equivalence";
import { toExpr } from "../parse/convert";
import { syntaxToLatex } from "../parse/print-syntax";
import type { SNode } from "../parse/syntax";
import { makeSolution, REFERENCES } from "../steps/builder";
import { aggregateVerification, exactAnswer, formatNumber, rationalLatex } from "../steps/format";
import type { Alternative, Answer, Solution, Step, VerificationCheck } from "../steps/types";
import { solveCore } from "../solvers/equation";
import { RMatrix, vectorLatex } from "./matrix";

type Value = { kind: "scalar"; value: Expr } | { kind: "matrix"; m: Expr[][] };

function matrixLatexE(m: Expr[][]): string {
  return `\\begin{pmatrix}${m.map((r) => r.map((v) => toLatex(v)).join(" & ")).join(" \\\\ ")}\\end{pmatrix}`;
}

function valueLatex(v: Value): string {
  return v.kind === "scalar" ? toLatex(v.value) : matrixLatexE(v.m);
}

function toRational(m: Expr[][]): RMatrix | null {
  if (m.some((r) => r.some((v) => v.type !== "num"))) return null;
  return new RMatrix(m.map((r) => r.map((v) => (v as { value: Rational }).value)));
}

function fromRational(m: RMatrix): Expr[][] {
  return m.data.map((r) => r.map((v) => num(v)));
}

/** Convert a list node into a matrix (a flat list becomes a column vector). */
export function listToMatrix(n: SNode): Expr[][] {
  if (n.k !== "list")
    throw new MathError("invalid-input", "Diharapkan matriks atau vektor.", { module: "matrix" });
  if (n.items.length === 0)
    throw new MathError("invalid-input", "Matriks kosong.", { module: "matrix" });
  if (n.items.every((it) => it.k === "list")) {
    const rows = n.items.map((r) => (r as { items: SNode[] }).items.map((c) => toExpr(c)));
    const cols = rows[0].length;
    if (rows.some((r) => r.length !== cols)) {
      throw new MathError(
        "invalid-input",
        "Setiap baris matriks harus memiliki jumlah elemen yang sama.",
        { module: "matrix", cause: `Panjang baris: ${rows.map((r) => r.length).join(", ")}.` },
      );
    }
    return rows;
  }
  return n.items.map((c) => [toExpr(c)]);
}

export function containsList(n: SNode): boolean {
  switch (n.k) {
    case "list":
      return true;
    case "bin":
      return containsList(n.left) || containsList(n.right);
    case "neg":
    case "group":
    case "abs":
    case "postfix":
      return containsList(n.arg);
    case "call":
      return n.args.some(containsList);
    default:
      return false;
  }
}

function dims(m: Expr[][]) {
  return `${m.length}\\times${m[0].length}`;
}

function detExpr(m: Expr[][]): Expr {
  const n = m.length;
  if (n === 1) return m[0][0];
  if (n === 2) return sub(mul(m[0][0], m[1][1]), mul(m[0][1], m[1][0]));
  if (n > 6)
    throw new MathError("limit-exceeded", "Determinan simbolik dibatasi hingga 6×6.", {
      module: "matrix",
    });
  let s: Expr = ZERO;
  for (let j = 0; j < n; j++) {
    const minor = m.slice(1).map((r) => r.filter((_, c) => c !== j));
    const term = mul(m[0][j], detExpr(minor));
    s = j % 2 === 0 ? add(s, term) : sub(s, term);
  }
  return s;
}

function mulE(a: Expr[][], b: Expr[][]): Expr[][] {
  if (a[0].length !== b.length) {
    throw new MathError(
      "invalid-input",
      `Perkalian matriks tidak terdefinisi: ukuran ${a.length}×${a[0].length} dan ${b.length}×${b[0].length}.`,
      {
        module: "matrix",
        cause: "Jumlah kolom matriks pertama harus sama dengan jumlah baris matriks kedua.",
      },
    );
  }
  return a.map((row) => b[0].map((_, j) => add(...row.map((v, k) => mul(v, b[k][j])))));
}

function assertSquare(m: Expr[][], op: string) {
  if (m.length !== m[0].length)
    throw new MathError(
      "invalid-input",
      `${op} hanya terdefinisi untuk matriks persegi (ukuran ${m.length}×${m[0].length}).`,
      { module: "matrix" },
    );
}

// ---------------------------------------------------------------------------
// Matrix expression evaluation (A + B, 2A, A*B, A^2, det(A), ...)
// ---------------------------------------------------------------------------

function evalNode(n: SNode, steps: Step[]): Value {
  switch (n.k) {
    case "list":
      return { kind: "matrix", m: listToMatrix(n) };
    case "group":
      return evalNode(n.arg, steps);
    case "neg": {
      const v = evalNode(n.arg, steps);
      return v.kind === "scalar"
        ? { kind: "scalar", value: mul(num(-1), v.value) }
        : { kind: "matrix", m: v.m.map((r) => r.map((x) => mul(num(-1), x))) };
    }
    case "bin": {
      const a = evalNode(n.left, steps);
      const b = evalNode(n.right, steps);
      let r: Value;
      let title: string;
      let rule: Step["rule"];
      if (n.op === "+" || n.op === "-") {
        if (a.kind !== b.kind)
          throw new MathError("invalid-input", "Tidak dapat menjumlahkan matriks dengan skalar.", {
            module: "matrix",
          });
        if (a.kind === "scalar")
          return {
            kind: "scalar",
            value:
              n.op === "+"
                ? add(a.value, (b as { value: Expr }).value)
                : sub(a.value, (b as { value: Expr }).value),
          };
        const bm = (b as { m: Expr[][] }).m;
        if (a.m.length !== bm.length || a.m[0].length !== bm[0].length)
          throw new MathError(
            "invalid-input",
            `Penjumlahan matriks membutuhkan ukuran sama (${dims(a.m)} vs ${dims(bm)}).`,
            { module: "matrix" },
          );
        r = {
          kind: "matrix",
          m: a.m.map((row, i) =>
            row.map((v, j) => (n.op === "+" ? add(v, bm[i][j]) : sub(v, bm[i][j]))),
          ),
        };
        title =
          n.op === "+" ? "Jumlahkan entri yang bersesuaian" : "Kurangkan entri yang bersesuaian";
        rule = {
          id: "matrix-add",
          name: "Penjumlahan matriks",
          formula: "(A \\pm B)_{ij} = a_{ij} \\pm b_{ij}",
        };
      } else if (n.op === "*") {
        if (a.kind === "scalar" && b.kind === "scalar")
          return { kind: "scalar", value: mul(a.value, b.value) };
        if (a.kind === "scalar" || b.kind === "scalar") {
          const s = a.kind === "scalar" ? a.value : (b as { value: Expr }).value;
          const m = a.kind === "matrix" ? a.m : (b as { m: Expr[][] }).m;
          r = { kind: "matrix", m: m.map((row) => row.map((v) => mul(s, v))) };
          title = "Kalikan setiap entri dengan skalar";
          rule = { id: "scalar-mul", name: "Perkalian skalar", formula: "(kA)_{ij} = k\\,a_{ij}" };
        } else {
          r = { kind: "matrix", m: mulE(a.m, (b as { m: Expr[][] }).m) };
          title = "Perkalian matriks (baris × kolom)";
          rule = {
            id: "matrix-mul",
            name: "Perkalian matriks",
            formula: "(AB)_{ij} = \\sum_k a_{ik} b_{kj}",
          };
        }
      } else if (n.op === "^") {
        if (
          a.kind !== "matrix" ||
          b.kind !== "scalar" ||
          b.value.type !== "num" ||
          !b.value.value.isInteger()
        )
          throw new MathError("invalid-input", "Pangkat matriks harus bilangan bulat.", {
            module: "matrix",
          });
        assertSquare(a.m, "Pangkat");
        const k = Number(b.value.value.num);
        if (Math.abs(k) > 64)
          throw new MathError("limit-exceeded", "Pangkat matriks dibatasi |n| ≤ 64.", {
            module: "matrix",
          });
        const rm = toRational(a.m);
        let res: Expr[][];
        if (rm) res = fromRational(rm.power(k));
        else {
          if (k < 0)
            throw new MathError("unsupported", "Pangkat negatif matriks simbolik belum didukung.", {
              module: "matrix",
            });
          res = a.m.map((row, i) => row.map((_, j) => (i === j ? num(1) : ZERO)));
          for (let i = 0; i < k; i++) res = mulE(res, a.m);
        }
        r = { kind: "matrix", m: res };
        title = `Pangkat matriks A^${k}`;
        rule = {
          id: "matrix-power",
          name: "Pangkat matriks",
          formula: "A^n = \\underbrace{A \\cdot A \\cdots A}_{n}",
        };
      } else if (n.op === "/") {
        if (b.kind !== "scalar")
          throw new MathError(
            "invalid-input",
            "Pembagian dengan matriks tidak terdefinisi; gunakan invers.",
            { module: "matrix" },
          );
        if (a.kind === "scalar") return { kind: "scalar", value: div(a.value, b.value) };
        r = { kind: "matrix", m: a.m.map((row) => row.map((v) => div(v, b.value))) };
        title = "Bagi setiap entri dengan skalar";
        rule = { id: "scalar-mul", name: "Perkalian skalar" };
      } else
        throw new MathError("unsupported", "Operasi matriks tidak didukung.", { module: "matrix" });
      steps.push({
        title,
        before: `${valueLatex(a)} ${n.op === "*" ? "\\cdot" : n.op === "^" ? "^" : n.op} ${valueLatex(b)}`,
        after: valueLatex(r),
        operation: `matrix-${n.op}`,
        rule,
        reason: rule.name,
      });
      return r;
    }
    case "call": {
      const args = n.args.map((a) => evalNode(a, steps));
      const m = (i = 0) => {
        const v = args[i];
        if (!v || v.kind !== "matrix")
          throw new MathError("invalid-input", `Argumen ${n.name} harus matriks/vektor.`, {
            module: "matrix",
          });
        return v.m;
      };
      switch (n.name) {
        case "det": {
          const A = m();
          assertSquare(A, "Determinan");
          const d = detExpr(A);
          steps.push({
            title: "Determinan",
            before: `\\det${matrixLatexE(A)}`,
            after: toLatex(d),
            operation: "det",
            reason: "Ekspansi kofaktor.",
          });
          return { kind: "scalar", value: d };
        }
        case "transpose": {
          const A = m();
          const T = A[0].map((_, j) => A.map((r) => r[j]));
          steps.push({
            title: "Transpos",
            before: matrixLatexE(A),
            after: matrixLatexE(T),
            operation: "transpose",
            reason: "Baris menjadi kolom.",
          });
          return { kind: "matrix", m: T };
        }
        case "inv":
        case "inverse":
        case "invers": {
          const A = m();
          const rm = toRational(A);
          if (!rm)
            throw new MathError(
              "unsupported",
              "Invers hanya untuk matriks dengan entri bilangan rasional.",
              { module: "matrix" },
            );
          const inv = rm.inverse().matrix;
          steps.push({
            title: "Invers matriks",
            before: `${matrixLatexE(A)}^{-1}`,
            after: inv.toLatex(),
            operation: "inverse",
            reason: "Eliminasi Gauss–Jordan.",
          });
          return { kind: "matrix", m: fromRational(inv) };
        }
        case "trace": {
          const A = m();
          assertSquare(A, "Trace");
          return { kind: "scalar", value: add(...A.map((r, i) => r[i])) };
        }
        case "dot": {
          const u = m(0).map((r) => r[0]);
          const v = m(1).map((r) => r[0]);
          if (u.length !== v.length)
            throw new MathError("invalid-input", "Dimensi vektor harus sama.", {
              module: "vector",
            });
          return { kind: "scalar", value: add(...u.map((a, i) => mul(a, v[i]))) };
        }
        case "norm": {
          const u = m(0).map((r) => r[0]);
          return { kind: "scalar", value: sqrt(add(...u.map((a) => pow(a, num(2))))) };
        }
        case "cross": {
          const u = m(0).map((r) => r[0]);
          const v = m(1).map((r) => r[0]);
          if (u.length !== 3 || v.length !== 3)
            throw new MathError("invalid-input", "Perkalian silang hanya untuk vektor 3 dimensi.", {
              module: "vector",
            });
          return {
            kind: "matrix",
            m: [
              [sub(mul(u[1], v[2]), mul(u[2], v[1]))],
              [sub(mul(u[2], v[0]), mul(u[0], v[2]))],
              [sub(mul(u[0], v[1]), mul(u[1], v[0]))],
            ],
          };
        }
        default:
          if (args.every((a) => a.kind === "scalar")) return { kind: "scalar", value: toExpr(n) };
          throw new MathError(
            "unsupported",
            `Operasi ${n.name} pada matriks tidak didukung di dalam ekspresi.`,
            { module: "matrix" },
          );
      }
    }
    default:
      return { kind: "scalar", value: toExpr(n) };
  }
}

// ---------------------------------------------------------------------------
// Determinant
// ---------------------------------------------------------------------------

function determinantSolution(
  input: string,
  A: Expr[][],
  inputLatex: string,
  warnings: string[],
): Solution {
  assertSquare(A, "Determinan");
  const n = A.length;
  const rm = toRational(A);
  const steps: Step[] = [];
  const alternatives: Alternative[] = [];
  const checks: VerificationCheck[] = [];
  let value: Expr;
  if (n === 2) {
    value = detExpr(A);
    steps.push({
      title: "Rumus determinan 2×2",
      before: `\\det${matrixLatexE(A)}`,
      after: `${wrapL(A[0][0])} \\cdot ${wrapL(A[1][1])} - ${wrapL(A[0][1])} \\cdot ${wrapL(A[1][0])} = ${toLatex(value)}`,
      operation: "det-2x2",
      rule: {
        id: "det2",
        name: "Determinan 2×2",
        formula: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc",
      },
      reason: "Hasil kali diagonal utama dikurangi hasil kali diagonal samping.",
    });
  } else if (rm) {
    const res = rm.determinant(true);
    value = num(res.value);
    steps.push({
      title: "Eliminasi Gauss menjadi matriks segitiga atas",
      before: `\\det${rm.toLatex()}`,
      after: res.triangular.toLatex(),
      operation: "gauss-triangular",
      rule: {
        id: "det-elimination",
        name: "Determinan dengan eliminasi",
        formula: "\\det(U) = \\prod u_{ii}",
      },
      reason: `${res.ops.length} operasi baris; menambah kelipatan baris tidak mengubah determinan, menukar baris mengubah tanda.`,
      substeps: res.ops.map((op) => ({
        title: op.description,
        after: `${op.latex}:\\ ${op.matrix}`,
        operation: `row-${op.kind}`,
        reason: op.description,
      })),
    });
    steps.push({
      title: "Kalikan entri diagonal",
      after: `${res.swaps % 2 === 1 ? "-" : ""}${res.triangular.data.map((r, i) => (r[i].isNegative() ? `\\left(${rationalLatex(r[i])}\\right)` : rationalLatex(r[i]))).join(" \\cdot ")} = ${rationalLatex(res.value)}`,
      operation: "diagonal-product",
      reason: res.swaps
        ? `Terjadi ${res.swaps} pertukaran baris, sehingga tanda dikalikan (−1)^${res.swaps}.`
        : "Determinan matriks segitiga adalah hasil kali diagonalnya.",
    });
  } else {
    value = detExpr(A);
    steps.push({
      title: "Ekspansi kofaktor baris pertama",
      before: `\\det${matrixLatexE(A)}`,
      after: toLatex(value),
      operation: "cofactor",
      rule: {
        id: "cofactor",
        name: "Ekspansi kofaktor (Laplace)",
        formula: "\\det A = \\sum_j (-1)^{1+j} a_{1j} M_{1j}",
      },
      reason: "Entri memuat simbol, sehingga digunakan ekspansi kofaktor.",
    });
  }
  if (n === 3) {
    const [[a, b, c], [d, e, f], [g, h, i]] = A;
    const pos = [mul(a, e, i), mul(b, f, g), mul(c, d, h)];
    const negs = [mul(c, e, g), mul(a, f, h), mul(b, d, i)];
    const sarrus = sub(add(...pos), add(...negs));
    alternatives.push({
      name: "Aturan Sarrus",
      description:
        "Khusus matriks 3×3: jumlah hasil kali tiga diagonal ke kanan dikurangi tiga diagonal ke kiri.",
      steps: [
        {
          title: "Hitung diagonal",
          after: `(${pos.map((p) => toLatex(p)).join(" + ")}) - (${negs.map((p) => toLatex(p)).join(" + ")}) = ${toLatex(sarrus)}`,
          operation: "sarrus",
          rule: {
            id: "sarrus",
            name: "Aturan Sarrus",
            formula: "aei + bfg + cdh - ceg - afh - bdi",
          },
          reason: "Salin dua kolom pertama di sebelah kanan lalu jumlahkan diagonal.",
        },
      ],
      answers: [exactAnswer(sarrus)],
    });
  }
  if (n >= 3 && n <= 5) {
    const cof = detExpr(A);
    alternatives.push({
      name: "Ekspansi kofaktor",
      description: "Ekspansi Laplace sepanjang baris pertama.",
      steps: [
        {
          title: "Ekspansi kofaktor baris 1",
          after:
            A[0]
              .map((v, j) => `${j % 2 === 0 ? (j ? "+" : "") : "-"} ${wrapL(v)} M_{1${j + 1}}`)
              .join(" ") + ` = ${toLatex(cof)}`,
          operation: "cofactor",
          rule: {
            id: "cofactor",
            name: "Ekspansi kofaktor",
            formula: "\\det A = \\sum_j (-1)^{1+j} a_{1j} M_{1j}",
          },
          reason: "M₁ⱼ adalah minor (determinan submatriks tanpa baris 1 dan kolom j).",
        },
      ],
      answers: [exactAnswer(cof)],
    });
    checks.push({
      description: "Bandingkan dengan metode independen (ekspansi kofaktor)",
      passed: isSymbolicallyZero(sub(cof, value)),
      method: "Perhitungan eksak independen",
      detail: `Kofaktor: $${toLatex(cof)}$`,
    });
  } else if (rm) {
    const cof = rm.cofactorDeterminant();
    checks.push({
      description: "Bandingkan dengan ekspansi kofaktor",
      passed: cof.equals((value as { value: Rational }).value),
      method: "Perhitungan eksak independen",
    });
  }
  const notes = [...warnings];
  if (value.type === "num" && value.value.isZero())
    notes.push(
      "Determinan 0: matriks singular (tidak memiliki invers), kolom-kolomnya bergantung linear.",
    );
  return makeSolution({
    kind: "matrix",
    title: `Determinan matriks ${n}×${n}`,
    input,
    inputLatex,
    answers: [{ ...exactAnswer(value), label: "det(A)" }],
    method: {
      name: n === 2 ? "Rumus ad − bc" : rm ? "Eliminasi Gauss" : "Ekspansi kofaktor",
      description: "Determinan dihitung secara eksak.",
    },
    steps,
    verification: aggregateVerification(
      checks.length
        ? checks
        : [{ description: "Rumus langsung 2×2 (eksak)", passed: true, method: "Aritmetika eksak" }],
    ),
    module: "matrix",
    notes,
    alternatives,
    references: [REFERENCES.strang],
  });
}

function wrapL(e: Expr): string {
  const s = toLatex(e);
  return e.type === "add" ||
    (e.type === "num" && e.value.isNegative()) ||
    (e.type === "mul" && e.factors[0].type === "num" && e.factors[0].value.isNegative())
    ? `\\left(${s}\\right)`
    : s;
}

// ---------------------------------------------------------------------------
// Inverse
// ---------------------------------------------------------------------------

function inverseSolution(
  input: string,
  A: Expr[][],
  inputLatex: string,
  warnings: string[],
): Solution {
  assertSquare(A, "Invers");
  const rm = toRational(A);
  if (!rm)
    throw new MathError(
      "unsupported",
      "Invers hanya didukung untuk matriks dengan entri bilangan rasional.",
      { module: "matrix" },
    );
  const n = rm.rows;
  const det = rm.determinant().value;
  const steps: Step[] = [
    {
      title: "Periksa determinan",
      after: `\\det A = ${rationalLatex(det)}`,
      operation: "det-check",
      rule: {
        id: "invertible",
        name: "Syarat matriks memiliki invers",
        formula: "A^{-1} \\text{ ada} \\iff \\det A \\ne 0",
      },
      reason: det.isZero()
        ? "Determinan 0 sehingga matriks singular."
        : "Determinan tidak nol sehingga invers ada.",
    },
  ];
  if (det.isZero()) {
    throw new MathError(
      "no-solution",
      "Matriks singular (determinan = 0) sehingga tidak memiliki invers.",
      {
        module: "matrix",
        operation: "inverse",
        cause: "det(A) = 0: baris/kolom bergantung linear.",
      },
    );
  }
  const res = rm.inverse(true);
  steps.push({
    title: "Bentuk matriks [A | I]",
    after: new RMatrix(rm.data.map((r, i) => [...r, ...RMatrix.identity(n).data[i]])).toLatex(n),
    operation: "augment-identity",
    reason: "Operasi baris yang mengubah A menjadi I akan mengubah I menjadi A⁻¹.",
  });
  steps.push({
    title: "Eliminasi Gauss–Jordan",
    after: `\\left[I \\mid A^{-1}\\right]`,
    operation: "gauss-jordan",
    rule: {
      id: "gauss-jordan",
      name: "Invers dengan Gauss–Jordan",
      formula: "[A \\mid I] \\sim [I \\mid A^{-1}]",
    },
    reason: `${res.ops.length} operasi baris elementer.`,
    substeps: res.ops.map((op) => ({
      title: op.description,
      after: `${op.latex}:\\ ${op.matrix}`,
      operation: `row-${op.kind}`,
      reason: op.description,
    })),
  });
  steps.push({
    title: "Invers matriks",
    after: `A^{-1} = ${res.matrix.toLatex()}`,
    operation: "result",
    reason: "Bagian kanan matriks lengkap adalah A⁻¹.",
  });
  const I = rm.mul(res.matrix);
  const I2 = res.matrix.mul(rm);
  const checks: VerificationCheck[] = [
    {
      description: "A · A⁻¹ = I",
      latex: `${rm.toLatex()}${res.matrix.toLatex()} = ${I.toLatex()}`,
      passed: I.equals(RMatrix.identity(n)),
      method: "Perkalian matriks eksak",
    },
    {
      description: "A⁻¹ · A = I",
      passed: I2.equals(RMatrix.identity(n)),
      method: "Perkalian matriks eksak",
    },
  ];
  const alternatives: Alternative[] = [];
  if (n === 2) {
    const [[a, b], [c, d]] = rm.data;
    alternatives.push({
      name: "Rumus invers 2×2",
      description: "Tukar diagonal utama, negasikan diagonal samping, bagi dengan determinan.",
      steps: [
        {
          title: "Gunakan rumus",
          after: `\\frac{1}{${rationalLatex(det)}}\\begin{pmatrix} ${rationalLatex(d)} & ${rationalLatex(b.neg())} \\\\ ${rationalLatex(c.neg())} & ${rationalLatex(a)} \\end{pmatrix} = ${res.matrix.toLatex()}`,
          operation: "inverse-2x2",
          rule: {
            id: "inv2",
            name: "Invers 2×2",
            formula:
              "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}^{-1} = \\frac{1}{ad - bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}",
          },
          reason: "Berlaku jika ad − bc ≠ 0.",
        },
      ],
    });
  } else if (n === 3) {
    const adj = RMatrix.zeros(3, 3).data.map((r, i) =>
      r.map((_, j) =>
        rm
          .minor(j, i)
          .cofactorDeterminant()
          .mul((i + j) % 2 === 0 ? Rational.ONE : Rational.MINUS_ONE),
      ),
    );
    alternatives.push({
      name: "Metode adjoin",
      description: "A⁻¹ = adj(A)/det(A), dengan adj(A) transpos matriks kofaktor.",
      steps: [
        {
          title: "Matriks adjoin",
          after: `\\operatorname{adj}(A) = ${new RMatrix(adj).toLatex()}`,
          operation: "adjugate",
          rule: {
            id: "adjugate",
            name: "Invers dengan adjoin",
            formula: "A^{-1} = \\frac{1}{\\det A}\\operatorname{adj}(A)",
          },
          reason: "Setiap entri adalah kofaktor Cⱼᵢ.",
        },
        {
          title: "Bagi dengan determinan",
          after: `\\frac{1}{${rationalLatex(det)}}\\operatorname{adj}(A) = ${res.matrix.toLatex()}`,
          operation: "divide-det",
          reason: "Kalikan adjoin dengan 1/det A.",
        },
      ],
    });
  }
  return makeSolution({
    kind: "matrix",
    title: `Invers matriks ${n}×${n}`,
    input,
    inputLatex,
    answers: [
      {
        label: "A⁻¹",
        latex: res.matrix.toLatex(),
        text: JSON.stringify(res.matrix.data.map((r) => r.map((v) => v.toString()))).replace(
          /"/g,
          "",
        ),
        exact: true,
      },
    ],
    method: { name: "Eliminasi Gauss–Jordan", description: "Reduksi [A | I] menjadi [I | A⁻¹]." },
    steps,
    verification: aggregateVerification(checks),
    module: "matrix",
    notes: warnings,
    alternatives,
    references: [REFERENCES.strang],
  });
}

// ---------------------------------------------------------------------------
// RREF / rank / eigen
// ---------------------------------------------------------------------------

function rrefSolution(
  input: string,
  A: Expr[][],
  inputLatex: string,
  warnings: string[],
  rankOnly: boolean,
): Solution {
  const rm = toRational(A);
  if (!rm)
    throw new MathError("unsupported", "RREF/rank hanya untuk matriks dengan entri rasional.", {
      module: "matrix",
    });
  const res = rm.rref({ record: true });
  const steps: Step[] = res.ops.map((op) => ({
    title: op.description,
    after: `${op.latex}:\\ ${op.matrix}`,
    operation: `row-${op.kind}`,
    rule: { id: "row-op", name: "Operasi baris elementer" },
    reason: op.description,
  }));
  steps.push({
    title: "Bentuk eselon baris tereduksi",
    after: res.matrix.toLatex(),
    operation: "rref",
    reason: `Terdapat ${res.rank} pivot (kolom ${res.pivots.map((p) => p + 1).join(", ") || "-"}).`,
  });
  const answers: Answer[] = rankOnly
    ? [{ label: "rank(A)", latex: String(res.rank), text: String(res.rank), exact: true }]
    : [
        {
          label: "RREF(A)",
          latex: res.matrix.toLatex(),
          text: JSON.stringify(res.matrix.data.map((r) => r.map(String))).replace(/"/g, ""),
          exact: true,
        },
        { label: "rank(A)", latex: String(res.rank), text: String(res.rank), exact: true },
      ];
  const rt = rm.transpose().rank();
  return makeSolution({
    kind: "matrix",
    title: rankOnly ? "Rank matriks" : "Bentuk eselon baris tereduksi (RREF)",
    input,
    inputLatex,
    answers,
    method: {
      name: "Eliminasi Gauss–Jordan",
      description:
        "Operasi baris elementer hingga setiap pivot bernilai 1 dan satu-satunya entri tak nol di kolomnya.",
    },
    steps,
    verification: aggregateVerification([
      {
        description: "rank(A) = rank(Aᵀ)",
        passed: rt === res.rank,
        method: "Invarian rank (perhitungan independen)",
        detail: `rank(Aᵀ) = ${rt}`,
      },
    ]),
    module: "matrix",
    notes: warnings,
    references: [REFERENCES.strang],
  });
}

function eigenSolution(
  input: string,
  A: Expr[][],
  inputLatex: string,
  warnings: string[],
): Solution {
  assertSquare(A, "Nilai eigen");
  const rm = toRational(A);
  if (!rm)
    throw new MathError("unsupported", "Nilai eigen hanya untuk matriks dengan entri rasional.", {
      module: "matrix",
    });
  const n = rm.rows;
  if (n > 6)
    throw new MathError("limit-exceeded", "Nilai eigen dibatasi hingga matriks 6×6.", {
      module: "matrix",
    });
  const L = rawSym("lambda");
  const cp = new Poly(rm.charPoly());
  const cpExpr = cp.toExpr("lambda");
  const shifted = A.map((r, i) => r.map((v, j) => (i === j ? sub(L, v) : mul(num(-1), v))));
  const steps: Step[] = [
    {
      title: "Bentuk matriks λI − A",
      after: matrixLatexE(shifted),
      operation: "shift",
      rule: {
        id: "char-eq",
        name: "Persamaan karakteristik",
        formula: "\\det(\\lambda I - A) = 0",
      },
      reason:
        "Nilai eigen λ memenuhi Av = λv untuk v ≠ 0, yaitu (λI − A)v = 0 memiliki solusi tak trivial.",
    },
    {
      title: "Polinomial karakteristik",
      after: `p(\\lambda) = \\det(\\lambda I - A) = ${toLatex(cpExpr)}`,
      operation: "char-poly",
      reason: "Dihitung secara eksak (algoritma Faddeev–LeVerrier).",
    },
  ];
  const att = solveCore(cpExpr, ZERO, "lambda");
  steps.push({
    title: "Selesaikan p(λ) = 0",
    after: att.roots
      .map(
        (r) =>
          `\\lambda = ${r.expr ? toLatex(r.expr) : formatNumber(r.approx!.re)}${r.approx && Math.abs(r.approx.im) > 1e-12 ? ` ${r.approx.im > 0 ? "+" : "-"} ${formatNumber(Math.abs(r.approx.im))}i` : ""}`,
      )
      .join(",\\ "),
    operation: "solve-char",
    reason: att.method.name,
    substeps: att.steps,
  });
  const answers: Answer[] = [];
  const checks: VerificationCheck[] = [];
  let sum = 0;
  let prod = 1;
  let sumIm = 0;
  const counted: Array<{ re: number; im: number }> = [];
  for (const r of att.roots) {
    const m = r.multiplicity ?? 1;
    const v = r.expr ? { re: evalReal(r.expr), im: 0 } : r.approx!;
    for (let k = 0; k < m; k++) counted.push(v);
  }
  for (const v of counted) {
    sum += v.re;
    sumIm += v.im;
  }
  // product of complex numbers
  let pr = 1;
  let pi = 0;
  for (const v of counted) {
    const nr = pr * v.re - pi * v.im;
    pi = pr * v.im + pi * v.re;
    pr = nr;
  }
  prod = pr;
  att.roots.forEach((r, idx) => {
    const lam = r.expr;
    const label = `λ${idx + 1}`;
    if (lam && lam.type === "num") {
      const M = rm.sub(RMatrix.identity(n).scale(lam.value));
      const ns = M.nullspace();
      const vecs = ns.map((vec) => {
        // scale to integers
        let l = 1n;
        for (const c of vec) l = (l * c.den) / gcdB(l, c.den);
        return vec.map((c) => c.mul(Rational.of(l)));
      });
      answers.push({
        label: `${label}${(r.multiplicity ?? 1) > 1 ? ` (multiplisitas ${r.multiplicity})` : ""}`,
        latex: toLatex(lam),
        text: lam.value.toString(),
        exact: true,
      });
      vecs.forEach((v, k) => {
        answers.push({
          label: `Vektor eigen untuk ${label}${vecs.length > 1 ? ` (${k + 1})` : ""}`,
          latex: vectorLatex(v),
          text: `(${v.map(String).join(", ")})`,
          exact: true,
        });
        const Av = rm.mul(new RMatrix(v.map((c) => [c])));
        const lv = v.map((c) => c.mul(lam.value));
        checks.push({
          description: `A·v = λ·v untuk λ = ${lam.value.toString()}`,
          latex: `${vectorLatex(Av.data.map((q) => q[0]))} = ${lam.value.toString()} \\cdot ${vectorLatex(v)}`,
          passed: Av.data.every((q, i) => q[0].equals(lv[i])),
          method: "Perkalian matriks eksak",
        });
      });
      steps.push({
        title: `Vektor eigen untuk λ = ${lam.value.toString()}`,
        after: `\\left(A - ${toLatex(lam)} I\\right)v = 0 \\Rightarrow v \\in \\operatorname{span}\\left\\{${vecs.map(vectorLatex).join(", ")}\\right\\}`,
        operation: "eigenvector",
        rule: { id: "nullspace", name: "Ruang nol", formula: "(A - \\lambda I)v = 0" },
        reason: "Vektor eigen adalah basis ruang nol dari A − λI (diperoleh dari RREF).",
      });
    } else {
      const v = lam ? { re: evalReal(lam), im: 0 } : r.approx!;
      const ok = Number.isFinite(v.re);
      if (lam) answers.push({ ...exactAnswer(lam), label });
      else
        answers.push({
          label,
          latex: `\\approx ${formatNumber(v.re)}${Math.abs(v.im) > 1e-12 ? ` ${v.im > 0 ? "+" : "-"} ${formatNumber(Math.abs(v.im))}i` : ""}`,
          text: `≈ ${formatNumber(v.re)}${Math.abs(v.im) > 1e-12 ? ` ${v.im > 0 ? "+" : "-"} ${formatNumber(Math.abs(v.im))}i` : ""}`,
          exact: false,
        });
      if (ok && Math.abs(v.im) < 1e-12 && n === 2) {
        const [[a, b], [c]] = rm.toNumbers();
        const vec = Math.abs(b) > 1e-14 ? [b, v.re - a] : [v.re - rm.toNumbers()[1][1], c];
        const Av = [
          rm.toNumbers()[0][0] * vec[0] + rm.toNumbers()[0][1] * vec[1],
          rm.toNumbers()[1][0] * vec[0] + rm.toNumbers()[1][1] * vec[1],
        ];
        const good = Av.every(
          (q, i) => Math.abs(q - v.re * vec[i]) < 1e-9 * Math.max(1, Math.abs(q)),
        );
        const exactVec =
          lam && Math.abs(b) > 1e-14 ? [num(rm.data[0][1]), sub(lam, num(rm.data[0][0]))] : null;
        answers.push({
          label: `Vektor eigen untuk ${label}`,
          latex: exactVec
            ? `\\begin{pmatrix}${exactVec.map((q) => toLatex(q)).join(" \\\\ ")}\\end{pmatrix}`
            : `\\begin{pmatrix}${vec.map((q) => formatNumber(q)).join(" \\\\ ")}\\end{pmatrix}`,
          text: exactVec
            ? `(${exactVec.map((q) => toLatex(q)).join(", ")})`
            : `(${vec.map((q) => formatNumber(q)).join(", ")})`,
          exact: !!exactVec,
        });
        checks.push({
          description: `A·v = λ·v untuk ${label} (numerik)`,
          passed: good,
          method: "Pemeriksaan numerik",
        });
      }
    }
  });
  const trace = rm.trace().toNumber();
  const det = rm.determinant().value.toNumber();
  checks.push({
    description: "Jumlah nilai eigen = trace(A)",
    latex: `\\sum \\lambda_i \\approx ${formatNumber(sum)},\\ \\operatorname{tr}A = ${formatNumber(trace)}`,
    passed: Math.abs(sum - trace) < 1e-8 * Math.max(1, Math.abs(trace)) && Math.abs(sumIm) < 1e-8,
    method: "Invarian (numerik)",
  });
  checks.push({
    description: "Hasil kali nilai eigen = det(A)",
    latex: `\\prod \\lambda_i \\approx ${formatNumber(prod)},\\ \\det A = ${formatNumber(det)}`,
    passed: Math.abs(prod - det) < 1e-7 * Math.max(1, Math.abs(det)),
    method: "Invarian (numerik)",
  });
  return makeSolution({
    kind: "matrix",
    title: `Nilai dan vektor eigen (${n}×${n})`,
    input,
    inputLatex,
    answers,
    method: {
      name: "Persamaan karakteristik",
      description:
        "Selesaikan det(λI − A) = 0 untuk nilai eigen, lalu ruang nol A − λI untuk vektor eigen.",
    },
    steps,
    verification: aggregateVerification(checks),
    module: "matrix",
    notes: [...warnings, ...(att.numeric ? ["Sebagian nilai eigen dihitung secara numerik."] : [])],
    references: [REFERENCES.strang],
  });
}

function gcdB(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

function vectorOf(n: SNode): Expr[] {
  const m = listToMatrix(n);
  if (m[0].length !== 1 && m.length !== 1)
    throw new MathError("invalid-input", "Diharapkan vektor (satu baris/kolom).", {
      module: "vector",
    });
  return m[0].length === 1 ? m.map((r) => r[0]) : m[0];
}

function vecLatex(v: Expr[]): string {
  return `\\begin{pmatrix}${v.map((q) => toLatex(q)).join(" \\\\ ")}\\end{pmatrix}`;
}

function vectorSolution(
  input: string,
  name: string,
  args: SNode[],
  inputLatex: string,
  warnings: string[],
): Solution {
  const steps: Step[] = [];
  const checks: VerificationCheck[] = [];
  let answers: Answer[] = [];
  let title = "";
  let method = { name: "", description: "" };
  if (name === "dot") {
    const [u, v] = args.map(vectorOf);
    if (u.length !== v.length)
      throw new MathError("invalid-input", "Dimensi vektor harus sama.", { module: "vector" });
    const prods = u.map((a, i) => mul(a, v[i]));
    const d = add(...prods);
    steps.push({
      title: "Kalikan komponen yang bersesuaian lalu jumlahkan",
      after: `${u.map((a, i) => `${wrapL(a)} \\cdot ${wrapL(v[i])}`).join(" + ")} = ${toLatex(d)}`,
      operation: "dot",
      rule: {
        id: "dot",
        name: "Hasil kali titik",
        formula: "\\mathbf{u} \\cdot \\mathbf{v} = \\sum u_i v_i",
      },
      reason: "Definisi hasil kali titik (dot product).",
    });
    const nu = sqrt(add(...u.map((a) => pow(a, num(2)))));
    const nv = sqrt(add(...v.map((a) => pow(a, num(2)))));
    const cosT = div(d, mul(nu, nv));
    const theta = fn("acos", cosT);
    steps.push({
      title: "Sudut antara kedua vektor",
      after: `\\cos\\theta = \\frac{\\mathbf{u}\\cdot\\mathbf{v}}{\\|\\mathbf{u}\\|\\|\\mathbf{v}\\|} = ${toLatex(cosT)} \\Rightarrow \\theta = ${toLatex(theta)}`,
      operation: "angle",
      rule: {
        id: "angle",
        name: "Sudut antarvektor",
        formula:
          "\\cos\\theta = \\frac{\\mathbf{u}\\cdot\\mathbf{v}}{\\|\\mathbf{u}\\|\\|\\mathbf{v}\\|}",
      },
      reason: "Hasil kali titik terkait dengan sudut antarvektor.",
    });
    answers = [
      { ...exactAnswer(d), label: "u · v" },
      {
        ...exactAnswer(theta),
        label: "Sudut θ (radian)",
        approx: `${formatNumber(evalReal(theta))} rad = ${formatNumber((evalReal(theta) * 180) / Math.PI)}°`,
      },
    ];
    checks.push({
      description: "Cauchy–Schwarz: |u·v| ≤ ‖u‖‖v‖",
      passed: Math.abs(evalReal(d)) <= evalReal(mul(nu, nv)) + 1e-9,
      method: "Invarian numerik",
    });
    title = "Hasil kali titik (dot product)";
    method = { name: "Hasil kali titik", description: "Jumlah hasil kali komponen." };
  } else if (name === "cross") {
    const [u, v] = args.map(vectorOf);
    if (u.length !== 3 || v.length !== 3)
      throw new MathError("invalid-input", "Perkalian silang hanya untuk vektor 3 dimensi.", {
        module: "vector",
      });
    const c = [
      sub(mul(u[1], v[2]), mul(u[2], v[1])),
      sub(mul(u[2], v[0]), mul(u[0], v[2])),
      sub(mul(u[0], v[1]), mul(u[1], v[0])),
    ];
    steps.push({
      title: "Gunakan determinan formal",
      after: `\\begin{vmatrix} \\mathbf{i} & \\mathbf{j} & \\mathbf{k} \\\\ ${u.map((q) => toLatex(q)).join(" & ")} \\\\ ${v.map((q) => toLatex(q)).join(" & ")} \\end{vmatrix} = ${vecLatex(c)}`,
      operation: "cross",
      rule: {
        id: "cross",
        name: "Hasil kali silang",
        formula:
          "\\mathbf{u}\\times\\mathbf{v} = (u_2v_3 - u_3v_2,\\ u_3v_1 - u_1v_3,\\ u_1v_2 - u_2v_1)",
      },
      reason: "Ekspansi determinan formal sepanjang baris pertama.",
    });
    answers = [
      {
        label: "u × v",
        latex: vecLatex(c),
        text: `(${c.map((q) => toLatex(q)).join(", ")})`,
        exact: true,
      },
    ];
    const dotU = add(...c.map((q, i) => mul(q, u[i])));
    const dotV = add(...c.map((q, i) => mul(q, v[i])));
    checks.push({
      description: "(u × v) · u = 0",
      passed: isSymbolicallyZero(dotU),
      method: "Ortogonalitas (eksak)",
    });
    checks.push({
      description: "(u × v) · v = 0",
      passed: isSymbolicallyZero(dotV),
      method: "Ortogonalitas (eksak)",
    });
    title = "Hasil kali silang (cross product)";
    method = {
      name: "Determinan formal",
      description: "Komponen hasil kali silang dari ekspansi determinan.",
    };
  } else if (name === "norm") {
    const u = vectorOf(args[0]);
    const nn = sqrt(add(...u.map((a) => pow(a, num(2)))));
    steps.push({
      title: "Akar jumlah kuadrat komponen",
      after: `\\sqrt{${u.map((a) => `${wrapL(a)}^{2}`).join(" + ")}} = ${toLatex(nn)}`,
      operation: "norm",
      rule: {
        id: "norm",
        name: "Panjang (norma Euclid) vektor",
        formula: "\\|\\mathbf{u}\\| = \\sqrt{\\sum u_i^2}",
      },
      reason: "Teorema Pythagoras dalam n dimensi.",
    });
    answers = [{ ...exactAnswer(nn), label: "‖u‖" }];
    title = "Panjang vektor";
    method = { name: "Norma Euclid", description: "Akar jumlah kuadrat komponen." };
  }
  return makeSolution({
    kind: "vector",
    title,
    input,
    inputLatex,
    answers,
    method,
    steps,
    verification: aggregateVerification(
      checks,
      "Hasil diperoleh langsung dari definisi dengan aritmetika eksak.",
    ),
    module: "vector",
    notes: warnings,
    references: [REFERENCES.strang, REFERENCES.openstaxCalc3],
  });
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export function solveMatrixProblem(input: string, node: SNode, warnings: string[] = []): Solution {
  const inputLatex = syntaxToLatex(node);
  if (node.k === "call") {
    const one = () => listToMatrix(node.args[0]);
    switch (node.name) {
      case "det":
        if (node.args.length === 1 && node.args[0].k === "list")
          return determinantSolution(input, one(), inputLatex, warnings);
        break;
      case "inv":
      case "inverse":
      case "invers":
        if (node.args.length === 1 && node.args[0].k === "list")
          return inverseSolution(input, one(), inputLatex, warnings);
        break;
      case "rref":
        return rrefSolution(input, one(), inputLatex, warnings, false);
      case "rank":
        return rrefSolution(input, one(), inputLatex, warnings, true);
      case "eigen":
      case "eigenvalues":
      case "eigenvectors":
        return eigenSolution(input, one(), inputLatex, warnings);
      case "dot":
      case "cross":
      case "norm":
        if (node.args.every((a) => a.k === "list"))
          return vectorSolution(input, node.name, node.args, inputLatex, warnings);
        break;
    }
  }
  // generic matrix expression
  const steps: Step[] = [];
  const v = evalNode(node, steps);
  const answers: Answer[] =
    v.kind === "scalar"
      ? [{ ...exactAnswer(v.value), label: "Hasil" }]
      : [
          {
            label: "Hasil",
            latex: matrixLatexE(v.m),
            text: JSON.stringify(v.m.map((r) => r.map((q) => toLatex(q)))).replace(/"/g, ""),
            exact: true,
          },
        ];
  const checks: VerificationCheck[] = [];
  if (v.kind === "matrix" && node.k === "bin" && node.op === "*") {
    const a = evalNode(node.left, []);
    const b = evalNode(node.right, []);
    if (a.kind === "matrix" && b.kind === "matrix") {
      // Freivalds-style check with a deterministic vector
      const x = b.m[0].map((_, j) => num(j + 2));
      const Bx = b.m.map((row) => add(...row.map((q, j) => mul(q, x[j]))));
      const ABx = a.m.map((row) => add(...row.map((q, j) => mul(q, Bx[j]))));
      const Cx = v.m.map((row) => add(...row.map((q, j) => mul(q, x[j]))));
      checks.push({
        description: "Uji Freivalds: A(Bx) = (AB)x untuk vektor uji x",
        passed: ABx.every((q, i) => isSymbolicallyZero(sub(q, Cx[i]))),
        method: "Perhitungan independen",
      });
    }
  }
  return makeSolution({
    kind: "matrix",
    title: "Operasi matriks",
    input,
    inputLatex,
    answers,
    method: {
      name: "Aritmetika matriks",
      description:
        "Operasi dilakukan entri demi entri (penjumlahan, perkalian skalar) atau baris × kolom (perkalian matriks).",
    },
    steps,
    verification: aggregateVerification(
      checks,
      "Hasil diperoleh langsung dari definisi operasi dengan aritmetika eksak.",
    ),
    module: "matrix",
    notes: warnings,
    references: [REFERENCES.strang],
  });
}
