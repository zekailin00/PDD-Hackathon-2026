import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { POST } from "@/app/api/rooms/route";
import { readProjectArchive } from "@/lib/server/project-archive";

const encoder = new TextEncoder();

function zipFile(files: Record<string, string>, name = "existing-project.zip"): File {
  const archive = zipSync(Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, encoder.encode(content)]),
  ));
  return new File([archive], name, { type: "application/zip" });
}

describe("project ZIP import", () => {
  it("loads readable project files and skips dependencies", async () => {
    const result = await readProjectArchive(zipFile({
      "app/page.tsx": "export default function Page() { return <main>Hello</main>; }",
      "README.md": "# Existing project",
      ".env": "TOKEN=must-not-enter-agent-context",
      "node_modules/pkg/index.js": "must not enter agent context",
    }));

    expect(result.name).toBe("existing-project.zip");
    expect(result.fileCount).toBe(2);
    expect(result.context).toContain("--- FILE: app/page.tsx ---");
    expect(result.context).toContain("# Existing project");
    expect(result.context).not.toContain("must not enter agent context");
    expect(result.context).not.toContain("must-not-enter-agent-context");
  });

  it("rejects archives without safe readable files", async () => {
    await expect(readProjectArchive(zipFile({
      "../secret.txt": "not safe",
      "node_modules/pkg/index.js": "ignored",
    }))).rejects.toThrow(/找不到可讀取/);
  });

  it("creates a room from multipart form data with a ZIP", async () => {
    const form = new FormData();
    form.set("action", "create");
    form.set("userId", "zip-creator");
    form.set("name", "ZIP Creator");
    form.set("role", "eng");
    form.set("title", "ZIP room");
    form.set("visibility", "private");
    form.set("projectZip", zipFile({ "src/index.ts": "export const ready = true;" }));

    const response = await POST(new Request("http://localhost/api/rooms", {
      method: "POST",
      body: form,
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.room.sourceArchive).toMatchObject({
      name: "existing-project.zip",
      fileCount: 1,
    });
    expect(JSON.stringify(data.room)).not.toContain("export const ready");
  });
});
