/**
 * Pull a usable signature out of hover markdown: the first fenced code block's
 * contents, else the first non-empty non-fence line. Null if nothing usable —
 * the caller then falls back to the definition. Pure — no vscode.
 */
export function extractSignature(hoverText: string): string | null {
  const fence = /```[^\n]*\n([\s\S]*?)```/.exec(hoverText);
  if (fence) {
    const code = fence[1].trim();
    if (code.length > 0) {
      return code;
    }
  }
  for (const raw of hoverText.split("\n")) {
    const line = raw.trim();
    if (line.length > 0 && !line.startsWith("```")) {
      return line;
    }
  }
  return null;
}
