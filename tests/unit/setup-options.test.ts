import { describe, expect, it } from "vitest";
import { resolveSetupConfig } from "../../src/cli/setup.js";

describe("setup options", () => {
  it("builds runtime config from non-interactive flags", () => {
    const config = resolveSetupConfig({
      proxmoxHost: "pve.local",
      proxmoxUser: "svc_mcp",
      tokenName: "nandi-mcp",
      tokenSecret: "super-secret-token",
      sshKeyPath: "C:/Users/test/.ssh/id_ed25519"
    });

    expect(config).toMatchObject({
      proxmoxHost: "pve.local",
      proxmoxPort: 8006,
      proxmoxUser: "svc_mcp",
      proxmoxRealm: "pve",
      tokenName: "nandi-mcp",
      sshHost: "pve.local",
      sshPort: 22,
      sshUser: "root",
      sshKeyPath: "C:/Users/test/.ssh/id_ed25519"
    });
  });

  it("fails fast when required flags are missing", () => {
    expect(() =>
      resolveSetupConfig({
        proxmoxHost: "pve.local",
        proxmoxUser: "svc_mcp"
      })
    ).toThrowError(/--token-name, --token-secret/);
  });
});
