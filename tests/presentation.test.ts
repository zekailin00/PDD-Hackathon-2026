import { describe, expect, it } from "vitest";
import { humanizeAgentOutput } from "@/lib/presentation";

describe("conversation presentation", () => {
  it("keeps the explanation while hiding generated source code", () => {
    const output = [
      "I created the requested checklist.",
      '<artifact kind="html"><!doctype html><html><body>Secret source</body></html></artifact>',
      "It is ready for the room to review.",
    ].join("\n");

    const visible = humanizeAgentOutput(output);
    expect(visible).toContain("I created the requested checklist.");
    expect(visible).toContain("open Preview");
    expect(visible).toContain("ready for the room");
    expect(visible).not.toContain("<!doctype html>");
    expect(visible).not.toContain("Secret source");
  });

  it("replaces legacy HTML protocol output with a friendly notice", () => {
    const visible = humanizeAgentOutput(
      "Done.\n⟦CO_PROMPT_HTML_BEGIN⟧<html>code</html>⟦CO_PROMPT_HTML_END⟧",
    );
    expect(visible).toContain("Done.");
    expect(visible).toContain("[Browser preview generated]");
    expect(visible).not.toContain("<html>");
  });
});
