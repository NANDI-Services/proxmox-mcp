import { describe, expect, it } from "vitest";
import { schemas } from "../../src/server/schemas.js";

describe("tool contracts", () => {
  it("validates vm schema", () => {
    const parsed = schemas.byVm.parse({ node: "pve", vmid: 101 });
    expect(parsed.vmid).toBe(101);
  });

  it("rejects invalid container command schema", () => {
    const result = schemas.execInContainer.safeParse({ ctid: 0, command: "" });
    expect(result.success).toBe(false);
  });
});
