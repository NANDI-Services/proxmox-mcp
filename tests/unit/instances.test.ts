import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSTANCE_NAME,
  assertValidInstanceName,
  findInstances,
  instanceRef,
  resolveInstanceByName,
  sanitizeInstanceName
} from "../../src/config/instances.js";
import { summarizeSshFailure } from "../../src/cli/setup.js";

const scratchProject = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "nandi-instances-"));
  mkdirSync(join(dir, ".nandi-proxmox-mcp"), { recursive: true });
  return dir;
};

describe("instances", () => {
  describe("sanitizeInstanceName", () => {
    it("keeps an already valid name", () => {
      expect(sanitizeInstanceName("production-cluster")).toBe("production-cluster");
    });

    // Cluster names come straight from the Proxmox API, so they can contain
    // anything an admin typed at install time.
    it("normalises a cluster name with spaces and capitals", () => {
      expect(sanitizeInstanceName("Datacenter Cluster 01")).toBe("datacenter-cluster-01");
    });

    it("strips leading punctuation", () => {
      expect(sanitizeInstanceName("--weird--name")).toBe("weird--name");
    });

    it("falls back to the default when nothing usable remains", () => {
      expect(sanitizeInstanceName("!!!")).toBe(DEFAULT_INSTANCE_NAME);
    });

    it("produces a name that passes validation", () => {
      expect(() => assertValidInstanceName(sanitizeInstanceName("PVE Cluster / Prod"))).not.toThrow();
    });
  });

  describe("assertValidInstanceName", () => {
    it("rejects a name with a path separator", () => {
      expect(() => assertValidInstanceName("a/b")).toThrow(/Invalid instance name/);
    });

    it("rejects an empty name", () => {
      expect(() => assertValidInstanceName("")).toThrow();
    });
  });

  describe("instanceRef", () => {
    it("gives each instance its own credentials file", () => {
      const cluster = instanceRef("cluster", "project", "C:/proj");
      const lab = instanceRef("lab", "project", "C:/proj");

      expect(cluster.configPath).not.toBe(lab.configPath);
      expect(cluster.configPath.replace(/\\/g, "/")).toContain(".nandi-proxmox-mcp/cluster.json");
      expect(lab.serverKey).toBe("lab");
    });

    it("separates project and user scope", () => {
      const project = instanceRef("cluster", "project", "C:/proj");
      const user = instanceRef("cluster", "user", "C:/proj");

      expect(project.configPath).not.toBe(user.configPath);
    });
  });

  describe("findInstances", () => {
    it("finds every configured instance", async () => {
      const dir = scratchProject();
      writeFileSync(join(dir, ".nandi-proxmox-mcp", "cluster.json"), "{}");
      writeFileSync(join(dir, ".nandi-proxmox-mcp", "lab.json"), "{}");

      const found = await findInstances(dir);

      expect(found.map((entry) => entry.name).sort()).toContain("cluster");
      expect(found.map((entry) => entry.name).sort()).toContain("lab");
    });

    it("still recognises the legacy single-instance layout", async () => {
      const dir = scratchProject();
      writeFileSync(join(dir, ".nandi-proxmox-mcp", "config.json"), "{}");

      const found = await findInstances(dir);

      expect(found.some((entry) => entry.name === "nandi-proxmox-mcp")).toBe(true);
    });

    // findInstances deliberately scans project *and* user scope, so this must
    // only assert about the project scope: a developer who actually uses the
    // tool has instances in their home directory, and asserting an empty result
    // would make the suite depend on whose machine it runs on.
    it("finds no project-scope instance in an empty directory", async () => {
      const dir = mkdtempSync(join(tmpdir(), "nandi-empty-"));
      const found = await findInstances(dir);

      expect(found.filter((entry) => entry.scope === "project")).toEqual([]);
    });
  });

  describe("resolveInstanceByName", () => {
    it("names the configured instances when the requested one is unknown", async () => {
      const dir = scratchProject();
      writeFileSync(join(dir, ".nandi-proxmox-mcp", "cluster.json"), "{}");

      await expect(resolveInstanceByName("typo", dir)).rejects.toThrow(/cluster/);
    });
  });
});

describe("summarizeSshFailure", () => {
  // The raw banner is 15 lines and tells a non-expert nothing actionable.
  it("turns a changed host key into a one-line fix", () => {
    const banner = [
      "@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@",
      "@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @",
      "IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!",
      "Host key verification failed."
    ].join("\n");

    const summary = summarizeSshFailure(banner);

    expect(summary).toContain("ssh-keygen -R");
    expect(summary.split("\n")).toHaveLength(1);
  });

  it("explains a rejected key", () => {
    expect(summarizeSshFailure("root@pve: Permission denied (publickey).")).toContain("authorized_keys");
  });

  it("explains a refused connection", () => {
    expect(summarizeSshFailure("ssh: connect to host pve port 22: Connection refused")).toContain("sshd");
  });

  it("mentions the VPN on a timeout", () => {
    expect(summarizeSshFailure("ssh: connect to host pve port 22: Connection timed out")).toContain("VPN");
  });

  it("falls back to the first line of an unrecognised failure", () => {
    expect(summarizeSshFailure("something odd\nsecond line")).toBe("something odd");
  });
});
