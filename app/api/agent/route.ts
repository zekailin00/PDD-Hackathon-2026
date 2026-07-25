import { NextResponse } from "next/server";

type ProjectFile = { path: string; content: string };

function extractJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? value;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model did not return a JSON response.");
  return JSON.parse(fenced.slice(start, end + 1));
}

export async function POST(request: Request) {
  const { provider, systemPrompt, prompt, files } = await request.json() as { provider: { apiKey?: string; baseUrl?: string; model?: string }; systemPrompt: string; prompt: string; files: ProjectFile[] };
  if (!provider?.apiKey || !provider?.baseUrl) return NextResponse.json({ error: "A provider API key and base URL are required." }, { status: 400 });
  const context = (files || []).map(file => `FILE: ${file.path}\n${file.content}`).join("\n\n");
  const endpoint = provider.baseUrl.replace(/\/$/, "").endsWith("/chat/completions") ? provider.baseUrl.replace(/\/$/, "") : `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` }, body: JSON.stringify({ model: provider.model || "auto", temperature: 0.2, messages: [{ role: "system", content: `${systemPrompt}\n\nYou are the sole editor for this project. Users cannot directly edit files. Determine whether the user's message is a request to change code. Return ONLY valid JSON in this exact shape:\n{"action":"chat"|"edit","message":"short helpful response","files":[{"path":"existing/or/new/path","content":"complete file contents"}]}\n\nFor questions or discussion, return action chat and an empty files array. For an edit request, return action edit and include every changed or new file with its COMPLETE content. Never include unchanged files. Do not delete files. Preserve the project's conventions.\n\nProject files:\n${context}` }, { role: "user", content: prompt }] }) });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    return NextResponse.json({ error: `Provider request failed (${response.status}): ${details || "no response body"}` }, { status: response.status });
  }
  const data = await response.json();
  try {
    const result = extractJson(data?.choices?.[0]?.message?.content || "");
    if (!result || !["chat", "edit"].includes(result.action) || typeof result.message !== "string" || !Array.isArray(result.files)) throw new Error("The model returned an invalid response shape.");
    const safeFiles = result.files.filter((file: unknown): file is ProjectFile => {
      if (!file || typeof file !== "object") return false;
      const candidate = file as ProjectFile;
      return typeof candidate.path === "string" && typeof candidate.content === "string" && candidate.path.length > 0 && !candidate.path.startsWith("/") && !candidate.path.includes("..") && !candidate.path.includes("\\");
    });
    if (result.action === "edit" && safeFiles.length === 0) throw new Error("The model said it edited the project but supplied no files.");
    return NextResponse.json({ action: result.action, message: result.message, files: safeFiles });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not parse the model response." }, { status: 422 });
  }
}
