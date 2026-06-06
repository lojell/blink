/** Minimal cancellation surface — matches vscode.CancellationToken's shape. */
export interface Cancellable {
  isCancellationRequested: boolean;
}

/**
 * Wait `ms`, then report whether we should proceed. Resolves false if the token
 * was cancelled before or during the wait (a newer keystroke superseded us).
 */
export function delay(ms: number, token: Cancellable): Promise<boolean> {
  if (token.isCancellationRequested) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    setTimeout(() => resolve(!token.isCancellationRequested), ms);
  });
}
