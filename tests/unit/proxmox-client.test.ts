import { describe, expect, it } from "vitest";
import { buildTokenHeader } from "../../src/proxmox/auth.js";
import { ProxmoxHttpError, describeProxmoxHttpError } from "../../src/proxmox/errors.js";

describe("proxmox helpers", () => {
  it("builds API token header", () => {
    const header = buildTokenHeader({
      proxmoxHost: "pve.local",
      proxmoxPort: 8006,
      proxmoxUser: "svc_mcp",
      proxmoxRealm: "pve",
      tokenName: "nandi",
      tokenSecret: "secretsecret",
      allowInsecureTls: false,
      sshHost: "pve.local",
      sshPort: 22,
      sshUser: "root",
      sshKeyPath: "C:/id_ed25519"
    });

    expect(header).toContain("PVEAPIToken=");
    expect(header).toContain("svc_mcp@pve!nandi=secretsecret");
  });

  it("describes 403 error with ACL hint", () => {
    const description = describeProxmoxHttpError(new ProxmoxHttpError(403, "forbidden"));
    expect(description.message).toContain("403");
    expect(description.hint?.toLowerCase()).toContain("acl");
  });
});
