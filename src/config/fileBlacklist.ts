/**
 * Filename-glob matching for blink.disabledFiles. Pure (no vscode): patterns
 * like "*.md" are matched against a document's basename, case-insensitively.
 * Only `*` (any run) and `?` (one char) are glob characters; everything else
 * is literal. Bad patterns never throw — they simply don't match.
 */

function globToRegExp(pattern: string): RegExp | undefined {
  const trimmed = pattern.trim();
  if (!trimmed) { return undefined; }
  const source = trimmed
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  try {
    return new RegExp(`^${source}$`, "i");
  } catch {
    return undefined;
  }
}

/** First pattern matching `basename`, or undefined — so the UI can show which entry blocks a file. */
export function matchDisabledFile(
  basename: string,
  patterns: readonly string[],
): string | undefined {
  for (const pattern of patterns) {
    if (globToRegExp(pattern)?.test(basename)) { return pattern; }
  }
  return undefined;
}

/**
 * The blacklist pattern the tooltip toggle targets for this file: "*.<ext>"
 * when the basename has an extension, the exact basename otherwise (dotfiles
 * like ".gitignore" and trailing-dot names count as extensionless).
 */
export function patternForFile(basename: string): string {
  const dot = basename.lastIndexOf(".");
  if (dot <= 0 || dot === basename.length - 1) { return basename; }
  return `*${basename.slice(dot)}`;
}
