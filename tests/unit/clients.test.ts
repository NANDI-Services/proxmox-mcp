import { describe, expect, it } from "vitest";
import {
  clientAdapters,
  mergeServerEntry,
  parseClientIds,
  renderGenericConfig,
  validateForClient
} from "../../src/config/clients.js";
import { buildServerEntry, validateMcpConfig } from "../../src/config/installDescriptor.js";

const entry = buildServerEntry("C:/proj/.nandi-proxmox-mcp/config.json");

describe("client adapters", () => {
  it("uses the right root key per client", () => {
    expect(clientAdapters["claude-code"].rootKey).toBe("mcpServers");
    expect(clientAdapters.vscode.rootKey).toBe("servers");
  });

  it("targets .mcp.json for Claude Code", () => {
    expect(clientAdapters["claude-code"].targetPath("C:/proj").replace(/\\/g, "/")).toBe("C:/proj/.mcp.json");
  });

  it("targets .vscode/mcp.json for VS Code", () => {
    expect(clientAdapters.vscode.targetPath("C:/proj").replace(/\\/g, "/")).toBe("C:/proj/.vscode/mcp.json");
  });

  describe("parseClientIds", () => {
    it("accepts known ids", () => {
      expect(parseClientIds("claude-code,vscode")).toEqual(["claude-code", "vscode"]);
    });

    it("rejects unknown ids with a useful message", () => {
      expect(() => parseClientIds("claude-code,emacs")).toThrow(/emacs/);
    });
  });

  describe("mergeServerEntry", () => {
    it("creates the root key when the document is empty", () => {
      const merged = mergeServerEntry(undefined, "mcpServers", entry);
      expect(merged.mcpServers).toHaveProperty("nandi-proxmox-mcp");
    });

    // The critical data-safety property: a user's .mcp.json routinely holds
    // other servers and unrelated keys.
    it("preserves sibling servers and unrelated top-level keys", () => {
      const existing = {
        mcpServers: {
          "other-server": { command: "node", args: ["other.js"] }
        },
        someUserKey: { keep: true }
      };

      const merged = mergeServerEntry(existing, "mcpServers", entry);

      expect(merged.someUserKey).toEqual({ keep: true });
      expect(merged.mcpServers).toHaveProperty("other-server");
      expect(merged.mcpServers).toHaveProperty("nandi-proxmox-mcp");
    });

    it("does not mutate the input document", () => {
      const existing = { mcpServers: { other: { command: "node", args: [] } } };
      mergeServerEntry(existing, "mcpServers", entry);
      expect(Object.keys(existing.mcpServers)).toEqual(["other"]);
    });

    it("replaces a stale entry for this server", () => {
      const existing = { mcpServers: { "nandi-proxmox-mcp": { command: "old", args: [] } } };
      const merged = mergeServerEntry(existing, "mcpServers", entry);
      const servers = merged.mcpServers as Record<string, { command: string }>;
      expect(servers["nandi-proxmox-mcp"]?.command).toBe("npx");
    });
  });

  describe("validation", () => {
    it("validates a Claude Code document under mcpServers", () => {
      const doc = mergeServerEntry(undefined, "mcpServers", entry);
      expect(validateForClient(clientAdapters["claude-code"], doc).ok).toBe(true);
    });

    it("rejects a Claude Code document validated against the wrong root", () => {
      const doc = mergeServerEntry(undefined, "servers", entry);
      expect(validateForClient(clientAdapters["claude-code"], doc).ok).toBe(false);
    });

    it("accepts a non-npx launcher when reading a user file, with a warning", () => {
      const doc = {
        mcpServers: {
          "nandi-proxmox-mcp": {
            command: "node",
            args: ["dist/src/cli/main.js", "run"],
            env: { NANDI_PROXMOX_CONFIG: "C:/proj/config.json" }
          }
        }
      };

      const result = validateForClient(clientAdapters["claude-code"], doc, { strictLauncher: false });
      expect(result.ok).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("still rejects a non-npx launcher for generated configs", () => {
      const doc = {
        mcpServers: {
          "nandi-proxmox-mcp": {
            command: "node",
            args: ["dist/src/cli/main.js", "run"],
            env: { NANDI_PROXMOX_CONFIG: "C:/proj/config.json" }
          }
        }
      };

      expect(validateForClient(clientAdapters["claude-code"], doc, { strictLauncher: true }).ok).toBe(false);
    });

    it("keeps the legacy single-argument call working", () => {
      const doc = mergeServerEntry(undefined, "servers", entry);
      expect(validateMcpConfig(doc).ok).toBe(true);
    });
  });

  describe("policy env", () => {
    it("omits policy vars when not requested", () => {
      expect(entry.env).toEqual({ NANDI_PROXMOX_CONFIG: "C:/proj/.nandi-proxmox-mcp/config.json" });
    });

    it("emits the access tier and module mode when given", () => {
      const restricted = buildServerEntry("C:/proj/config.json", {
        accessTier: "read-only",
        moduleMode: "core"
      });

      expect(restricted.env?.PVE_ACCESS_TIER).toBe("read-only");
      expect(restricted.env?.PVE_MODULE_MODE).toBe("core");
    });
  });

  it("renders a generic config covering both client shapes", () => {
    const rendered = renderGenericConfig(entry);
    expect(rendered).toContain("mcpServers");
    expect(rendered).toContain("servers");
    expect(rendered).toContain("NANDI_PROXMOX_CONFIG");
  });
});
