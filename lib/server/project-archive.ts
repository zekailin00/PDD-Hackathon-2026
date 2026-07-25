import { unzipSync } from "fflate";

const MAX_ZIP_BYTES = 10 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 500;
const MAX_TEXT_FILES = 100;
const MAX_FILE_BYTES = 100 * 1024;
const MAX_TOTAL_BYTES = 500 * 1024;

const textExtensions = new Set([
  "c", "cc", "cpp", "cs", "css", "csv", "go", "graphql", "h", "hpp",
  "html", "ini", "java", "js", "json", "jsx", "kt", "less", "lua", "md", "mjs",
  "php", "properties", "py", "rb", "rs", "scss", "sh", "sql", "svelte", "svg",
  "swift", "toml", "ts", "tsx", "txt", "vue", "xml", "yaml", "yml",
]);

const textFileNames = new Set([
  ".gitignore", "dockerfile", "license", "makefile", "procfile", "readme",
]);

const ignoredSegments = new Set([
  ".git", ".next", ".turbo", "build", "coverage", "dist", "node_modules", "vendor",
]);

export type ProjectArchive = {
  name: string;
  fileCount: number;
  truncated: boolean;
  context: string;
};

function safePath(name: string): boolean {
  const normalized = name.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return false;
  const segments = normalized.split("/").filter(Boolean);
  return !segments.some((segment) => segment === ".." || ignoredSegments.has(segment));
}

function isTextFile(name: string): boolean {
  const base = name.replaceAll("\\", "/").split("/").pop()?.toLowerCase() ?? "";
  if (
    base === ".env"
    || base.startsWith(".env.")
    || base === ".npmrc"
    || base.includes("credentials")
    || base.includes("secret")
  ) return false;
  const extension = base.includes(".") ? base.split(".").pop() ?? "" : "";
  return textExtensions.has(extension) || textFileNames.has(base);
}

function cleanArchiveName(name: string): string {
  return name.trim().replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 120) || "project.zip";
}

export async function readProjectArchive(file: File): Promise<ProjectArchive> {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("請上傳 .zip 專案檔。");
  if (!file.size) throw new Error("ZIP 檔案是空的。");
  if (file.size > MAX_ZIP_BYTES) throw new Error("ZIP 檔案不可超過 10 MB。");

  let entryCount = 0;
  let acceptedCount = 0;
  let acceptedBytes = 0;
  let truncated = false;

  const extracted = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(info) {
      entryCount += 1;
      if (entryCount > MAX_ARCHIVE_ENTRIES) {
        throw new Error("ZIP 內容過多；最多接受 500 個項目。");
      }
      if (!safePath(info.name) || !isTextFile(info.name) || info.originalSize === 0) return false;
      if (info.originalSize > MAX_FILE_BYTES) {
        truncated = true;
        return false;
      }
      if (acceptedCount >= MAX_TEXT_FILES || acceptedBytes + info.originalSize > MAX_TOTAL_BYTES) {
        truncated = true;
        return false;
      }
      acceptedCount += 1;
      acceptedBytes += info.originalSize;
      return true;
    },
  });

  const decoder = new TextDecoder();
  const files = Object.entries(extracted)
    .filter(([, bytes]) => !bytes.subarray(0, 8_192).includes(0))
    .map(([name, bytes]) => ({
      name: name.replaceAll("\\", "/"),
      content: decoder.decode(bytes),
    }));

  if (!files.length) throw new Error("ZIP 內找不到可讀取的程式碼或文字檔。");

  return {
    name: cleanArchiveName(file.name),
    fileCount: files.length,
    truncated: truncated || files.length < acceptedCount,
    context: files
      .map(({ name, content }) => `--- FILE: ${name} ---\n${content}`)
      .join("\n\n"),
  };
}
