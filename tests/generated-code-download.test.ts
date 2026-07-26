import { describe, expect, it } from "vitest";
import { toGeneratedTypeScriptModule } from "@/pdd/generated-code-download";

describe("generated code TypeScript export", () => {
  it("losslessly embeds arbitrary generated code in an importable module", () => {
    const source = "<script>const name = `co-prompt ✓`;</script>";
    expect(toGeneratedTypeScriptModule(source)).toContain(JSON.stringify(source));
  });

  it("rejects empty code and unsafe export names", () => {
    expect(() => toGeneratedTypeScriptModule(" ")).toThrow("must not be empty");
    expect(() => toGeneratedTypeScriptModule("x", "not-valid")).toThrow("valid TypeScript identifier");
  });
});
