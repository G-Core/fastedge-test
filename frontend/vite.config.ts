import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Release builds pass the version being released: package.json is not bumped in the repository.
const version =
  process.env.FASTEDGE_TEST_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")).version;

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5179",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:5179",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../dist/frontend",
    emptyOutDir: true, // Safe to clean - we control this directory
  },
});
