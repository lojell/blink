export interface LastServed {
  scope: string;
  prefix: string;
  suffix: string;
  completion: string;
}

/**
 * When the new (scope, prefix, suffix) is the last-served suggestion with more
 * matching characters typed, return the remaining tail; otherwise null. Lets
 * forward-typing into a suggestion serve from memory with no model call. Pure.
 */
export function reuseCompletion(
  last: LastServed | null,
  scope: string,
  prefix: string,
  suffix: string,
): string | null {
  if (!last || last.scope !== scope || last.suffix !== suffix) {
    return null;
  }
  if (!prefix.startsWith(last.prefix)) {
    return null;
  }
  const delta = prefix.slice(last.prefix.length);
  if (delta.length === 0 || !last.completion.startsWith(delta)) {
    return null;
  }
  const remaining = last.completion.slice(delta.length);
  return remaining.length > 0 ? remaining : null;
}

/**
 * Tiny LRU cache for completions. A Map preserves insertion order; re-inserting
 * on read moves a key to "most recently used", so the first key is always the
 * least recently used and is evicted when over capacity.
 */
export class CompletionCache {
  private readonly store = new Map<string, string>();
  private lastServed: LastServed | null = null;

  constructor(private readonly maxEntries: number) {}

  makeKey(
    model: string,
    prefix: string,
    suffix: string,
    path = "",
    format = "",
    context = "",
  ): string {
    // Use the prefix tail and suffix head — the bytes nearest the cursor.
    // \x1f (unit separator) can't appear in source, so fields can't bleed
    // together and collide (e.g. a trailing vs. leading space at the seam).
    // Path + format + context keep distinct files / toggle states / edit-context
    // in separate entries.
    const pTail = prefix.slice(-256);
    const sHead = suffix.slice(0, 256);
    return `${model}\x1f${pTail}\x1f${sHead}\x1f${path}\x1f${format}\x1f${context}`;
  }

  get(key: string): string | undefined {
    const value = this.store.get(key);
    if (value === undefined) {
      return undefined;
    }
    // Touch: move to most-recently-used.
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, value);
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value as string;
      this.store.delete(oldest);
    }
  }

  reuse(scope: string, prefix: string, suffix: string): string | null {
    return reuseCompletion(this.lastServed, scope, prefix, suffix);
  }

  recordServed(scope: string, prefix: string, suffix: string, completion: string): void {
    this.lastServed = { scope, prefix, suffix, completion };
  }
}
