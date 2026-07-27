import { describe, expect, it } from "vitest";
import { chooseModel, eligibleModels, NoEligibleModel, type CatalogModel } from "../lib/model-router";

const model = (id: string, endpoints = ["openai"], tags = "Text"): CatalogModel => ({
  id, supported_endpoint_types: endpoints, tags,
});
const catalog = [
  model("anthropic/claude-opus-5"),
  model("anthropic/claude-sonnet-5"),
  model("google/gemini-3.5-flash"),
  model("deepseek/deepseek-v4"),
  model("openai/gpt-5-image-mini", ["openai"], "Image"),
  model("vendor/embeddings", ["openai"], "Embedding"),
  model("vendor/messages-only", ["anthropic"]),
];

describe("TokenRouter auto model selection", () => {
  it("never returns Opus or non-text/wrong-endpoint models", () => {
    const ids = eligibleModels(catalog).map((entry) => entry.id);
    expect(ids).not.toContain("anthropic/claude-opus-5");
    expect(ids).not.toContain("openai/gpt-5-image-mini");
    expect(ids).not.toContain("vendor/messages-only");
  });

  it("routes automatically by difficulty", () => {
    expect(chooseModel(catalog, "cheap").model).toBe("google/gemini-3.5-flash");
    expect(chooseModel(catalog, "standard").model).toBe("deepseek/deepseek-v4");
    expect(chooseModel(catalog, "hard").model).toBe("anthropic/claude-sonnet-5");
  });

  it("is deterministic and honors only eligible preferences", () => {
    expect(chooseModel(catalog, "hard", "google/gemini-3.5-flash").model).toBe("google/gemini-3.5-flash");
    expect(chooseModel([...catalog].reverse(), "standard")).toEqual(chooseModel(catalog, "standard"));
  });

  it("fails clearly when nothing is eligible", () => {
    expect(() => chooseModel([model("x", ["anthropic"])], "cheap")).toThrow(NoEligibleModel);
  });
});
