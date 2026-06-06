import { CompletionRequest } from "./completionEngine";

// export interface FimInput {
//   prefix: string;
//   suffix: string;
//   path?: string;
//   repoName?: string;
//   files?: { path: string; content: string }[];
// }

export interface FimTemplate {
  render(input: CompletionRequest): string;
  stop: string[];
}


/**
 * Qwen2.5-Coder: file-level FIM, plus the trained repo-level format
 * (`<|repo_name|>` / `<|file_sep|>`) when a path is present. The repo branch
 * requires a path, so unsaved buffers always render file-level.
 */
const qwen: FimTemplate = {
  stop: [
    "<|endoftext|>",
    "<|fim_prefix|>",
    "<|fim_suffix|>",
    "<|fim_middle|>",
    "<|fim_pad|>",
    "<|repo_name|>",
    "<|file_sep|>",
  ],
  render: ({ prefix, suffix, filePath, repoName, files }: CompletionRequest) => {
    const parts = [`<|repo_name|>${repoName}`];
    for (const f of files ?? []) {
      parts.push(`<|file_sep|>${f.path}`, f.content);
    }
    parts.push(
      `<|file_sep|>${filePath}`,
      `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`,
    );
    return parts.join("\n");
  },
};

const def: FimTemplate = {
  stop: [],
  render: ({ prefix, suffix, filePath, repoName, files }: CompletionRequest) => {
    return `${prefix}<|cursor|>${suffix}`;
  },
};

export class FimTemplates {
  get(prefix: string) {
    if (prefix === "<|fim_prefix|>") {
      return qwen;
    }

    return def;
  }
}