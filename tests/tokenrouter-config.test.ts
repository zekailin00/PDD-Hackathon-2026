import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isTokenRouterConfigured,
  tokenRouterApiKey,
} from "@/lib/server/tokenrouter";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("TokenRouter server configuration", () => {
  it("uses TOKENROUTER_API_KEY as the default provider key", () => {
    vi.stubEnv("TOKENROUTER_API_KEY", "server-default-key");
    vi.stubEnv("TOKEN_ROUTER_API_KEY", "");
    vi.stubEnv("TOKENROUTER_KEY", "");
    vi.stubEnv("FALLBACK_API_KEY", "");
    expect(tokenRouterApiKey()).toBe("server-default-key");
    expect(isTokenRouterConfigured()).toBe(true);
  });

  it("accepts common server-only compatibility names", () => {
    vi.stubEnv("TOKENROUTER_API_KEY", "");
    vi.stubEnv("TOKEN_ROUTER_API_KEY", "compatibility-key");
    vi.stubEnv("TOKENROUTER_KEY", "");
    vi.stubEnv("FALLBACK_API_KEY", "");
    expect(tokenRouterApiKey()).toBe("compatibility-key");
  });

  it("accepts the legacy Render house-key name", () => {
    vi.stubEnv("TOKENROUTER_API_KEY", "");
    vi.stubEnv("TOKEN_ROUTER_API_KEY", "");
    vi.stubEnv("TOKENROUTER_KEY", "");
    vi.stubEnv("FALLBACK_API_KEY", "render-house-key");
    expect(tokenRouterApiKey()).toBe("render-house-key");
  });

  it("reports missing configuration without inventing a browser key", () => {
    vi.stubEnv("TOKENROUTER_API_KEY", "");
    vi.stubEnv("TOKEN_ROUTER_API_KEY", "");
    vi.stubEnv("TOKENROUTER_KEY", "");
    vi.stubEnv("FALLBACK_API_KEY", "");
    expect(tokenRouterApiKey()).toBe("");
    expect(isTokenRouterConfigured()).toBe(false);
  });
});
