import { describe, expect, it } from "vitest";
import {
  buildWorkspaceMcpConfig,
  normalizeMcpConfigDocument,
  validateMcpConfig,
  validateMcpManifest
} from "../../src/config/installDescriptor.js";

describe("mcp install descriptor", () => {
  it("renders workspace MCP config with root servers", () => {
    const cfg = buildWorkspaceMcpConfig("C:/repo/.nandi-proxmox-mcp/config.json");
    const entry = cfg.servers["nandi-proxmox-mcp"];
    expect(entry).toBeDefined();
    expect(entry?.command).toBe("npx");
  });

  it("migrates legacy mcp wrapper format", () => {
    const legacy = JSON.stringify({
      mcp: {
        servers: {
          "nandi-proxmox-mcp": {
            command: "npx",
            args: ["nandi-proxmox-mcp", "run"],
            env: { NANDI_PROXMOX_CONFIG: "C:/x/config.json" }
          }
        }
      }
    });

    const normalized = normalizeMcpConfigDocument(legacy);
    expect(normalized.migratedLegacy).toBe(true);
    expect(normalized.normalized.servers["nandi-proxmox-mcp"]).toBeDefined();
  });

  it("validates minimal manifest", () => {
    const result = validateMcpManifest({
      schema_version: "1.0",
      id: "nandi-proxmox-mcp",
      display_name: "NANDI Proxmox MCP",
      description: "desc",
      transport: "stdio",
      runtime: { command: "npx", args: ["nandi-proxmox-mcp", "run"] },
      docs: { quickstart: "a", security: "b", troubleshooting: "c" }
    });

    expect(result.ok).toBe(true);
  });

  it("rejects invalid mcp config", () => {
    const result = validateMcpConfig({ servers: {} });
    expect(result.ok).toBe(false);
  });
});
