import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Match the `@/*` path alias tsconfig gives the app, so a test can import a
// module the same way the code under test does.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
