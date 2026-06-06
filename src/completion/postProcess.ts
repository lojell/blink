export interface PostProcessContext {
  prefix: string;
  suffix: string;
  stop: string[];
}

const OPEN = "([{";
const CLOSE = ")]}";
const PAIR: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

/**
 * Clean a raw model completion before it becomes ghost text:
 *  - cut at the first stop/FIM token the model echoed,
 *  - clamp over-generation to a sensible number of lines (O2),
 *  - drop a completion that just repeats the suffix,
 *  - drop trailing closing brackets the suffix already supplies (O1),
 *  - return "" for empty / whitespace-only output (caller shows nothing).
 */
export function postProcess(raw: string, ctx: PostProcessContext): string {
  const { prefix, suffix, stop } = ctx;
  let out = raw;

  // 1. Cut at the earliest stop token.
  let cut = out.length;
  for (const token of stop) {
    const i = out.indexOf(token);
    if (i !== -1 && i < cut) {
      cut = i;
    }
  }
  out = out.slice(0, cut);

  // 2. Multiline gating: keep multi-line only where a block is plausible.
  out = clampMultiline(out, prefix, suffix);

  // 3. Exact repeat of the suffix -> nothing to add.
  if (suffix.length > 0 && out.trim() === suffix.trim()) {
    return "";
  }

  // 4. Bracket balancing: drop trailing unmatched closers the suffix supplies.
  out = balanceTrailingBrackets(out, suffix);

  // 5. Whitespace-only -> nothing.
  if (out.trim().length === 0) {
    return "";
  }

  return out;
}

/**
 * Restrict over-generation. When code already follows the cursor on the current
 * line, keep a single line; otherwise allow multiple lines but stop at the first
 * line that dedents below the cursor's indentation (the block has ended).
 */
function clampMultiline(out: string, prefix: string, suffix: string): string {
  const lineSuffix = suffix.split("\n", 1)[0];
  if (lineSuffix.trim().length > 0) {
    const nl = out.indexOf("\n");
    return nl === -1 ? out : out.slice(0, nl);
  }
  const cursorIndent = leadingWs(prefix.slice(prefix.lastIndexOf("\n") + 1));
  const lines = out.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i > 0 && line.trim().length > 0 && leadingWs(line).length < cursorIndent.length) {
      break;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

function leadingWs(s: string): string {
  const m = /^[ \t]*/.exec(s);
  return m ? m[0] : "";
}

/**
 * Drop trailing closing brackets the completion leaves unmatched when the suffix
 * already supplies them (e.g. the cursor sat inside `foo(|)` and the model
 * re-emitted the `)`). String/template literals are skipped so a bracket inside
 * a quote is never counted. Trims at most as many closers as the suffix leads
 * with, stopping at the first matched/non-supplied closer (precision first).
 */
function balanceTrailingBrackets(out: string, suffix: string): string {
  const supplied = leadingClosers(suffix);
  if (supplied.length === 0) {
    return out;
  }
  let result = out;
  for (let guard = 0; guard < supplied.length; guard++) {
    const trimmed = result.replace(/\s+$/, "");
    const last = trimmed[trimmed.length - 1];
    if (
      !last ||
      !CLOSE.includes(last) ||
      !supplied.includes(last) ||
      !endsWithUnmatchedCloser(trimmed)
    ) {
      break;
    }
    result = trimmed.slice(0, -1);
  }
  return result;
}

/** The run of closing brackets at the start of the suffix, skipping whitespace. */
function leadingClosers(suffix: string): string {
  let closers = "";
  for (const ch of suffix) {
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      continue;
    }
    if (CLOSE.includes(ch)) {
      closers += ch;
    } else {
      break;
    }
  }
  return closers;
}

/** True if the final bracket of `s` is a closer with no opener within `s`. */
function endsWithUnmatchedCloser(s: string): boolean {
  const stack: string[] = [];
  let quote: string | null = null;
  let unmatched = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (OPEN.includes(ch)) {
      stack.push(ch);
      unmatched = false;
    } else if (CLOSE.includes(ch)) {
      if (stack.length > 0 && stack[stack.length - 1] === PAIR[ch]) {
        stack.pop();
        unmatched = false;
      } else {
        unmatched = true;
      }
    }
  }
  return unmatched;
}
