/**
 * Recursive-descent parser (precedence climbing) producing a syntax tree (SNode).
 *
 * Precedence (low → high): relations, + -, * / and implicit multiplication (same level,
 * left-to-right), unary minus, ^ (right associative), postfix (! % ° '), primary.
 *
 * Interpretation choices for ambiguous notation are reported as warnings, e.g.
 * "1/2x" is read as (1/2)·x and "e^2x" as e²·x.
 */
import { MAX_DEPTH } from "../core/budget";
import { invalidInput, MathError } from "../core/errors";
import { Rational } from "../core/rational";
import { KNOWN_FUNCTIONS } from "../expr/simplify";
import { tokenize, type Token } from "./lexer";
import type { ParseResult, RelOp, SNode } from "./syntax";

export const FUNCTION_ALIASES: Record<string, string> = {
  arcsin: "asin", arccos: "acos", arctan: "atan", arccot: "acot", arcsec: "asec", arccsc: "acsc",
  arsinh: "asinh", arcosh: "acosh", artanh: "atanh", arcsinh: "asinh", arccosh: "acosh", arctanh: "atanh",
  sgn: "sign", fpb: "gcd", kpk: "lcm", comb: "binomial", choose: "binomial", nCr: "binomial",
  tg: "tan", ctg: "cot", cosec: "csc", fact: "factorial", lg: "log10", abs: "abs",
};

/** Functions handled during conversion to Expr (not stored as Fn nodes). */
export const SPECIAL_FUNCTIONS = new Set(["sqrt", "cbrt", "root", "nthroot", "exp", "log10", "log2", "nPr", "perm"]);

/** Command-style calls interpreted by the problem router. */
export const COMMANDS = new Set([
  "diff", "derivative", "turunan", "integrate", "integral", "int", "limit", "lim",
  "det", "inv", "inverse", "invers", "transpose", "rank", "rref", "trace", "eigen", "eigenvalues", "eigenvectors",
  "dot", "cross", "norm", "solve", "simplify", "expand", "factor", "taylor", "series", "sum",
  "mean", "median", "mode", "variance", "stdev", "isprime", "primefactors", "divisors", "extrema", "implicit", "modinv", "modpow",
]);

/** Connector words for natural-language bounds: "integral from 0 to 1 of x^2", "lim x menuju 0". */
export const CONNECTOR_WORDS = new Set(["from", "to", "of", "dari", "sampai", "hingga", "menuju", "mendekati"]);
const UPPER_CONNECTORS = new Set(["to", "sampai", "hingga"]);
const LIMIT_ARROWS = new Set(["to", "menuju", "mendekati"]);

const GREEK_NAMES = [
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu", "xi",
  "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega", "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi",
  "Sigma", "Phi", "Psi", "Omega",
];

const FUNCTION_WORDS = new Set([...Object.keys(KNOWN_FUNCTIONS), ...Object.keys(FUNCTION_ALIASES), ...SPECIAL_FUNCTIONS]);
const CONSTANT_WORDS = new Set(["pi", "inf", "infinity"]);
/** Words that may be recognised inside a longer word ("sinx" = sin x). */
const GREEDY_WORDS = [...FUNCTION_WORDS, "pi", ...GREEK_NAMES.filter((g) => g.length >= 3)].sort((a, b) => b.length - a.length);
const WHOLE_WORDS = new Set([...FUNCTION_WORDS, ...CONSTANT_WORDS, ...GREEK_NAMES, ...COMMANDS, ...CONNECTOR_WORDS, "for", "untuk", "d"]);

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function suggestName(word: string): string | null {
  let best: string | null = null;
  let bestD = 3;
  for (const c of [...FUNCTION_WORDS, ...COMMANDS]) {
    const d = editDistance(word.toLowerCase(), c.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function isFunctionName(name: string): boolean {
  return FUNCTION_WORDS.has(name);
}

export function canonicalFunctionName(name: string): string {
  return FUNCTION_ALIASES[name] ?? name;
}

/** Split identifier words into atomic identifiers ("xy" -> x, y; "sinx" -> sin, x). */
function splitWords(tokens: Token[], warnings: string[]): Token[] {
  const out: Token[] = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    const afterUnderscore = idx > 0 && tokens[idx - 1].type === "underscore" && !t.spaceBefore;
    if (t.type !== "ident" || WHOLE_WORDS.has(t.value) || t.end - t.start === 1 || afterUnderscore) {
      out.push(t);
      continue;
    }
    const w = t.value;
    const pieces: string[] = [];
    let p = 0;
    while (p < w.length) {
      const known = GREEDY_WORDS.find((k) => k.length >= 2 && w.startsWith(k, p));
      if (known) {
        pieces.push(known);
        p += known.length;
        continue;
      }
      const m = /^[A-Za-z][0-9]*/.exec(w.slice(p))!;
      pieces.push(m[0]);
      p += m[0].length;
    }
    const next = tokens[idx + 1];
    if (w.length >= 4 && pieces.length > 1 && !FUNCTION_WORDS.has(pieces[pieces.length - 1]) && next?.type === "lparen" && !next.spaceBefore) {
      const guess = suggestName(w);
      throw invalidInput(`Fungsi atau perintah '${w}' tidak dikenal.`, {
        module: "parser",
        span: { start: t.start, end: t.end },
        hint: guess ? `Mungkin maksud Anda '${guess}(…)'?` : "Lihat daftar fungsi yang didukung di halaman Panduan.",
      });
    }
    if (pieces.length === 1 && /^[A-Za-z][0-9]+$/.test(pieces[0])) {
      warnings.push(`'${w}' ditafsirkan sebagai variabel ${w[0]} dengan indeks ${w.slice(1)}. Gunakan ${w[0]}^${w.slice(1)} untuk pangkat.`);
    } else if (pieces.length > 1) {
      warnings.push(`'${w}' ditafsirkan sebagai ${pieces.join("·")}.`);
    }
    let offset = t.start;
    pieces.forEach((piece, idx) => {
      out.push({ type: "ident", value: piece, start: offset, end: offset + piece.length, spaceBefore: idx === 0 ? t.spaceBefore : false });
      offset += piece.length;
    });
  }
  return out;
}

const TERMINATORS = new Set(["eof", "rparen", "rbracket", "rbrace", "comma", "semicolon", "newline", "rel", "bar"]);

class Parser {
  private pos = 0;
  private depth = 0;
  private absDepth = 0;
  private integralStop = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
    private readonly warnings: string[],
  ) {}

  private peek(o = 0): Token {
    return this.tokens[Math.min(this.pos + o, this.tokens.length - 1)];
  }
  private next(): Token {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }
  private isOp(t: Token, v: string): boolean {
    return t.type === "op" && t.value === v;
  }
  private span(start: number): { start: number; end: number } {
    const prev = this.tokens[Math.max(0, this.pos - 1)];
    return { start, end: Math.max(start, prev.end) };
  }
  private fail(message: string, t: Token, cause?: string, hint?: string): never {
    throw invalidInput(message, { module: "parser", span: { start: t.start, end: Math.max(t.end, t.start + 1) }, cause, hint });
  }
  private enter(): void {
    if (++this.depth > MAX_DEPTH) {
      throw new MathError("limit-exceeded", "Ekspresi terlalu dalam bersarang.", {
        module: "parser",
        cause: `Kedalaman ekspresi melebihi ${MAX_DEPTH} tingkat.`,
      });
    }
  }
  private leave(): void {
    this.depth--;
  }

  parseProgram(): SNode[] {
    const statements: SNode[] = [];
    const skipSeparators = () => {
      while (["comma", "semicolon", "newline"].includes(this.peek().type)) this.next();
    };
    skipSeparators();
    while (this.peek().type !== "eof") {
      statements.push(this.parseStatement());
      const t = this.peek();
      if (t.type === "eof") break;
      if (!["comma", "semicolon", "newline"].includes(t.type)) {
        if (t.type === "rparen") this.fail("Kurung tutup ')' tidak memiliki pasangan '('.", t, `Posisi ${t.start + 1}.`);
        if (t.type === "rbracket") this.fail("Kurung siku ']' tidak memiliki pasangan '['.", t);
        if (t.type === "rbrace") this.fail("Kurung kurawal '}' tidak memiliki pasangan '{'.", t);
        if (t.type === "ident" && CONNECTOR_WORDS.has(t.value)) {
          this.fail(`Kata '${t.value}' hanya dapat dipakai untuk batas integral atau limit.`, t, undefined, "Contoh: integral from 0 to 1 of x^2, integral x^2 dari 0 sampai 1, lim x menuju 0 sin(x)/x");
        }
        this.fail("Token tak terduga.", t, `'${t.value}' pada posisi ${t.start + 1} tidak dapat ditafsirkan di sini.`);
      }
      skipSeparators();
    }
    if (statements.length === 0) {
      throw invalidInput("Input kosong.", { module: "parser", hint: "Masukkan soal, misalnya 2x + 5 = 15." });
    }
    return statements;
  }

  private parseStatement(): SNode {
    // Optional trailing "for x" / "untuk x" is handled by the router; tolerate here.
    const node = this.parseRelation();
    const t = this.peek();
    if (t.type === "ident" && (t.value === "for" || t.value === "untuk")) {
      this.next();
      if (this.peek().type === "ident") this.next();
    }
    return node;
  }

  parseRelation(): SNode {
    const start = this.peek().start;
    const first = this.parseExpr();
    if (this.peek().type !== "rel") return first;
    const ops: RelOp[] = [];
    const operands = [first];
    while (this.peek().type === "rel") {
      const opTok = this.next();
      if (TERMINATORS.has(this.peek().type) && this.peek().type !== "bar") {
        this.fail(`Ruas kanan '${opTok.value}' kosong.`, opTok, "Setiap relasi membutuhkan ekspresi di kedua sisi.");
      }
      ops.push(opTok.value as RelOp);
      operands.push(this.parseExpr());
    }
    return { k: "rel", ops, operands, span: this.span(start) };
  }

  parseExpr(): SNode {
    return this.parseAdditive();
  }

  private parseAdditive(): SNode {
    this.enter();
    const start = this.peek().start;
    let left = this.parseMultiplicative();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && (t.value === "+" || t.value === "-")) {
        this.next();
        if (TERMINATORS.has(this.peek().type) && !(this.peek().type === "bar" && this.absDepth === 0)) {
          this.fail(`Operator '${t.value}' di akhir ekspresi membutuhkan operand.`, t, "Ekspresi tidak lengkap.");
        }
        const right = this.parseMultiplicative();
        left = { k: "bin", op: t.value as "+" | "-", left, right, span: this.span(start) };
      } else break;
    }
    this.leave();
    return left;
  }

  private startsImplicit(t: Token): boolean {
    if (t.type === "number" || t.type === "lparen" || t.type === "sqrt") return true;
    if (t.type === "bar") return this.absDepth === 0;
    if (t.type === "ident") {
      if (t.value === "for" || t.value === "untuk" || CONNECTOR_WORDS.has(t.value)) return false;
      if (this.integralStop > 0 && this.isDifferentialAt(this.pos)) return false;
      return true;
    }
    if (t.type === "integral") return true;
    return false;
  }

  private isDifferentialAt(pos: number): boolean {
    const t = this.tokens[pos];
    const v = this.tokens[pos + 1];
    if (!t || t.type !== "ident" || t.value !== "d" || !v || v.type !== "ident") return false;
    if (!/^[A-Za-z]$|^[a-z]+$/.test(v.value) || isFunctionName(v.value)) return false;
    const after = this.tokens[pos + 2];
    return !after || TERMINATORS.has(after.type) || (after.type === "op" && (after.value === "+" || after.value === "-")) || (after.type === "ident" && CONNECTOR_WORDS.has(after.value));
  }

  private parseMultiplicative(): SNode {
    this.enter();
    const start = this.peek().start;
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && (t.value === "*" || t.value === "/")) {
        this.next();
        if (TERMINATORS.has(this.peek().type) && !(this.peek().type === "bar" && this.absDepth === 0)) {
          this.fail(`Operator '${t.value}' membutuhkan operand di sebelah kanan.`, t, "Ekspresi tidak lengkap.");
        }
        const right = this.parseUnary();
        if (t.value === "/" && this.startsImplicit(this.peek()) && !this.peek().spaceBefore && this.peek().type !== "lparen") {
          const shown = this.source.slice(left.span.start, this.peek().end);
          this.warnings.push(`'${shown}' ditafsirkan sebagai (${this.source.slice(left.span.start, right.span.end)})·${this.peek().value}. Gunakan tanda kurung jika maksudnya berbeda, misalnya 1/(2x).`);
        }
        left = { k: "bin", op: t.value as "*" | "/", left, right, span: this.span(start) };
      } else if (this.startsImplicit(t)) {
        if (t.type === "number" && left.k === "num") {
          this.fail("Dua angka berurutan tanpa operator.", t, `Tidak jelas hubungan antara '${left.text}' dan '${t.value}'.`, "Tambahkan operator, misalnya 2*3 atau 2+3.");
        }
        const right = this.parsePower();
        left = { k: "bin", op: "*", left, right, implicit: true, span: this.span(start) };
      } else break;
    }
    this.leave();
    return left;
  }

  private parseUnary(): SNode {
    const t = this.peek();
    if (this.isOp(t, "-")) {
      this.next();
      this.enter();
      const arg = this.parseUnary();
      this.leave();
      return { k: "neg", arg, span: this.span(t.start) };
    }
    if (this.isOp(t, "+")) {
      this.next();
      return this.parseUnary();
    }
    return this.parsePower();
  }

  private parsePower(): SNode {
    const start = this.peek().start;
    const base = this.parsePostfix();
    if (this.isOp(this.peek(), "^")) {
      const caret = this.next();
      if (TERMINATORS.has(this.peek().type)) this.fail("Pangkat tidak lengkap.", caret, "Operator '^' membutuhkan eksponen.");
      this.enter();
      const exp = this.parseUnary();
      this.leave();
      const nxt = this.peek();
      if (this.startsImplicit(nxt) && !nxt.spaceBefore && nxt.type !== "lparen" && exp.k === "num") {
        this.warnings.push(`'${this.source.slice(start, nxt.end)}' ditafsirkan sebagai (${this.source.slice(start, exp.span.end)})·${nxt.value}. Tulis ${this.source.slice(start, caret.end)}(${exp.k === "num" ? exp.text : "…"}${nxt.value}) jika ${nxt.value} termasuk eksponen.`);
      }
      return { k: "bin", op: "^", left: base, right: exp, span: this.span(start) };
    }
    return base;
  }

  private parsePostfix(): SNode {
    const start = this.peek().start;
    let e = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (this.isOp(t, "!")) {
        this.next();
        e = { k: "postfix", op: "!", arg: e, span: this.span(start) };
      } else if (this.isOp(t, "%")) {
        this.next();
        e = { k: "postfix", op: "%", arg: e, span: this.span(start) };
      } else if (t.type === "degree") {
        this.next();
        e = { k: "postfix", op: "°", arg: e, span: this.span(start) };
      } else if (t.type === "prime") {
        let order = 0;
        while (this.peek().type === "prime") {
          this.next();
          order++;
        }
        e = { k: "deriv", expr: e, variable: "", order, span: this.span(start) };
      } else break;
    }
    return e;
  }

  private parseDelimited(open: Token, closeType: Token["type"], closeChar: string): SNode {
    const inner = this.parseRelation();
    const t = this.peek();
    if (t.type !== closeType) {
      if (t.type === "eof") {
        this.fail(`Kurung buka '${open.value}' tidak memiliki pasangan '${closeChar}'.`, open, `Kurung dibuka pada posisi ${open.start + 1} tetapi tidak pernah ditutup.`, `Tambahkan '${closeChar}' di tempat yang sesuai.`);
      }
      this.fail(`Diharapkan '${closeChar}' tetapi ditemukan '${t.value}'.`, t, `Kurung '${open.value}' pada posisi ${open.start + 1} belum ditutup.`);
    }
    this.next();
    return inner;
  }

  private parseList(open: Token, closeType: Token["type"], closeChar: string, bracket: "[" | "{" | "("): SNode {
    const start = open.start;
    const rows: SNode[][] = [[]];
    if (this.peek().type === closeType) {
      this.next();
      return { k: "list", items: [], bracket, span: this.span(start) };
    }
    for (;;) {
      rows[rows.length - 1].push(this.parseRelation());
      const t = this.peek();
      if (t.type === "comma") {
        this.next();
        continue;
      }
      if (t.type === "semicolon" && bracket !== "(") {
        this.next();
        rows.push([]);
        continue;
      }
      if (t.type === closeType) {
        this.next();
        break;
      }
      if (t.type === "eof") this.fail(`Kurung '${open.value}' tidak memiliki pasangan '${closeChar}'.`, open);
      this.fail(`Diharapkan ',' atau '${closeChar}' tetapi ditemukan '${t.value}'.`, t);
    }
    const span = this.span(start);
    if (rows.length > 1) {
      return { k: "list", items: rows.map((r) => ({ k: "list", items: r, bracket, span }) as SNode), bracket, span };
    }
    return { k: "list", items: rows[0], bracket, span };
  }

  private parsePrimary(): SNode {
    this.enter();
    try {
      return this.parsePrimaryInner();
    } finally {
      this.leave();
    }
  }

  private parsePrimaryInner(): SNode {
    const t = this.peek();
    switch (t.type) {
      case "number": {
        this.next();
        const value = Rational.parseDecimal(t.value.endsWith(".") ? t.value.slice(0, -1) : t.value);
        if (!value) this.fail("Format angka tidak valid.", t);
        return { k: "num", value, text: t.value, span: { start: t.start, end: t.end } };
      }
      case "lparen": {
        this.next();
        if (this.peek().type === "rparen") this.fail("Tanda kurung kosong '()'.", t, "Isi tanda kurung dengan ekspresi.");
        const inner = this.parseRelation();
        if (this.peek().type === "comma") {
          // tuple / point
          const items = [inner];
          while (this.peek().type === "comma") {
            this.next();
            items.push(this.parseRelation());
          }
          if (this.peek().type !== "rparen") this.fail("Kurung buka '(' tidak memiliki pasangan ')'.", t);
          this.next();
          return { k: "list", items, bracket: "(", span: this.span(t.start) };
        }
        if (this.peek().type !== "rparen") {
          if (this.peek().type === "eof") {
            this.fail("Kurung buka '(' tidak memiliki pasangan ')'.", t, `Kurung dibuka pada posisi ${t.start + 1} tetapi tidak pernah ditutup.`, "Tambahkan ')' di tempat yang sesuai.");
          }
          this.fail(`Diharapkan ')' tetapi ditemukan '${this.peek().value}'.`, this.peek());
        }
        this.next();
        return { k: "group", arg: inner, span: this.span(t.start) };
      }
      case "lbracket":
        this.next();
        return this.parseList(t, "rbracket", "]", "[");
      case "lbrace": {
        this.next();
        const list = this.parseList(t, "rbrace", "}", "{");
        if (list.k === "list" && list.items.length === 1 && list.items[0].k !== "list") {
          return { k: "group", arg: list.items[0], span: list.span };
        }
        return list;
      }
      case "bar": {
        this.next();
        this.absDepth++;
        const inner = this.parseExpr();
        this.absDepth--;
        if (this.peek().type !== "bar") this.fail("Tanda nilai mutlak '|' tidak ditutup.", t, "Nilai mutlak ditulis |x|.");
        this.next();
        return { k: "abs", arg: inner, span: this.span(t.start) };
      }
      case "sqrt": {
        this.next();
        const index = t.value === "√" ? 2 : Number(t.value);
        if (TERMINATORS.has(this.peek().type)) this.fail("Tanda akar membutuhkan operand.", t);
        const arg = this.parsePower();
        const name = index === 2 ? "sqrt" : "root";
        const args: SNode[] = index === 2 ? [arg] : [arg, { k: "num", value: Rational.of(index), text: String(index), span: { start: t.start, end: t.end } }];
        return { k: "call", name, args, span: this.span(t.start) };
      }
      case "integral":
        this.next();
        return this.parseIntegral(t);
      case "ident":
        return this.parseIdentifier();
      case "eof":
        this.fail("Ekspresi tidak lengkap.", t, "Input berakhir sebelum ekspresi selesai.");
      // eslint-disable-next-line no-fallthrough
      case "rparen":
        this.fail("Kurung tutup ')' tidak memiliki pasangan '('.", t, `Posisi ${t.start + 1}.`);
      // eslint-disable-next-line no-fallthrough
      default:
        if (t.type === "op") {
          this.fail(`Operator '${t.value}' tidak dapat berada di sini.`, t, `Operator '${t.value}' pada posisi ${t.start + 1} tidak memiliki operand di sebelah kiri.`);
        }
        this.fail(`Token tak terduga '${t.value}'.`, t, `Posisi ${t.start + 1}.`);
    }
  }

  private parseSubscript(): string | null {
    if (this.peek().type !== "underscore") return null;
    this.next();
    const t = this.peek();
    if (t.type === "number" || t.type === "ident") {
      this.next();
      return t.value;
    }
    if (t.type === "lbrace" || t.type === "lparen") {
      this.next();
      let text = "";
      while (this.peek().type !== (t.type === "lbrace" ? "rbrace" : "rparen")) {
        if (this.peek().type === "eof") this.fail("Subskrip tidak ditutup.", t);
        text += this.next().value;
      }
      this.next();
      return text;
    }
    this.fail("Subskrip tidak valid setelah '_'.", t);
  }

  private parseIdentifier(): SNode {
    const t = this.next();
    const word = t.value;
    const start = t.start;

    if (CONNECTOR_WORDS.has(word)) {
      this.fail(`Kata '${word}' hanya dapat dipakai untuk batas integral atau limit.`, t, undefined, "Contoh: integral from 0 to 1 of x^2, integral x^2 dari 0 sampai 1, lim x menuju 0 sin(x)/x");
    }

    // School notation C(n, r) and P(n, r) with integer literals: combinations / permutations.
    if ((word === "C" || word === "P") && this.isIntegerPairCall()) {
      this.warnings.push(`${word}(…) ditafsirkan sebagai ${word === "C" ? "kombinasi (nCr)" : "permutasi (nPr)"}.`);
      return this.parseFunction({ ...t, value: word === "C" ? "nCr" : "nPr" });
    }

    // d/dx f  and  d^n/dx^n f
    if (word === "d" && (this.isOp(this.peek(), "/") || this.isOp(this.peek(), "^"))) {
      const save = this.pos;
      let order = 1;
      if (this.isOp(this.peek(), "^") && this.peek(1).type === "number") {
        this.next();
        order = Number(this.next().value);
      }
      if (this.isOp(this.peek(), "/") && this.peek(1).type === "ident" && this.peek(1).value === "d" && this.peek(2).type === "ident") {
        this.next();
        this.next();
        const v = this.next().value;
        if (this.isOp(this.peek(), "^") && this.peek(1).type === "number") {
          this.next();
          const o2 = Number(this.next().value);
          if (o2 !== order) this.fail("Orde turunan pada pembilang dan penyebut berbeda.", t);
        }
        if (!Number.isInteger(order) || order < 1 || order > 10) this.fail("Orde turunan harus bilangan bulat 1–10.", t);
        const expr = this.parseAdditive();
        return { k: "deriv", expr, variable: v, order, span: this.span(start) };
      }
      this.pos = save;
    }

    if ((word === "lim" || word === "limit") && this.peek().type !== "lparen") return this.parseLimit(t);
    if ((word === "lim" || word === "limit") && this.peek().type === "lparen" && this.parenHasArrow()) return this.parseLimit(t);
    if ((word === "int" || word === "integral" || word === "integrate") && this.peek().type !== "lparen") return this.parseIntegral(t);

    if (isFunctionName(word) && !(word === "gamma" && t.end - t.start === 1)) return this.parseFunction(t);

    if (COMMANDS.has(word)) {
      if (this.peek().type !== "lparen") {
        this.fail(`Perintah '${word}' membutuhkan argumen dalam tanda kurung.`, t, undefined, `Contoh: ${word}(...)`);
      }
      const open = this.next();
      const args = this.parseArgs(open);
      return { k: "call", name: word, args, span: this.span(start) };
    }

    if (word === "inf" || word === "infinity") return { k: "sym", name: "inf", span: { start, end: t.end } };

    let name = word;
    if (/^[A-Za-z][0-9]+$/.test(word)) name = `${word[0]}_${word.slice(1)}`;
    const sub = this.parseSubscript();
    if (sub !== null) name = `${name}_${sub}`;
    return { k: "sym", name, span: this.span(start) };
  }

  private isIntegerPairCall(): boolean {
    const [a, b, c, d, e] = [0, 1, 2, 3, 4].map((k) => this.peek(k));
    const int = (x: Token) => x.type === "number" && /^\d+$/.test(x.value);
    return a.type === "lparen" && !a.spaceBefore && int(b) && c.type === "comma" && int(d) && e.type === "rparen";
  }

  private isWord(t: Token, words: Set<string>): boolean {
    return t.type === "ident" && words.has(t.value);
  }

  /** True when an upper-bound connector ("to", "sampai") follows before the end of the statement. */
  private hasUpperConnector(): boolean {
    let depth = 0;
    for (let p = this.pos + 1; p < this.tokens.length; p++) {
      const t = this.tokens[p];
      if (t.type === "lparen" || t.type === "lbracket" || t.type === "lbrace") depth++;
      else if (t.type === "rparen" || t.type === "rbracket" || t.type === "rbrace") depth--;
      else if (depth === 0 && (t.type === "comma" || t.type === "semicolon" || t.type === "newline" || t.type === "eof" || t.type === "rel")) return false;
      else if (depth === 0 && this.isWord(t, UPPER_CONNECTORS)) return true;
      if (depth < 0) return false;
    }
    return false;
  }

  /** "from a to b" / "dari a sampai b" → [a, b], or null when absent. */
  private parseWordBounds(beforeIntegrand: boolean): [SNode, SNode] | null {
    const w = this.peek();
    if (!this.isWord(w, new Set(["from", "dari"])) || !this.hasUpperConnector()) return null;
    const save = this.pos;
    this.next();
    const lower = this.parseAdditive();
    const kw = this.peek();
    if (!this.isWord(kw, UPPER_CONNECTORS)) {
      if (beforeIntegrand) {
        // "integral dari x^2 dari 0 sampai 1": the first "dari" means "of".
        this.pos = save;
        return null;
      }
      this.fail("Diharapkan 'to' atau 'sampai' setelah batas bawah.", kw, undefined, "Contoh: integral from 0 to 1 of x^2");
    }
    this.next();
    let upper: SNode;
    if (beforeIntegrand && !this.hasWordAhead(new Set(["of", "dari"]))) {
      // No "of" separator: the upper bound is a single term ("dari 0 sampai 1 x^2").
      const s0 = this.peek().start;
      upper = this.parseUnaryTerm();
      if (!TERMINATORS.has(this.peek().type)) this.warnings.push(`Batas atas dibaca sebagai '${this.source.slice(s0, upper.span.end)}'. Gunakan 'of'/'dari' atau tanda kurung untuk batas yang lebih rumit, misalnya integral from 0 to (pi/2) of sin(x).`);
    } else upper = this.parseAdditive();
    return [lower, upper];
  }

  private parseUnaryTerm(): SNode {
    const t = this.peek();
    if (this.isOp(t, "-")) {
      this.next();
      const arg = this.parsePower();
      return { k: "neg", arg, span: this.span(t.start) };
    }
    return this.parsePower();
  }

  private hasWordAhead(words: Set<string>): boolean {
    let depth = 0;
    for (let p = this.pos; p < this.tokens.length; p++) {
      const t = this.tokens[p];
      if (t.type === "lparen" || t.type === "lbracket" || t.type === "lbrace") depth++;
      else if (t.type === "rparen" || t.type === "rbracket" || t.type === "rbrace") depth--;
      else if (depth === 0 && (t.type === "comma" || t.type === "semicolon" || t.type === "newline" || t.type === "eof" || t.type === "rel")) return false;
      else if (depth === 0 && this.isWord(t, words)) return true;
      if (depth < 0) return false;
    }
    return false;
  }

  private parenHasArrow(): boolean {
    let depth = 0;
    for (let p = this.pos; p < this.tokens.length; p++) {
      const t = this.tokens[p];
      if (t.type === "lparen") depth++;
      else if (t.type === "rparen") {
        depth--;
        if (depth === 0) return false;
      } else if (t.type === "arrow" && depth === 1) return true;
      else if (t.type === "comma" && depth === 1) return false;
    }
    return false;
  }

  private parseArgs(open: Token): SNode[] {
    const args: SNode[] = [];
    if (this.peek().type === "rparen") {
      this.next();
      return args;
    }
    for (;;) {
      args.push(this.parseRelation());
      const t = this.peek();
      if (t.type === "comma") {
        this.next();
        continue;
      }
      if (t.type === "rparen") {
        this.next();
        return args;
      }
      if (t.type === "eof") this.fail("Kurung buka '(' tidak memiliki pasangan ')'.", open, `Kurung dibuka pada posisi ${open.start + 1}.`);
      this.fail(`Diharapkan ',' atau ')' tetapi ditemukan '${t.value}'.`, t);
    }
  }

  private parseFunction(t: Token): SNode {
    const start = t.start;
    let name = canonicalFunctionName(t.value);
    let baseArg: SNode | null = null;
    if (this.peek().type === "underscore" && (name === "log" || name === "log10" || name === "log2")) {
      this.next();
      const b = this.peek();
      if (b.type === "lbrace" || b.type === "lparen") {
        this.next();
        baseArg = this.parseDelimited(b, b.type === "lbrace" ? "rbrace" : "rparen", b.type === "lbrace" ? "}" : ")");
      } else {
        baseArg = this.parsePrimary();
      }
      name = "log";
    }
    let power: SNode | null = null;
    if (this.isOp(this.peek(), "^")) {
      this.next();
      power = this.parseUnary();
      const isInverse = power.k === "neg" && power.arg.k === "num" && power.arg.value.isOne();
      const inv: Record<string, string> = { sin: "asin", cos: "acos", tan: "atan", cot: "acot", sec: "asec", csc: "acsc", sinh: "asinh", cosh: "acosh", tanh: "atanh" };
      if (isInverse && inv[name]) {
        this.warnings.push(`${name}^-1 ditafsirkan sebagai fungsi invers ${inv[name]} (bukan 1/${name}).`);
        name = inv[name];
        power = null;
      }
    }
    let args: SNode[];
    if (this.peek().type === "lparen") {
      const open = this.next();
      args = this.parseArgs(open);
    } else {
      const nt = this.peek();
      if (!this.startsImplicit(nt) || nt.type === "bar") {
        if (nt.type === "bar" && this.absDepth === 0) {
          args = [this.parsePower()];
        } else {
          this.fail(`Fungsi '${t.value}' membutuhkan argumen.`, t, undefined, `Contoh: ${t.value}(x)`);
        }
      } else {
        let arg = this.parsePower();
        while (
          this.startsImplicit(this.peek()) &&
          this.peek().type !== "lparen" &&
          this.peek().type !== "sqrt" &&
          !(this.peek().type === "ident" && (isFunctionName(this.peek().value) || COMMANDS.has(this.peek().value)))
        ) {
          const right = this.parsePower();
          arg = { k: "bin", op: "*", left: arg, right, implicit: true, span: { start: arg.span.start, end: right.span.end } };
        }
        args = [arg];
      }
    }
    if (baseArg) args = [args[0], baseArg];
    let node: SNode = { k: "call", name, args, span: this.span(start) };
    if (power) node = { k: "bin", op: "^", left: node, right: power, span: this.span(start) };
    return node;
  }

  private parseBound(): SNode {
    const t = this.peek();
    if (t.type === "lbrace" || t.type === "lparen") {
      this.next();
      return this.parseDelimited(t, t.type === "lbrace" ? "rbrace" : "rparen", t.type === "lbrace" ? "}" : ")");
    }
    if (this.isOp(t, "-")) {
      this.next();
      const arg = this.parsePostfix();
      return { k: "neg", arg, span: this.span(t.start) };
    }
    return this.parsePostfix();
  }

  private parseIntegral(t: Token): SNode {
    const start = t.start;
    let lower: SNode | undefined;
    let upper: SNode | undefined;
    if (this.peek().type === "underscore") {
      this.next();
      lower = this.parseBound();
    }
    if (this.isOp(this.peek(), "^")) {
      this.next();
      upper = this.parseBound();
    }
    if ((lower && !upper) || (!lower && upper)) this.fail("Integral tentu membutuhkan batas bawah dan batas atas.", t, undefined, "Contoh: ∫_0^1 x^2 dx");
    if (!lower) {
      const wb = this.parseWordBounds(true);
      if (wb) [lower, upper] = wb;
    }
    if (this.isWord(this.peek(), new Set(["of", "dari"]))) this.next();
    this.integralStop++;
    let variable = "";
    let expr: SNode;
    if (this.isDifferentialAt(this.pos)) {
      // ∫ dx / x  or ∫ dx
      this.next();
      variable = this.next().value;
      expr = { k: "num", value: Rational.ONE, text: "1", span: { start: t.end, end: t.end } };
      if (this.isOp(this.peek(), "/")) {
        this.next();
        const den = this.parseMultiplicative();
        expr = { k: "bin", op: "/", left: expr, right: den, span: this.span(start) };
      }
      this.integralStop--;
      return { k: "integral", expr, variable, lower, upper, span: this.span(start) };
    }
    expr = this.parseAdditive();
    this.integralStop--;
    if (this.peek().type === "ident" && this.peek().value === "d" && this.peek(1).type === "ident") {
      this.next();
      variable = this.next().value;
    } else {
      this.warnings.push("Diferensial (misalnya dx) tidak ditulis; variabel integrasi ditentukan otomatis.");
    }
    if (!lower) {
      const wb = this.parseWordBounds(false);
      if (wb) [lower, upper] = wb;
    }
    return { k: "integral", expr, variable, lower, upper, span: this.span(start) };
  }

  private parseLimit(t: Token): SNode {
    const start = t.start;
    let variable = "";
    let to: SNode;
    let direction: "+" | "-" | undefined;
    const readDirection = (closeType?: Token["type"]) => {
      const p = this.peek();
      const isDirTok = (tok: Token) => tok.type === "op" && (tok.value === "+" || tok.value === "-");
      if (this.isOp(p, "^") && isDirTok(this.peek(1))) {
        this.next();
        direction = this.next().value as "+" | "-";
      } else if (isDirTok(p) && !p.spaceBefore && (closeType ? this.peek(1).type === closeType : true)) {
        const after = this.peek(1);
        if (closeType || after.spaceBefore || TERMINATORS.has(after.type)) {
          this.next();
          direction = p.value as "+" | "-";
        }
      }
    };
    const parseTarget = (closeType?: Token["type"]): SNode => {
      if (closeType) {
        // parse until the closing token, stripping a trailing direction marker
        const tStart = this.peek().start;
        let node = this.parseMultiplicativeForLimit(closeType);
        readDirection(closeType);
        while (this.isOp(this.peek(), "+") || this.isOp(this.peek(), "-")) {
          const op = this.next();
          if (this.peek().type === closeType) {
            direction = op.value as "+" | "-";
            break;
          }
          const right = this.parseMultiplicativeForLimit(closeType);
          node = { k: "bin", op: op.value as "+" | "-", left: node, right, span: this.span(tStart) };
          readDirection(closeType);
        }
        return node;
      }
      const neg = this.isOp(this.peek(), "-");
      const s = this.peek().start;
      if (neg) this.next();
      let node = this.parsePostfix();
      if (neg) node = { k: "neg", arg: node, span: this.span(s) };
      readDirection();
      return node;
    };

    if (this.peek().type === "underscore") this.next();
    const open = this.peek();
    if (open.type === "lbrace" || open.type === "lparen") {
      this.next();
      const close = open.type === "lbrace" ? "rbrace" : "rparen";
      const v = this.next();
      if (v.type !== "ident") this.fail("Variabel limit tidak valid.", v, undefined, "Contoh: lim_{x->0} sin(x)/x");
      variable = v.value;
      if (this.peek().type !== "arrow") this.fail("Diharapkan '->' pada notasi limit.", this.peek(), undefined, "Contoh: lim_{x->0} sin(x)/x");
      this.next();
      to = parseTarget(close);
      if (this.peek().type !== close) this.fail(`Diharapkan '${close === "rbrace" ? "}" : ")"}' pada notasi limit.`, this.peek());
      this.next();
    } else {
      const v = this.next();
      if (v.type !== "ident") this.fail("Variabel limit tidak valid.", v, undefined, "Contoh: lim x->0 sin(x)/x");
      variable = v.value;
      if (this.peek().type !== "arrow" && !this.isWord(this.peek(), LIMIT_ARROWS)) this.fail("Diharapkan '->' pada notasi limit.", this.peek(), undefined, "Contoh: lim x->0 sin(x)/x");
      this.next();
      to = parseTarget();
      if (this.isWord(this.peek(), new Set(["of", "dari"]))) this.next();
    }
    if (TERMINATORS.has(this.peek().type)) this.fail("Limit membutuhkan ekspresi.", this.peek(), undefined, "Contoh: lim x->0 sin(x)/x");
    const expr = this.parseAdditive();
    return { k: "limit", expr, variable, to, direction, span: this.span(start) };
  }

  private parseMultiplicativeForLimit(closeType: Token["type"]): SNode {
    // like parseMultiplicative but a trailing ^+ / ^- is a direction marker
    const start = this.peek().start;
    let left = this.parseLimitPower(closeType);
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && (t.value === "*" || t.value === "/")) {
        this.next();
        const right = this.parseLimitPower(closeType);
        left = { k: "bin", op: t.value as "*" | "/", left, right, span: this.span(start) };
      } else if (this.startsImplicit(t)) {
        const right = this.parseLimitPower(closeType);
        left = { k: "bin", op: "*", left, right, implicit: true, span: this.span(start) };
      } else break;
    }
    return left;
  }

  private parseLimitPower(closeType: Token["type"]): SNode {
    const start = this.peek().start;
    if (this.isOp(this.peek(), "-")) {
      this.next();
      const arg = this.parseLimitPower(closeType);
      return { k: "neg", arg, span: this.span(start) };
    }
    const base = this.parsePostfix();
    if (this.isOp(this.peek(), "^")) {
      const n1 = this.peek(1);
      if (n1.type === "op" && (n1.value === "+" || n1.value === "-") && this.peek(2).type === closeType) return base;
      this.next();
      const exp = this.parseUnary();
      return { k: "bin", op: "^", left: base, right: exp, span: this.span(start) };
    }
    return base;
  }
}

export function parse(input: string): ParseResult {
  const warnings: string[] = [];
  const raw = tokenize(input);
  const tokens = splitWords(raw, warnings);
  const parser = new Parser(tokens, input, warnings);
  const statements = parser.parseProgram();
  return { statements, warnings: [...new Set(warnings)], source: input };
}

/** Parse a single expression/relation; errors if the input contains several statements. */
export function parseSingle(input: string): { node: SNode; warnings: string[] } {
  const r = parse(input);
  if (r.statements.length !== 1) {
    throw invalidInput("Diharapkan satu ekspresi.", {
      module: "parser",
      cause: `Ditemukan ${r.statements.length} bagian yang dipisahkan koma/titik koma.`,
    });
  }
  return { node: r.statements[0], warnings: r.warnings };
}
