const artifactBlock = /<artifact\b[^>]*>[\s\S]*?<\/artifact>/gi;
const protocolHtml = /⟦CO_PROMPT_HTML_BEGIN⟧[\s\S]*?⟦CO_PROMPT_HTML_END⟧/gi;
const htmlDocument = /<!doctype html[\s\S]*?<\/html>/gi;
const fencedCode = /```(?:html|css|javascript|js|typescript|ts)?\s*[\s\S]*?```/gi;

export function humanizeAgentOutput(output: string): string {
  return output
    .replace(protocolHtml, "\n[Browser preview generated]\n")
    .replace(artifactBlock, "\n[Artifact generated — open Preview to review it]\n")
    .replace(htmlDocument, "\n[Browser preview generated]\n")
    .replace(fencedCode, "\n[Code generated — open Generated code to inspect it]\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
