import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export class SandboxViolation extends Error {}

function canonicalTarget(pathname: string): string {
  const missing: string[] = [];
  let existing = pathname;
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(realpathSync.native(existing), ...missing);
}

export function resolveSandboxPath(root: string, candidate: string): string {
  if (candidate.includes("\0")) throw new SandboxViolation("Null bytes are not allowed.");
  const first = candidate.split(/[\\/]/, 1)[0];
  if (first.startsWith("~")) throw new SandboxViolation("Home-directory syntax is not allowed.");
  const rootPath = path.resolve(root);
  const candidatePath = path.resolve(path.isAbsolute(candidate) ? candidate : path.join(rootPath, candidate));
  const lexicalRelative = path.relative(rootPath, candidatePath);
  const canonicalRoot = realpathSync.native(rootPath);
  const canonicalCandidate = canonicalTarget(candidatePath);
  const canonicalRelative = path.relative(canonicalRoot, canonicalCandidate);
  if (
    lexicalRelative.startsWith("..")
    || path.isAbsolute(lexicalRelative)
    || canonicalRelative.startsWith("..")
    || path.isAbsolute(canonicalRelative)
  ) {
    throw new SandboxViolation("Path escapes the repository root.");
  }
  return canonicalCandidate;
}

export function isInsideSandbox(root: string, candidate: string): boolean {
  try {
    resolveSandboxPath(root, candidate);
    return true;
  } catch (error) {
    if (error instanceof SandboxViolation) return false;
    throw error;
  }
}
