/**
 * Structured error model for the math engine.
 *
 * CLAUDE.md §23 requires that failures are classified (invalid input, unsupported,
 * no solution, numerical instability, timeout, verification failure, ...) and
 * explained in language users can understand. Every engine failure is a MathError.
 */

export type MathErrorKind =
  | "invalid-input"
  | "unsupported"
  | "ambiguous"
  | "no-solution"
  | "infinite-solutions"
  | "numerical-instability"
  | "timeout"
  | "limit-exceeded"
  | "internal"
  | "verification-failure"
  | "domain-error"
  | "division-by-zero"
  | "dimension-mismatch";

export interface SourceSpan {
  start: number;
  end: number;
}

export interface MathErrorOptions {
  /** Engine module that raised the error, e.g. "parser", "equation". */
  module?: string;
  /** Operation being performed, e.g. "parse-primary". */
  operation?: string;
  /** Location in the user input, when known. */
  span?: SourceSpan;
  /** Human readable cause ("Penyebab: ..."). */
  cause?: string;
  /** Suggestion for the user. */
  hint?: string;
  /** Extra structured data for debugging (never sensitive). */
  details?: Record<string, unknown>;
}

const KIND_TITLES: Record<MathErrorKind, string> = {
  "invalid-input": "Input tidak valid",
  unsupported: "Jenis soal belum didukung",
  ambiguous: "Input ambigu",
  "no-solution": "Tidak ada solusi",
  "infinite-solutions": "Solusi tak hingga banyaknya",
  "numerical-instability": "Ketidakstabilan numerik",
  timeout: "Waktu komputasi habis",
  "limit-exceeded": "Batas komputasi terlampaui",
  internal: "Kesalahan internal solver",
  "verification-failure": "Verifikasi gagal",
  "domain-error": "Di luar domain",
  "division-by-zero": "Pembagian dengan nol",
  "dimension-mismatch": "Dimensi/satuan tidak cocok",
};

export class MathError extends Error {
  readonly kind: MathErrorKind;
  readonly module?: string;
  readonly operation?: string;
  readonly span?: SourceSpan;
  readonly causeText?: string;
  readonly hint?: string;
  readonly details?: Record<string, unknown>;
  readonly timestamp: string;

  constructor(kind: MathErrorKind, message: string, options: MathErrorOptions = {}) {
    super(message);
    this.name = "MathError";
    this.kind = kind;
    this.module = options.module;
    this.operation = options.operation;
    this.span = options.span;
    this.causeText = options.cause;
    this.hint = options.hint;
    this.details = options.details;
    this.timestamp = new Date().toISOString();
  }

  get title(): string {
    return KIND_TITLES[this.kind];
  }

  toJSON(): SerializedMathError {
    return {
      kind: this.kind,
      title: this.title,
      message: this.message,
      cause: this.causeText,
      hint: this.hint,
      module: this.module,
      operation: this.operation,
      span: this.span,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

export interface SerializedMathError {
  kind: MathErrorKind;
  title: string;
  message: string;
  cause?: string;
  hint?: string;
  module?: string;
  operation?: string;
  span?: SourceSpan;
  details?: Record<string, unknown>;
  timestamp: string;
}

export function isMathError(e: unknown): e is MathError {
  return e instanceof MathError;
}

/** Convert any thrown value into a serializable MathError payload. */
export function toSerializedError(e: unknown, module = "engine"): SerializedMathError {
  if (isMathError(e)) return e.toJSON();
  if (e instanceof RangeError && /Maximum call stack/i.test(e.message)) {
    return new MathError("limit-exceeded", "Ekspresi terlalu dalam/rumit untuk diproses.", {
      module,
      cause: "Kedalaman rekursi melebihi batas aman.",
      hint: "Sederhanakan input atau pecah menjadi beberapa bagian.",
    }).toJSON();
  }
  const message = e instanceof Error ? e.message : String(e);
  return new MathError("internal", "Terjadi kesalahan internal pada solver.", {
    module,
    cause: message,
    hint: "Coba tulis ulang soal dengan notasi lain. Jika masalah berlanjut, laporkan input ini.",
  }).toJSON();
}

export function invalidInput(message: string, options: MathErrorOptions = {}): MathError {
  return new MathError("invalid-input", message, options);
}

export function unsupported(message: string, options: MathErrorOptions = {}): MathError {
  return new MathError("unsupported", message, options);
}

export function domainError(message: string, options: MathErrorOptions = {}): MathError {
  return new MathError("domain-error", message, options);
}
