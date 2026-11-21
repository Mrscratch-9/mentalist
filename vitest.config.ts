import { defineConfig } from "vitest/config";

// Each workspace package with tests owns its own vitest.config.ts.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
  },
});
