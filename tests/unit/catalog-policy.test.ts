import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

/**
 * Reads the count out of the generated inventory rather than hardcoding it in a
 * second place. CI already fails on `docs/TOOLS.md` drift, so this asserts the
 * docs and the catalog agree without needing to be edited on every addition.
 */
const testDir = dirname(fileURLToPath(import.meta.url));

const documentedToolCount = (): number => {
  const doc = readFileSync(resolve(testDir, "../../docs/TOOLS.md"), "utf8");
  const match = /Total tools:\s*\*\*(\d+)\*\*/.exec(doc);
  if (!match?.[1]) {
    throw new Error("Could not read the tool total from docs/TOOLS.md");
  }
  return Number(match[1]);
};

describe("catalog and policy", () => {
  it("matches the tool count documented in docs/TOOLS.md", () => {
    // Previously asserted `>= 120` while the docs advertised 143, leaving a
    // 23-tool window in which a regression would go unnoticed.
    expect(totalToolCount()).toBe(documentedToolCount());
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
