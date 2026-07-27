export type Difficulty = "cheap" | "standard" | "hard";
export type CatalogModel = {
  id: string;
  supported_endpoint_types?: string[];
  tags?: string | string[];
};
export type ModelChoice = { model: string; tier: Difficulty; reason: string };
export class NoEligibleModel extends Error {}

const CHAT_ENDPOINTS = new Set(["openai", "openai-compatible", "chat-completions"]);
const NON_TEXT = /(image|video|audio|embedding|speech|tts)/i;
const FORBIDDEN = /(?:^|[-_/.\s])opus(?:[-_/.\s]|$)/i;

export function eligibleModels(catalog: CatalogModel[]): CatalogModel[] {
  return catalog
    .filter((model) => {
      const endpoints = model.supported_endpoint_types ?? [];
      const tags = Array.isArray(model.tags) ? model.tags.join(" ") : model.tags ?? "";
      return Boolean(model.id)
        && endpoints.some((endpoint) => CHAT_ENDPOINTS.has(endpoint.toLowerCase()))
        && !NON_TEXT.test(`${model.id} ${tags}`)
        && !FORBIDDEN.test(model.id);
    })
    .map((model) => ({ ...model, supported_endpoint_types: [...(model.supported_endpoint_types ?? [])] }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function versionScore(id: string): number {
  return [...id.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0])).at(-1) ?? 0;
}

function familyScore(id: string): number {
  if (/gpt[-_/]?5|gemini[-_/]?(?:3|pro)|grok[-_/]?(?:4|5)|sonnet[-_/]?5/i.test(id)) return 40;
  if (/sonnet|deepseek|qwen|max|pro|large/i.test(id)) return 30;
  if (/flash|haiku|mini|nano|lite|fast/i.test(id)) return 10;
  return 20;
}

function fastScore(id: string): number {
  return /haiku|flash|mini|nano|lite|fast/i.test(id) ? 20 : 0;
}

export function chooseModel(
  catalog: CatalogModel[],
  difficulty: Difficulty = "standard",
  prefer?: string | null,
): ModelChoice {
  if (!["cheap", "standard", "hard"].includes(difficulty)) throw new RangeError(`Unknown difficulty: ${difficulty}`);
  const eligible = eligibleModels(catalog);
  if (eligible.length === 0) throw new NoEligibleModel("No text chat model supports this API.");
  if (prefer && eligible.some((model) => model.id === prefer)) {
    return { model: prefer, tier: difficulty, reason: `${difficulty} route: using the room's eligible preference.` };
  }
  const ranked = [...eligible].sort((a, b) => {
    const aFamily = familyScore(a.id);
    const bFamily = familyScore(b.id);
    const primary = difficulty === "cheap"
      ? fastScore(b.id) - fastScore(a.id) || aFamily - bFamily
      : difficulty === "hard"
        ? bFamily - aFamily || fastScore(a.id) - fastScore(b.id)
        : Math.abs(aFamily - 30) - Math.abs(bFamily - 30) || fastScore(b.id) - fastScore(a.id);
    return primary || versionScore(b.id) - versionScore(a.id) || a.id.localeCompare(b.id);
  });
  return {
    model: ranked[0].id,
    tier: difficulty,
    reason: `${difficulty} route: selected the best eligible text model from TokenRouter's live catalog.`,
  };
}
