import type * as vscode from "vscode";
import { token } from "./container.js";

/** Tokens for vscode-owned types, which have no blink module to live in. */
export const ExtensionContext = token<vscode.ExtensionContext>("extensionContext");
