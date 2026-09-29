/**
 * Exact matrices over Q with recorded elementary row operations.
 *
 * Reference: G. Strang, "Introduction to Linear Algebra" (Gaussian elimination, rank,
 * nullspace, inverse by Gauss–Jordan). Characteristic polynomial by the Faddeev–LeVerrier
 * algorithm.
 */
import { tick } from "../core/budget";
import { MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { rationalLatex } from "../steps/format";

export interface RowOp {
  kind: "swap" | "scale" | "add";
  latex: string;
  description: string;
  matrix: string;
}

export const MAX_MATRIX_SIZE = 12;

export class RMatrix {
  readonly rows: number;
  readonly cols: number;
  readonly data: Rational[][];

  constructor(data: Rational[][]) {
    this.rows = data.length;
    this.cols = data.length ? data[0].length : 0;
    if (data.some((r) => r.length !== this.cols)) {
      throw new MathError("invalid-input", "Setiap baris matriks harus memiliki jumlah kolom yang sama.", { module: "matrix" });
    }
    if (this.rows > MAX_MATRIX_SIZE || this.cols > MAX_MATRIX_SIZE + 1) {
      throw new MathError("limit-exceeded", `Ukuran matriks maksimal ${MAX_MATRIX_SIZE}×${MAX_MATRIX_SIZE}.`, { module: "matrix" });
    }
    this.data = data.map((r) => [...r]);
  }

  static from(rows: Array<Array<number | bigint | Rational>>): RMatrix {
    return new RMatrix(rows.map((r) => r.map((v) => (v instanceof Rational ? v : Rational.of(typeof v === "number" ? BigInt(v) : v)))));
  }

  static identity(n: number): RMatrix {
    return new RMatrix(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? Rational.ONE : Rational.ZERO))));
  }

  static zeros(r: number, c: number): RMatrix {
    return new RMatrix(Array.from({ length: r }, () => Array.from({ length: c }, () => Rational.ZERO)));
  }

  get isSquare(): boolean {
    return this.rows === this.cols;
  }

  clone(): RMatrix {
    return new RMatrix(this.data);
  }

  toLatex(augmentAt?: number): string {
    const body = this.data.map((r) => r.map(rationalLatex).join(" & ")).join(" \\\\ ");
    if (augmentAt !== undefined && augmentAt > 0 && augmentAt < this.cols) {
      const spec = "c".repeat(augmentAt) + "|" + "c".repeat(this.cols - augmentAt);
      return `\\left[\\begin{array}{${spec}}${body}\\end{array}\\right]`;
    }
    return `\\begin{pmatrix}${body}\\end{pmatrix}`;
  }

  equals(o: RMatrix): boolean {
    return this.rows === o.rows && this.cols === o.cols && this.data.every((r, i) => r.every((v, j) => v.equals(o.data[i][j])));
  }

  add(o: RMatrix): RMatrix {
    this.assertSameShape(o, "penjumlahan");
    return new RMatrix(this.data.map((r, i) => r.map((v, j) => v.add(o.data[i][j]))));
  }

  sub(o: RMatrix): RMatrix {
    this.assertSameShape(o, "pengurangan");
    return new RMatrix(this.data.map((r, i) => r.map((v, j) => v.sub(o.data[i][j]))));
  }

  scale(c: Rational): RMatrix {
    return new RMatrix(this.data.map((r) => r.map((v) => v.mul(c))));
  }

  mul(o: RMatrix): RMatrix {
    if (this.cols !== o.rows) {
      throw new MathError("invalid-input", `Perkalian matriks tidak terdefinisi: ukuran ${this.rows}×${this.cols} dan ${o.rows}×${o.cols}.`, {
        module: "matrix",
        cause: "Jumlah kolom matriks pertama harus sama dengan jumlah baris matriks kedua.",
      });
    }
    const out: Rational[][] = [];
    for (let i = 0; i < this.rows; i++) {
      const row: Rational[] = [];
      for (let j = 0; j < o.cols; j++) {
        let s = Rational.ZERO;
        for (let k = 0; k < this.cols; k++) {
          tick("matmul");
          s = s.add(this.data[i][k].mul(o.data[k][j]));
        }
        row.push(s);
      }
      out.push(row);
    }
    return new RMatrix(out);
  }

  transpose(): RMatrix {
    return new RMatrix(Array.from({ length: this.cols }, (_, j) => Array.from({ length: this.rows }, (_, i) => this.data[i][j])));
  }

  trace(): Rational {
    this.assertSquare("trace");
    return this.data.reduce((s, r, i) => s.add(r[i]), Rational.ZERO);
  }

  power(n: number): RMatrix {
    this.assertSquare("pangkat");
    if (n < 0) return this.inverse().matrix.power(-n);
    let r = RMatrix.identity(this.rows);
    let b: RMatrix = this;
    let k = n;
    while (k > 0) {
      if (k & 1) r = r.mul(b);
      k >>= 1;
      if (k) b = b.mul(b);
    }
    return r;
  }

  private assertSameShape(o: RMatrix, op: string) {
    if (this.rows !== o.rows || this.cols !== o.cols) {
      throw new MathError("invalid-input", `Operasi ${op} matriks membutuhkan ukuran yang sama (${this.rows}×${this.cols} vs ${o.rows}×${o.cols}).`, { module: "matrix" });
    }
  }

  assertSquare(op: string) {
    if (!this.isSquare) throw new MathError("invalid-input", `${op} hanya terdefinisi untuk matriks persegi (ukuran saat ini ${this.rows}×${this.cols}).`, { module: "matrix" });
  }

  /**
   * Reduced row echelon form by Gauss–Jordan elimination.
   * `augmentAt` is only used for display; `stopAtEchelon` gives row echelon form (Gauss).
   */
  rref(options: { augmentAt?: number; record?: boolean; stopAtEchelon?: boolean; pivotCols?: number } = {}): {
    matrix: RMatrix;
    pivots: number[];
    ops: RowOp[];
    rank: number;
    swaps: number;
    scaleProduct: Rational;
  } {
    const m = this.data.map((r) => [...r]);
    const ops: RowOp[] = [];
    const pivots: number[] = [];
    let swaps = 0;
    let scaleProduct = Rational.ONE;
    const R = (i: number) => `R_{${i + 1}}`;
    const snapshot = () => new RMatrix(m).toLatex(options.augmentAt);
    const record = (op: Omit<RowOp, "matrix">) => {
      if (options.record) ops.push({ ...op, matrix: snapshot() });
    };
    const colLimit = options.pivotCols ?? this.cols;
    let row = 0;
    for (let col = 0; col < colLimit && row < this.rows; col++) {
      tick("rref");
      let p = row;
      while (p < this.rows && m[p][col].isZero()) p++;
      if (p === this.rows) continue;
      if (p !== row) {
        [m[p], m[row]] = [m[row], m[p]];
        swaps++;
        record({ kind: "swap", latex: `${R(row)} \\leftrightarrow ${R(p)}`, description: `Tukar baris ${row + 1} dan baris ${p + 1} agar pivot tidak nol.` });
      }
      const pv = m[row][col];
      if (!options.stopAtEchelon && !pv.isOne()) {
        const inv = pv.inv();
        m[row] = m[row].map((v) => v.mul(inv));
        scaleProduct = scaleProduct.mul(inv);
        record({ kind: "scale", latex: `${R(row)} \\leftarrow ${rationalLatex(inv)}\\,${R(row)}`, description: `Kalikan baris ${row + 1} dengan ${inv.toString()} agar pivot bernilai 1.` });
      }
      const start = options.stopAtEchelon ? row + 1 : 0;
      for (let r = start; r < this.rows; r++) {
        if (r === row || m[r][col].isZero()) continue;
        const factor = m[r][col].div(m[row][col]);
        m[r] = m[r].map((v, j) => v.sub(factor.mul(m[row][j])));
        const sign = factor.isNegative() ? "+" : "-";
        const f = factor.abs();
        record({
          kind: "add",
          latex: `${R(r)} \\leftarrow ${R(r)} ${sign} ${f.isOne() ? "" : rationalLatex(f)}\\,${R(row)}`,
          description: `Nolkan entri baris ${r + 1} kolom ${col + 1}.`,
        });
      }
      pivots.push(col);
      row++;
    }
    return { matrix: new RMatrix(m), pivots, ops, rank: pivots.length, swaps, scaleProduct };
  }

  rank(): number {
    return this.rref().rank;
  }

  /** Determinant by elimination to upper-triangular form (with recorded ops). */
  determinant(record = false): { value: Rational; ops: RowOp[]; triangular: RMatrix; swaps: number } {
    this.assertSquare("Determinan");
    const n = this.rows;
    const m = this.data.map((r) => [...r]);
    const ops: RowOp[] = [];
    let swaps = 0;
    const snap = () => new RMatrix(m).toLatex();
    for (let col = 0; col < n; col++) {
      tick("det");
      let p = col;
      while (p < n && m[p][col].isZero()) p++;
      if (p === n) {
        return { value: Rational.ZERO, ops, triangular: new RMatrix(m), swaps };
      }
      if (p !== col) {
        [m[p], m[col]] = [m[col], m[p]];
        swaps++;
        if (record) ops.push({ kind: "swap", latex: `R_{${col + 1}} \\leftrightarrow R_{${p + 1}}`, description: "Menukar dua baris mengubah tanda determinan.", matrix: snap() });
      }
      for (let r = col + 1; r < n; r++) {
        if (m[r][col].isZero()) continue;
        const factor = m[r][col].div(m[col][col]);
        m[r] = m[r].map((v, j) => v.sub(factor.mul(m[col][j])));
        if (record) {
          const sign = factor.isNegative() ? "+" : "-";
          const f = factor.abs();
          ops.push({ kind: "add", latex: `R_{${r + 1}} \\leftarrow R_{${r + 1}} ${sign} ${f.isOne() ? "" : rationalLatex(f)}\\,R_{${col + 1}}`, description: "Menambahkan kelipatan baris lain tidak mengubah determinan.", matrix: snap() });
        }
      }
    }
    let det = swaps % 2 === 0 ? Rational.ONE : Rational.MINUS_ONE;
    for (let i = 0; i < n; i++) det = det.mul(m[i][i]);
    return { value: det, ops, triangular: new RMatrix(m), swaps };
  }

  /** Determinant by cofactor expansion (for verification / small matrices). */
  cofactorDeterminant(): Rational {
    this.assertSquare("Determinan");
    const n = this.rows;
    if (n > 7) return this.determinant().value;
    if (n === 1) return this.data[0][0];
    if (n === 2) return this.data[0][0].mul(this.data[1][1]).sub(this.data[0][1].mul(this.data[1][0]));
    let s = Rational.ZERO;
    for (let j = 0; j < n; j++) {
      if (this.data[0][j].isZero()) continue;
      const c = this.minor(0, j).cofactorDeterminant().mul(this.data[0][j]);
      s = j % 2 === 0 ? s.add(c) : s.sub(c);
    }
    return s;
  }

  minor(i: number, j: number): RMatrix {
    return new RMatrix(this.data.filter((_, r) => r !== i).map((row) => row.filter((_, c) => c !== j)));
  }

  /** Inverse by Gauss–Jordan on [A | I]. */
  inverse(record = false): { matrix: RMatrix; ops: RowOp[] } {
    this.assertSquare("Invers");
    const n = this.rows;
    const aug = new RMatrix(this.data.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? Rational.ONE : Rational.ZERO))]));
    const res = aug.rref({ augmentAt: n, record, pivotCols: n });
    if (res.rank < n) {
      throw new MathError("no-solution", "Matriks singular (determinan = 0) sehingga tidak memiliki invers.", {
        module: "matrix",
        operation: "inverse",
        cause: `Rank matriks ${res.rank} < ${n}.`,
      });
    }
    return { matrix: new RMatrix(res.matrix.data.map((r) => r.slice(n))), ops: res.ops };
  }

  /** Basis of the nullspace {v : A v = 0}. */
  nullspace(): Rational[][] {
    const { matrix, pivots } = this.rref();
    const free = [];
    for (let j = 0; j < this.cols; j++) if (!pivots.includes(j)) free.push(j);
    return free.map((f) => {
      const v = Array.from({ length: this.cols }, () => Rational.ZERO);
      v[f] = Rational.ONE;
      pivots.forEach((pc, r) => {
        v[pc] = matrix.data[r][f].neg();
      });
      return v;
    });
  }

  /** Characteristic polynomial coefficients (ascending) of det(λI − A) via Faddeev–LeVerrier. */
  charPoly(): Rational[] {
    this.assertSquare("Polinomial karakteristik");
    const n = this.rows;
    const c: Rational[] = new Array(n + 1).fill(Rational.ZERO);
    c[n] = Rational.ONE;
    let M = RMatrix.zeros(n, n);
    const I = RMatrix.identity(n);
    for (let k = 1; k <= n; k++) {
      M = this.mul(M).add(I.scale(c[n - k + 1]));
      const AM = this.mul(M);
      c[n - k] = AM.trace().neg().div(Rational.of(k));
    }
    return c;
  }

  toNumbers(): number[][] {
    return this.data.map((r) => r.map((v) => v.toNumber()));
  }
}

export function vectorLatex(v: Rational[]): string {
  return `\\begin{pmatrix}${v.map(rationalLatex).join(" \\\\ ")}\\end{pmatrix}`;
}
