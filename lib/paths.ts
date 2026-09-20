/**
 * The project root, read through one helper instead of inline `process.cwd()`,
 * so there is a single definition every path resolves against.
 */
export function getProjectRoot(): string {
  return process.cwd();
}
