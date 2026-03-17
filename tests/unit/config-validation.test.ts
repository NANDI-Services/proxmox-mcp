import { describe, expect, it } from "vitest";
import { runtimeConfigSchema } from "../../src/config/validate.js";

describe("config validation", () => {
  it("accepts valid config", () => {
    const parsed = runtimeConfigSchema.parse({
      proxmoxHost: "pve.local",
      proxmoxPort: 8006,
      proxmoxUser: "svc_mcp",
      proxmoxRealm: "pve",
      tokenName: "token1",
      tokenSecret: "verylongsecret",
      allowInsecureTls: false,
      sshHost: "pve.local",
      sshPort: 22,
      sshUser: "root",
      sshKeyPath: "C:/Users/test/.ssh/id_ed25519"
    });

    expect(parsed.proxmoxPort).toBe(8006);
  });

  it("rejects short token", () => {
    const result = runtimeConfigSchema.safeParse({
      proxmoxHost: "pve.local",
      proxmoxPort: 8006,
      proxmoxUser: "svc_mcp",
      proxmoxRealm: "pve",
      tokenName: "token1",
      tokenSecret: "short",
      allowInsecureTls: false,
      sshHost: "pve.local",
      sshPort: 22,
      sshUser: "root",
      sshKeyPath: "C:/Users/test/.ssh/id_ed25519"
    });

    expect(result.success).toBe(false);
  });
});
