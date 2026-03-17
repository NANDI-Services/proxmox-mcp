import { describe, expect, it } from "vitest";
import { runGuarded } from "../../src/guardian/guardian.js";

describe("guardian", () => {
  it("returns ok result", async () => {
    const result = await runGuarded(async () => "ok");
    expect(result.ok).toBe(true);
    expect(result.data).toBe("ok");
  });

  it("retries and returns error after max attempts", async () => {
    let attempts = 0;
    const result = await runGuarded(
      async () => {
        attempts += 1;
        throw new Error("boom");
      },
      {
        retryPolicy: {
          maxAttempts: 2,
          baseDelayMs: 1,
          maxDelayMs: 1,
          jitter: false
        },
        timeoutMs: 50
      }
    );

    expect(result.ok).toBe(false);
    expect(attempts).toBe(2);
    expect(result.error?.code).toBeDefined();
  });
});
