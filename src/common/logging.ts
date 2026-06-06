import { token } from "../di/container.js";

/**
 * The narrow logging seam consumers depend on. Stateful/IO collaborators take an
 * ILogger (not the concrete Logger) so they can be faked with `{ info() {} }`.
 * Lives apart from the concrete Logger (logger.ts imports vscode) so pure
 * modules can declare LOGGER in their inject tuples without pulling in vscode.
 */
export interface ILogger {
  info(message: string): void;
  /** Logs at error level AND surfaces a vscode error message to the user. */
  error(message: string): void;
}

// Merges with the interface above: one name serves as both the type and the
// injection token.
export const ILogger = token<ILogger>("logger");
