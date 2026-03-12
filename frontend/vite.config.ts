import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
