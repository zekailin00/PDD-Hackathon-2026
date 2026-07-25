import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { apiKey, baseUrl } = await request.json() as { apiKey?: string; baseUrl?: string };
  if (!apiKey || !baseUrl) return NextResponse.json({ error: "An API key and base URL are required." }, { status: 400 });
  const endpoint = `${baseUrl.replace(/\/$/, "")}/models`;
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) return NextResponse.json({ error: payload?.error?.message || `Could not load models (${response.status}).` }, { status: response.status });
  const models = Array.isArray(payload?.data) ? payload.data.map((model: { id?: string }) => model.id).filter((id: unknown): id is string => typeof id === "string") : [];
  return NextResponse.json({ models });
}
