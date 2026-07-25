import { mkdtempSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isInsideSandbox, resolveSandboxPath, SandboxViolation } from "../pdd/path-sandbox";

describe("path sandbox", () => {
  it.each(["../secret", "/etc/passwd", "~/.ssh/id_rsa", "a/../../secret", "x\0y"])(
    "refuses %s",
    (candidate) => {
      const root = mkdtempSync(path.join(tmpdir(), "coprompt-root-"));
      expect(() => resolveSandboxPath(root, candidate)).toThrow(SandboxViolation);
      expect(isInsideSandbox(root, candidate)).toBe(false);
    },
  );

  it("refuses a symlink that lands outside", () => {
    const base = mkdtempSync(path.join(tmpdir(), "coprompt-"));
    const root = path.join(base, "repo");
    const outside = path.join(base, "outside");
    mkdirSync(root); mkdirSync(outside); symlinkSync(outside, path.join(root, "escape"));
    expect(() => resolveSandboxPath(root, "escape/key.txt")).toThrow(SandboxViolation);
  });

  it("allows safe normalized paths", () => {
    const root = mkdtempSync(path.join(tmpdir(), "coprompt-root-"));
    expect(resolveSandboxPath(root, "app/../README.md")).toBe(path.join(realpathSync.native(root), "README.md"));
  });
});
