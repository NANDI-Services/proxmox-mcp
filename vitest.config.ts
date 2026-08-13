import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The e2e suite needs the Docker emulator stack; keep it out of the default
    // run so `npm test` and the CI validate job stay fast and Docker-free.
    exclude: ["node_modules/**", "dist/**", "tests/e2e/**"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
