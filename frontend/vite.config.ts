import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The docs the Help links open. Release builds pass the version being released (package.json is
// not bumped in the repository) and link to its tag; any other build runs unreleased source, so
// it links to main.
const release = process.env.FASTEDGE_TEST_VERSION;
const docsRef = release ? `v${release}` : "main";

export default defineConfig({
  plugins: [react()],
  define: { __DOCS_REF__: JSON.stringify(docsRef) },
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
