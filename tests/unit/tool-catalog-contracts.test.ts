import { describe, expect, it } from "vitest";
import { toolCatalog } from "../../src/tools/catalog.js";

describe("tool catalog contracts", () => {
  it("has unique tool names", () => {
    const seen = new Set<string>();
    for (const tool of toolCatalog) {
      expect(seen.has(tool.name)).toBe(false);
      seen.add(tool.name);
    }
  });

  it("does not collide aliases with canonical names", () => {
    const names = new Set(toolCatalog.map((tool) => tool.name));
    for (const tool of toolCatalog) {
      for (const alias of tool.aliases ?? []) {
        expect(names.has(alias)).toBe(false);
      }
    }
  });

  it("marks confirm-required tools as destructive", () => {
    for (const tool of toolCatalog) {
      if (tool.confirmRequired) {
        expect(tool.destructive).toBe(true);
      }
    }
  });
});
