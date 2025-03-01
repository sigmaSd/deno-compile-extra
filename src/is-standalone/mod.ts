/**
 * Utility module that exports functionality to check if the current Deno process
 * is running as a standalone executable.
 *
 * This module uses heuristics to try to guess whether Deno is running from a compiled executable rather than
 * the standard runtime.
 *
 * @module
 */
export { isStandaloneDenoExe } from "../utils.ts";
