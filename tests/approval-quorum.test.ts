import { describe, expect, it } from "vitest";
import { evaluateQuorum } from "../pdd/approval-quorum";

describe("evaluateQuorum", () => {
  it("requires every voter under unanimous policy", () => {
    const result = evaluateQuorum(["a", "b"], [{ userId: "a", verdict: "approve" }]);
    expect(result.canOpenPr).toBe(false);
    expect(result.waitingOn).toEqual(["b"]);
  });

  it("treats request changes as a veto", () => {
    const result = evaluateQuorum(["a", "b"], [
      { userId: "a", verdict: "approve" },
      { userId: "b", verdict: "request_changes" },
    ], "majority");
    expect(result.canOpenPr).toBe(false);
  });

  it("ignores outsiders and uses each member's last vote", () => {
    const result = evaluateQuorum(["a"], [
      { userId: "x", verdict: "request_changes" },
      { userId: "a", verdict: "request_changes" },
      { userId: "a", verdict: "approve" },
    ]);
    expect(result.canOpenPr).toBe(true);
  });

  it("fails loudly on unknown policy data", () => {
    expect(() => evaluateQuorum([], [], "other" as "unanimous")).toThrow(RangeError);
    expect(() => evaluateQuorum(["a"], [{ userId: "a", verdict: "maybe" as "approve" }])).toThrow(RangeError);
  });
});
