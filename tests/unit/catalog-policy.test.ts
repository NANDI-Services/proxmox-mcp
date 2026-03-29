import { describe, expect, it } from "vitest";
import { totalToolCount, toolCountByCategory } from "../../src/tools/catalog.js";
import { PolicyEngine } from "../../src/server/policy.js";
import type { ToolDescriptor } from "../../src/server/toolMetadata.js";

const sampleTool: ToolDescriptor = {
  name: "pve_delete_qemu_vm",
  description: "Delete VM",
  category: "qemu",
  module: "core",
  accessTier: "full",
  destructive: true,
  confirmRequired: true,
  idempotent: false,
  transport: "both",
  inputShape: {},
  execute: async () => ({
    ok: true,
    data: { ok: true },
    meta: { durationMs: 0, retries: 0, timestamp: new Date().toISOString() }
  })
};

describe("catalog and policy", () => {
  it("exposes >= 120 tools", () => {
    expect(totalToolCount()).toBeGreaterThanOrEqual(120);
  });

  it("has coverage in key categories", () => {
    const counts = toolCountByCategory();
    expect((counts.qemu ?? 0) > 0).toBe(true);
    expect((counts.lxc ?? 0) > 0).toBe(true);
    expect((counts.storage ?? 0) > 0).toBe(true);
    expect((counts.cluster ?? 0) > 0).toBe(true);
  });

  it("enforces access tier and confirmation policy", () => {
    const engine = new PolicyEngine({
      accessTier: "read-only",
      categoryAllowlist: [],
      toolBlacklist: [],
      toolWhitelist: [],
      moduleMode: "core"
    });

    expect(engine.shouldRegister(sampleTool, "stdio")).toBe(false);
    const guard = engine.guardConfirmation(sampleTool, {});
    expect(guard.ok).toBe(false);
    expect(guard.message).toContain("requires explicit confirmation");
  });

  it("respects whitelist over tier restrictions", () => {
    const engine = new PolicyEngine({
      accessTier: "read-only",
      categoryAllowlist: [],
      toolBlacklist: [],
      toolWhitelist: ["pve_delete_qemu_vm"],
      moduleMode: "advanced"
    });

    expect(engine.shouldRegister(sampleTool, "http")).toBe(true);
  });
});
