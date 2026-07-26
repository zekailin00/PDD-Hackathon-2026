import { describe, expect, it } from "vitest";
import { toGeneratedJavaScriptModule } from "@/pdd/generated-code-download";

describe("generated code JavaScript export", () => {
  it("losslessly embeds arbitrary generated code in an importable ES module", () => {
    const source = "<script>const name = `co-prompt ✓`;</script>";
    const module = toGeneratedJavaScriptModule(source);
    expect(module).toContain(JSON.stringify(source));
    expect(module).toContain("export default generatedCode");
    expect(module).not.toContain(": string");
  });

  it("rejects empty code and unsafe export names", () => {
    expect(() => toGeneratedJavaScriptModule(" ")).toThrow("must not be empty");
    expect(() => toGeneratedJavaScriptModule("x", "not-valid")).toThrow("valid JavaScript identifier");
  });
});
