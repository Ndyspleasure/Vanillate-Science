/**
 * Lexer: converts user input into tokens with source spans.
 *
 * Accepts ASCII notation and common Unicode math symbols (× · ÷ − √ π ∞ ≤ ≥ ≠ ∫ → ² ³ °).
 */
import { MAX_INPUT_LENGTH } from "../core/budget";
import { invalidInput } from "../core/errors";

export type TokenType =
  | "number"
  | "ident"
  | "op"
  | "lparen"
  | "rparen"
  | "lbracket"
  | "rbracket"
  | "lbrace"
  | "rbrace"
  | "comma"
  | "semicolon"
  | "bar"
  | "rel"
  | "arrow"
  | "sqrt"
  | "integral"
  | "underscore"
  | "degree"
  | "prime"
  | "newline"
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  /** Whitespace immediately precedes this token. */
  spaceBefore: boolean;
}

const SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+",
};

const GREEK: Record<string, string> = {
  α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ζ: "zeta", η: "eta", θ: "theta",
  ι: "iota", κ: "kappa", λ: "lambda", μ: "mu", ν: "nu", ξ: "xi", ρ: "rho", σ: "sigma",
  τ: "tau", υ: "upsilon", φ: "phi", χ: "chi", ψ: "psi", ω: "omega",
  Γ: "Gamma", Δ: "Delta", Θ: "Theta", Λ: "Lambda", Ξ: "Xi", Π: "Pi", Σ: "Sigma", Φ: "Phi", Ψ: "Psi", Ω: "Omega",
};

export function tokenize(input: string): Token[] {
  if (input.length > MAX_INPUT_LENGTH) {
    throw invalidInput("Input terlalu panjang.", {
      module: "lexer",
      operation: "tokenize",
      cause: `Panjang input ${input.length} karakter melebihi batas ${MAX_INPUT_LENGTH} karakter.`,
    });
  }
  const tokens: Token[] = [];
  let i = 0;
  let space = false;
  const push = (type: TokenType, value: string, start: number, end: number) => {
    tokens.push({ type, value, start, end, spaceBefore: space });
    space = false;
  };

  while (i < input.length) {
    const ch = input[i];
    if (ch === "\n") {
      push("newline", "\n", i, i + 1);
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      space = true;
      i++;
      continue;
    }
    // numbers: 12, 1.5, .5, 1e-3, 2E+10
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(input[i + 1] ?? ""))) {
      const m = /^(\d*\.?\d*)(?:[eE][+-]?\d+(?![a-zA-Z_]))?/.exec(input.slice(i))!;
      let text = m[0];
      // Avoid swallowing "2e" when e is Euler's number without exponent digits (handled by regex lookahead).
      if (text.endsWith(".") && !/[0-9]/.test(input[i + text.length] ?? "")) {
        // trailing dot like "2." is allowed as 2
      }
      if ((text.match(/\./g) ?? []).length > 1) {
        throw invalidInput("Format angka tidak valid.", {
          module: "lexer",
          span: { start: i, end: i + text.length },
          cause: `Angka '${text}' memiliki lebih dari satu titik desimal.`,
          hint: "Gunakan titik (.) sebagai pemisah desimal, contoh 3.14.",
        });
      }
      push("number", text, i, i + text.length);
      i += text.length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch) && ch !== "_") {
      const m = /^[A-Za-z][A-Za-z0-9]*/.exec(input.slice(i))!;
      push("ident", m[0], i, i + m[0].length);
      i += m[0].length;
      continue;
    }
    if (GREEK[ch]) {
      push("ident", GREEK[ch], i, i + 1);
      i++;
      continue;
    }
    if (ch === "π") {
      push("ident", "pi", i, i + 1);
      i++;
      continue;
    }
    if (ch === "∞") {
      push("ident", "inf", i, i + 1);
      i++;
      continue;
    }
    if (SUPERSCRIPTS[ch]) {
      let j = i;
      let text = "";
      while (j < input.length && SUPERSCRIPTS[input[j]]) {
        text += SUPERSCRIPTS[input[j]];
        j++;
      }
      push("op", "^", i, i);
      if (text === "+" || text === "-") {
        push("op", text, i, j);
      } else {
        const hasSign = text.startsWith("-") || text.startsWith("+");
        if (hasSign) push("op", text[0], i, i + 1);
        push("number", hasSign ? text.slice(1) : text, i, j);
      }
      i = j;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "!=" || two === "==") {
      push("rel", two === "==" ? "=" : two, i, i + 2);
      i += 2;
      continue;
    }
    if (two === "->") {
      push("arrow", "->", i, i + 2);
      i += 2;
      continue;
    }
    if (two === "**") {
      push("op", "^", i, i + 2);
      i += 2;
      continue;
    }
    switch (ch) {
      case "+":
      case "-":
      case "*":
      case "/":
      case "^":
      case "!":
      case "%":
        push("op", ch, i, i + 1);
        break;
      case "−":
      case "–":
        push("op", "-", i, i + 1);
        break;
      case "×":
      case "·":
      case "⋅":
      case "∙":
        push("op", "*", i, i + 1);
        break;
      case "÷":
      case "∕":
        push("op", "/", i, i + 1);
        break;
      case "(":
        push("lparen", ch, i, i + 1);
        break;
      case ")":
        push("rparen", ch, i, i + 1);
        break;
      case "[":
        push("lbracket", ch, i, i + 1);
        break;
      case "]":
        push("rbracket", ch, i, i + 1);
        break;
      case "{":
        push("lbrace", ch, i, i + 1);
        break;
      case "}":
        push("rbrace", ch, i, i + 1);
        break;
      case ",":
        push("comma", ch, i, i + 1);
        break;
      case ";":
        push("semicolon", ch, i, i + 1);
        break;
      case "|":
        push("bar", ch, i, i + 1);
        break;
      case "=":
      case "<":
      case ">":
        push("rel", ch, i, i + 1);
        break;
      case "≤":
        push("rel", "<=", i, i + 1);
        break;
      case "≥":
        push("rel", ">=", i, i + 1);
        break;
      case "≠":
        push("rel", "!=", i, i + 1);
        break;
      case "→":
        push("arrow", "->", i, i + 1);
        break;
      case "√":
        push("sqrt", ch, i, i + 1);
        break;
      case "∛":
        push("sqrt", "3", i, i + 1);
        break;
      case "∜":
        push("sqrt", "4", i, i + 1);
        break;
      case "∫":
        push("integral", ch, i, i + 1);
        break;
      case "_":
        push("underscore", ch, i, i + 1);
        break;
      case "°":
        push("degree", ch, i, i + 1);
        break;
      case "'":
      case "′":
        push("prime", "'", i, i + 1);
        break;
      default:
        throw invalidInput("Input mengandung karakter yang tidak dikenali.", {
          module: "lexer",
          operation: "tokenize",
          span: { start: i, end: i + 1 },
          cause: `Karakter '${ch}' pada posisi ${i + 1} tidak dikenali.`,
          hint: "Gunakan operator + - * / ^, fungsi seperti sin(x), sqrt(x), dan tanda kurung.",
        });
    }
    i++;
  }
  tokens.push({ type: "eof", value: "", start: input.length, end: input.length, spaceBefore: space });
  return tokens;
}
