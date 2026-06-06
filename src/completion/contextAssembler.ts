export interface FimContext {
  prefix: string;
  suffix: string;
}

/**
 * Split a file's text at the cursor into prefix/suffix windows, each truncated
 * to a character budget. When the pre-cursor text overflows and a header budget
 * is given, the top of the file (imports / module declaration) is preserved
 * alongside the cursor-adjacent tail. Pure — no vscode types, trivially testable.
 */
export function assembleContext(
  fullText: string,
  cursorOffset: number,
  maxPrefixChars: number,
  maxSuffixChars: number,
  maxHeaderChars = 0,
): FimContext {
  const before = fullText.slice(0, cursorOffset);
  const after = fullText.slice(cursorOffset);
  const prefix = buildPrefix(before, maxPrefixChars, maxHeaderChars);
  const suffix = after.slice(0, maxSuffixChars);
  return { prefix, suffix };
}

/**
 * Truncate the pre-cursor text to its char budget. When it overflows and a
 * header budget is set, keep whole lines from the top of the file plus the
 * cursor-adjacent tail, joined by a blank line — so long files don't lose their
 * imports. Falls back to a plain tail slice when no header budget is set or no
 * whole header line fits.
 */
function buildPrefix(before: string, maxPrefixChars: number, maxHeaderChars: number): string {
  if (before.length <= maxPrefixChars) {
    return before;
  }
  const tailOnly = before.slice(before.length - maxPrefixChars);
  if (maxHeaderChars <= 0) {
    return tailOnly;
  }
  const rawHeader = before.slice(0, maxHeaderChars);
  const lastNl = rawHeader.lastIndexOf("\n");
  if (lastNl === -1) {
    return tailOnly; // first line longer than the header budget
  }
  const header = rawHeader.slice(0, lastNl);
  const separator = "\n\n";
  const tailBudget = maxPrefixChars - header.length - separator.length;
  if (tailBudget <= 0) {
    return tailOnly;
  }
  const rawTail = before.slice(before.length - tailBudget);
  const firstNl = rawTail.indexOf("\n");
  const tail = firstNl === -1 ? rawTail : rawTail.slice(firstNl + 1);
  return header + separator + tail;
}
