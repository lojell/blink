import * as vscode from "vscode";
import type { ContextFile } from "../edits/editTracker.js";
import { identifiersOnLine } from "./identifiers.js";
import { extractSignature } from "./hoverSignature.js";
import { token } from "../di/container.js";

const MAX_CACHE = 50;
const DEF_MAX_LINES = 6;

// Merges with the interface below: one name serves as both type and token.
export const ILspContextProvider = token<ILspContextProvider>("lspContext");

export interface ILspContextProvider {
  collect(
    document: vscode.TextDocument,
    position: vscode.Position,
    maxSnippets: number,
    maxChars: number,
    budgetMs: number,
  ): Promise<ContextFile[]>;
  clear(): void;
}

/**
 * Collects LSP type context for symbols on the cursor's line: a hover signature,
 * falling back to the definition snippet. Time-boxed per completion and cached by
 * symbol name (negative results included). vscode-bound; every call is wrapped so
 * it can never throw into a completion.
 */
export class LspContextProvider implements ILspContextProvider {
  private readonly cache = new Map<string, ContextFile | null>();

  clear(): void {
    this.cache.clear();
  }

  async collect(
    document: vscode.TextDocument,
    position: vscode.Position,
    maxSnippets: number,
    maxChars: number,
    budgetMs: number,
  ): Promise<ContextFile[]> {
    const line = document.lineAt(position.line).text;
    const seen = new Set<string>();
    const names: { name: string; character: number }[] = [];
    for (const id of identifiersOnLine(line)) {
      // Skip the token the cursor sits inside (incomplete) and duplicates.
      const inside =
        position.character > id.character &&
        position.character <= id.character + id.name.length;
      if (inside || seen.has(id.name)) {
        continue;
      }
      seen.add(id.name);
      names.push(id);
      if (names.length >= maxSnippets) {
        break;
      }
    }

    const deadline = Date.now() + budgetMs;
    const out: ContextFile[] = [];
    let chars = 0;
    for (const id of names) {
      let cf = this.cache.get(id.name);
      if (cf === undefined) {
        if (Date.now() >= deadline) {
          break;
        }
        cf = await this.lookup(
          document,
          new vscode.Position(position.line, id.character),
          id.name,
        );
        this.remember(id.name, cf);
      }
      if (cf && chars + cf.content.length <= maxChars && !this.collides(cf, document, out)) {
        out.push(cf);
        chars += cf.content.length;
      }
    }
    return out;
  }

  private remember(name: string, cf: ContextFile | null): void {
    this.cache.set(name, cf);
    if (this.cache.size > MAX_CACHE) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
  }

  private collides(cf: ContextFile, document: vscode.TextDocument, out: ContextFile[]): boolean {
    if (cf.path === vscode.workspace.asRelativePath(document.uri)) {
      return true;
    }
    return out.some((o) => o.path === cf.path && o.content === cf.content);
  }

  private async lookup(
    document: vscode.TextDocument,
    position: vscode.Position,
    name: string,
  ): Promise<ContextFile | null> {
    try {
      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        "vscode.executeHoverProvider",
        document.uri,
        position,
      );
      const sig = extractSignature(hoverText(hovers));
      if (sig) {
        return { path: name, content: sig };
      }
    } catch {
      // fall through to the definition
    }
    try {
      const defs = await vscode.commands.executeCommand<
        (vscode.Location | vscode.LocationLink)[]
      >("vscode.executeDefinitionProvider", document.uri, position);
      const loc = defs?.[0];
      if (!loc) {
        return null;
      }
      const targetUri = "targetUri" in loc ? loc.targetUri : loc.uri;
      const targetRange = "targetRange" in loc ? loc.targetRange : loc.range;
      const doc = await vscode.workspace.openTextDocument(targetUri);
      const endLine = Math.min(doc.lineCount - 1, targetRange.start.line + DEF_MAX_LINES - 1);
      const snippet = doc
        .getText(
          new vscode.Range(
            targetRange.start.line,
            0,
            endLine,
            doc.lineAt(endLine).text.length,
          ),
        )
        .trim();
      if (snippet.length === 0) {
        return null;
      }
      return { path: vscode.workspace.asRelativePath(targetUri), content: snippet };
    } catch {
      return null;
    }
  }
}

function hoverText(hovers: vscode.Hover[] | undefined): string {
  if (!hovers) {
    return "";
  }
  const parts: string[] = [];
  for (const h of hovers) {
    for (const c of h.contents) {
      if (typeof c === "string") {
        parts.push(c);
      } else if ("value" in c) {
        parts.push(c.value);
      }
    }
  }
  return parts.join("\n");
}
