import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { provider, systemPrompt, prompt, files } = await request.json();
  if (!provider?.apiKey || !provider?.baseUrl) return NextResponse.json({ error: "A provider API key and base URL are required." }, { status: 400 });
  const context = (files || []).map((file: { path: string; content: string }) => `FILE: ${file.path}\n${file.content}`).join("\n\n");
  const endpoint = provider.baseUrl.replace(/\/$/, "").endsWith("/chat/completions") ? provider.baseUrl.replace(/\/$/, "") : `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` }, body: JSON.stringify({ model: provider.model, messages: [{ role: "system", content: `${systemPrompt}\n\nProject files:\n${context}\n\nRespond concisely with an implementation summary. Do not use markdown code fences.` }, { role: "user", content: prompt }] }) });
  if (!response.ok) return NextResponse.json({ error: "Provider request failed." }, { status: response.status });
  const data = await response.json();
  return NextResponse.json({ message: data?.choices?.[0]?.message?.content || "The provider returned no message." });
}
