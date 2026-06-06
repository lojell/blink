export interface Identifier {
  name: string;
  character: number;
}

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "new", "delete", "typeof",
  "instanceof", "in", "of", "this", "super", "class", "extends", "implements",
  "interface", "type", "enum", "import", "export", "from", "as", "default",
  "await", "async", "yield", "true", "false", "null", "undefined", "void",
  "throw", "try", "catch", "finally", "public", "private", "protected",
  "static", "readonly", "get", "set",
]);

const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/**
 * Identifier-like tokens on a line with their start column, minus a small
 * keyword stoplist. Pure — no vscode. Order preserved; the caller dedups by name.
 */
export function identifiersOnLine(line: string): Identifier[] {
  const out: Identifier[] = [];
  for (const m of line.matchAll(IDENT_RE)) {
    const name = m[0];
    if (KEYWORDS.has(name)) {
      continue;
    }
    out.push({ name, character: m.index ?? 0 });
  }
  return out;
}
