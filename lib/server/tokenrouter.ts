import { chooseModel, type CatalogModel, type Difficulty, type ModelChoice } from "@/pdd/model-router";

const DEFAULT_BASE_URL = "https://api.tokenrouter.com/v1";

function config(apiKeyOverride?: string) {
  const apiKey = apiKeyOverride || process.env.TOKENROUTER_API_KEY;
  if (!apiKey) throw new Error("伺服器尚未設定 TOKENROUTER_API_KEY。");
  return {
    apiKey,
    baseUrl: (process.env.TOKENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
  };
}

export async function autoRoute(difficulty: Difficulty, prefer?: string, apiKeyOverride?: string): Promise<ModelChoice> {
  const { apiKey, baseUrl } = config(apiKeyOverride);
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`TokenRouter catalog failed (${response.status}).`);
  const payload = await response.json() as { data?: CatalogModel[] } | CatalogModel[];
  const catalog = Array.isArray(payload) ? payload : payload.data ?? [];
  return chooseModel(catalog, difficulty, prefer);
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function streamChat(input: {
  model: string;
  messages: ChatMessage[];
  apiKey?: string;
  signal?: AbortSignal;
  onToken: (token: string) => void | Promise<void>;
}): Promise<string> {
  const { apiKey, baseUrl } = config(input.apiKey);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: input.model, messages: input.messages, stream: true, max_tokens: 1800 }),
    signal: input.signal,
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`TokenRouter request failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const parsed = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
      const token = parsed.choices?.[0]?.delta?.content;
      if (token) {
        output += token;
        await input.onToken(token);
      }
    }
  }
  return output;
}
