import * as vscode from "vscode";
import { expandRange, type IEditTracker } from "./editTracker.js";
import type { ILogger } from "../common/logger.js";

/**
 * Subscribe an IEditTracker to document changes: extract the changed line span,
 * pad it, and record the region. Returns a Disposable. vscode adapter — F5-verified.
 */
export function registerEditTracking(
  editTracker: IEditTracker,
  log: ILogger,
): vscode.Disposable {
  let editSeq = 0;
  return vscode.workspace.onDidChangeTextDocument((e) => {
    try {
      if (
        e.document.uri.scheme !== "file" ||
        e.document.isUntitled ||
        e.contentChanges.length === 0
      ) {
        return;
      }
      let startLine = Number.MAX_SAFE_INTEGER;
      let endLine = 0;
      for (const c of e.contentChanges) {
        startLine = Math.min(startLine, c.range.start.line);
        endLine = Math.max(endLine, c.range.end.line);
      }
      const span = expandRange(startLine, endLine, e.document.lineCount, 2);
      const range = new vscode.Range(
        span.startLine,
        0,
        span.endLine,
        e.document.lineAt(span.endLine).text.length,
      );
      editTracker.record({
        path: vscode.workspace.asRelativePath(e.document.uri),
        startLine: span.startLine,
        endLine: span.endLine,
        text: e.document.getText(range),
        seq: ++editSeq,
      });
    } catch (err) {
      log.info(`edit tracker error: ${String(err)}`);
    }
  });
}
