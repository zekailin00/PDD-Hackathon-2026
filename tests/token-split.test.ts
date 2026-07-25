import { describe, expect, it } from "vitest";
import { splitTokens } from "../pdd/token-split";

describe("splitTokens", () => {
  it("conserves every token", () => {
    expect(splitTokens(100, [
      { userId: "amy", weight: 1 },
      { userId: "joe", weight: 1 },
      { userId: "kai", weight: 1 },
    ])).toEqual({ amy: 34, joe: 33, kai: 33 });
  });

  it("is deterministic across input order", () => {
    const input = [{ userId: "z", weight: 5 }, { userId: "a", weight: 3 }, { userId: "m", weight: 1 }];
    expect(splitTokens(1000, input)).toEqual(splitTokens(1000, [...input].reverse()));
    expect(Object.values(splitTokens(1000, input)).reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("deduplicates participant weights", () => {
    expect(splitTokens(4, [{ userId: "a", weight: 1 }, { userId: "a", weight: 1 }])).toEqual({ a: 4 });
  });

  it("supports equal and initiator charging", () => {
    const input = [{ userId: "amy", weight: 3 }, { userId: "joe", weight: 1 }];
    expect(splitTokens(50, input, "equal")).toEqual({ amy: 25, joe: 25 });
    expect(splitTokens(50, input, "initiator")).toEqual({ amy: 50, joe: 0 });
  });
});
