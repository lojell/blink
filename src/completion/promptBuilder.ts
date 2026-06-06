import type { FimContext } from "./contextAssembler.js";
import type { ContextFile } from "../edits/editTracker.js";
// import { getTemplate, type FimFormat } from "./fimTemplates.js";

export interface BuiltPrompt {
  prompt: string;
  stop: string[];
}

export interface BuildPromptOptions {
  model: string;
  path?: string;
  repoName?: string;
  files?: ContextFile[];
}

/**
 * Resolve the configured format against a template's capability. `auto` picks
 * repo-level for repo-capable models, file-level otherwise; an explicit `repo`
 * on a model that wasn't trained on the repo tokens degrades to file-level.
 */
// export function resolveFormat(promptFormat: PromptFormat, supportsRepo: boolean): FimFormat {
//   const desired = promptFormat === "auto" ? (supportsRepo ? "repo" : "file") : promptFormat;
//   return desired === "repo" && !supportsRepo ? "file" : desired;
// }

// export function buildPrompt(ctx: FimContext, opts: BuildPromptOptions): BuiltPrompt {
//   const template = getTemplate(opts.model);
//   // const format = resolveFormat(opts.promptFormat, template.supportsRepo);
//   return {
//     prompt: template.render({
//       prefix: ctx.prefix,
//       suffix: ctx.suffix,
//       path: opts.path,
//       repoName: opts.repoName,
//       files: opts.files,
//       format,
//     }),
//     stop: template.stop,
//   };
// }
