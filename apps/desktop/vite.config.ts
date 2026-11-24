import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

// public/tiles holds the large PMTiles extract. The dev server serves it (with Range); the app bundle gets it as a
// Tauri resource (read by the ranged tiles:// protocol), so it must not also be copied into dist and embedded in the exe.
const dropTilesFromDist = () => ({
  name: "drop-tiles-from-dist",
  apply: "build" as const,
  closeBundle() {
    rmSync(resolve(import.meta.dirname, "dist/tiles"), { recursive: true, force: true });
  },
});

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), dropTilesFromDist()],
  // sqlite-wasm loads its .wasm relative to its own module; pre-bundling breaks that.
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
