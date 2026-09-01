import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/__tests__/server/**/*.test.ts"],
    // Sequential — each file starts its own server process on a shared port pool.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 15000,
  },
});
