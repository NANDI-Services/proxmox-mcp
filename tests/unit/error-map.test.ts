import { describe, expect, it } from "vitest";
import { mapError } from "../../src/guardian/errorMap.js";

describe("error map", () => {
  it("maps docker unavailable errors", () => {
    const mapped = mapError(new Error("pct exec failed: bash: line 1: docker: command not found"));
    expect(mapped.code).toBe("DOCKER_NOT_AVAILABLE");
  });

  it("maps qemu guest agent unavailable errors", () => {
    const mapped = mapError(new Error("HTTP 500: QEMU guest agent is not running"));
    expect(mapped.code).toBe("QEMU_GUEST_AGENT_UNAVAILABLE");
  });

  it("maps qemu guest agent missing configuration errors", () => {
    const mapped = mapError(new Error("HTTP 500: No QEMU guest agent configured"));
    expect(mapped.code).toBe("QEMU_GUEST_AGENT_UNAVAILABLE");
  });
});
