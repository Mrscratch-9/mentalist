import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "core",
    include: ["test/**/*.test.ts"],
    // The property-based canary runs ~200 full query sweeps; give it room on a busy machine.
    testTimeout: 30_000,
  },
});
