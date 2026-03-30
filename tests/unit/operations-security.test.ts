import { describe, expect, it } from "vitest";
import { dockerLogsInContainer } from "../../src/tools/operations.js";

describe("operations hardening", () => {
  it("rejects unsafe docker container names before remote execution", async () => {
    const result = await dockerLogsInContainer(
      {
        host: "pve.local",
        port: 22,
        user: "root",
        keyPath: "C:/Users/test/.ssh/id_ed25519",
        timeoutMs: 10_000
      },
      101,
      "api; rm -rf /",
      100
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_CONTAINER_NAME");
  });
});
