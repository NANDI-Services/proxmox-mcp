import { defineConfig } from "vitest/config";

/**
 * End-to-end suite. Requires a running Docker daemon: globalSetup brings the
 * emulator stack up and tears it down. Kept in its own config so `npm test`
 * (and the CI validate job) stay fast and Docker-free.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.test.ts"],
    globalSetup: ["tests/e2e/globalSetup.ts"],
    testTimeout: 60_000,
    hookTimeout: 300_000,
    // The suite shares one emulator with mutable state; run files serially.
    fileParallelism: false
  }
});
