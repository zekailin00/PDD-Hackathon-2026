import { NextResponse } from "next/server";

type ProjectFile = { path: string; content: string };

export async function POST(request: Request) {
  const { token, repository, files } = await request.json() as { token?: string; repository?: string; files?: ProjectFile[] };
  if (!token || !repository || !Array.isArray(files)) return NextResponse.json({ error: "GitHub token, repository name, and files are required." }, { status: 400 });
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" };
  const ownerResponse = await fetch("https://api.github.com/user", { headers });
  if (!ownerResponse.ok) return NextResponse.json({ error: "GitHub rejected this token. Create a fine-grained token with repository Contents read/write access." }, { status: 401 });
  const owner = (await ownerResponse.json()).login as string;
  const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${encodeURIComponent(repository)}`, { headers });
  if (repoResponse.status === 404) {
    const create = await fetch("https://api.github.com/user/repos", { method: "POST", headers, body: JSON.stringify({ name: repository, private: true, auto_init: true, description: "Created with co-prompt" }) });
    if (!create.ok) return NextResponse.json({ error: "Could not create the GitHub repository." }, { status: create.status });
  } else if (!repoResponse.ok) return NextResponse.json({ error: "Could not access that GitHub repository." }, { status: repoResponse.status });
  for (const file of files) {
    const path = file.path.replace(/^\/+/, "");
    if (!path || path.includes("..")) continue;
    const existing = await fetch(`https://api.github.com/repos/${owner}/${encodeURIComponent(repository)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, { headers });
    const current = existing.ok ? await existing.json() : null;
    const write = await fetch(`https://api.github.com/repos/${owner}/${encodeURIComponent(repository)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "PUT", headers, body: JSON.stringify({ message: `co-prompt: update ${path}`, content: Buffer.from(file.content).toString("base64"), ...(current?.sha ? { sha: current.sha } : {}) }) });
    if (!write.ok) return NextResponse.json({ error: `Could not publish ${path}.` }, { status: write.status });
  }
  return NextResponse.json({ url: `https://github.com/${owner}/${repository}` });
}
