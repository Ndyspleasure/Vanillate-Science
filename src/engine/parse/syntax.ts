/**
 * Syntax tree produced by the parser. It preserves the user's notation (subtraction,
 * division, implicit multiplication, calculus operators) so that arithmetic steps and
 * input echo can follow what the user actually wrote. Algebra works on the canonical
 * `Expr` obtained with `toExpr`.
 */
import type { Rational } from "../core/rational";
import type { SourceSpan } from "../core/errors";

export type RelOp = "=" | "<" | ">" | "<=" | ">=" | "!=";

export type SNode =
  | { k: "num"; value: Rational; text: string; span: SourceSpan }
  | { k: "sym"; name: string; span: SourceSpan }
  | { k: "neg"; arg: SNode; span: SourceSpan }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "^"; left: SNode; right: SNode; implicit?: boolean; span: SourceSpan }
  | { k: "call"; name: string; args: SNode[]; span: SourceSpan }
  | { k: "postfix"; op: "!" | "%" | "°"; arg: SNode; span: SourceSpan }
  | { k: "abs"; arg: SNode; span: SourceSpan }
  | { k: "group"; arg: SNode; span: SourceSpan }
  | { k: "rel"; ops: RelOp[]; operands: SNode[]; span: SourceSpan }
  | { k: "list"; items: SNode[]; bracket: "[" | "{" | "("; span: SourceSpan }
  | { k: "deriv"; expr: SNode; variable: string; order: number; span: SourceSpan }
  | { k: "integral"; expr: SNode; variable: string; lower?: SNode; upper?: SNode; span: SourceSpan }
  | { k: "limit"; expr: SNode; variable: string; to: SNode; direction?: "+" | "-"; span: SourceSpan };

export interface ParseResult {
  /** One node per top-level statement (several for a system of equations). */
  statements: SNode[];
  /** Interpretation notes for ambiguous notation (shown to the user). */
  warnings: string[];
  source: string;
}
