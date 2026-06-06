const IDENT = /[A-Za-z0-9_$]/;

/**
 * Decide whether to request a completion at this cursor position. Explicit
 * invocations always proceed; automatic triggers are suppressed when the cursor
 * sits mid-identifier (completing the back half of a word fights the language
 * server and is rarely wanted). `lineSuffix` is the text after the cursor on the
 * current line; `isInvoke` is true for an explicit user trigger.
 */
export function shouldRequest(lineSuffix: string, isInvoke: boolean): boolean {
  if (isInvoke) {
    return true;
  }
  const charAfter = lineSuffix[0] ?? "";
  return !IDENT.test(charAfter);
}
