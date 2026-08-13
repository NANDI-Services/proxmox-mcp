import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chooseConfigPath, discoverConfigPath } from "../../src/config/fileConfig.js";
import type { InstanceRef } from "../../src/config/instances.js";

const scratchProject = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "nandi-discovery-"));
  mkdirSync(join(dir, ".nandi-proxmox-mcp"), { recursive: true });
  return dir;
};

const normalize = (path: string): string => path.replace(/\\/g, "/");

const instance = (name: string, scope: "project" | "user"): InstanceRef => ({
  name,
  scope,
  configPath: `/${scope}/.nandi-proxmox-mcp/${name}.json`,
  serverKey: name
});

// The decision is tested separately from the filesystem on purpose:
// findInstances also scans the home directory, so a test that walked the real
// disk would pass or fail depending on whose machine ran it.
describe("chooseConfigPath", () => {
  it("takes the single configured instance", () => {
    expect(chooseConfigPath([instance("lab", "project")])).toContain("lab.json");
  });

  // An admin with a production cluster and a lab in user scope must not get an
  // ambiguity error inside a project that configured exactly one Proxmox.
  it("lets project scope win over user scope", () => {
    const chosen = chooseConfigPath([
      instance("produccion", "user"),
      instance("lab", "user"),
      instance("este-proyecto", "project")
    ]);

    expect(chosen).toContain("este-proyecto.json");
  });

  // Choosing between a production cluster and a lab box on the operator's
  // behalf is the one guess this must never make.
  it("refuses to guess between two instances in the same scope, and names both", () => {
    const failure = (() => {
      try {
        chooseConfigPath([instance("produccion", "user"), instance("lab", "user")]);
        return undefined;
      } catch (error) {
        return error as Error;
      }
    })();

    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).toContain("produccion");
    expect(failure?.message).toContain("lab");
    expect(failure?.message).toContain("NANDI_PROXMOX_CONFIG");
  });

  it("points at setup when nothing is configured", () => {
    expect(() => chooseConfigPath([])).toThrow(/setup/);
  });
});

describe("discoverConfigPath", () => {
  it("finds an instance written into the project", async () => {
    const dir = scratchProject();
    writeFileSync(join(dir, ".nandi-proxmox-mcp", "lab.json"), "{}");

    expect(normalize(await discoverConfigPath(dir))).toContain(".nandi-proxmox-mcp/lab.json");
  });

  // Installs made before the multi-instance layout must keep starting.
  it("prefers the legacy config.json when it exists", async () => {
    const dir = scratchProject();
    writeFileSync(join(dir, ".nandi-proxmox-mcp", "config.json"), "{}");
    writeFileSync(join(dir, ".nandi-proxmox-mcp", "lab.json"), "{}");

    expect(normalize(await discoverConfigPath(dir))).toContain(".nandi-proxmox-mcp/config.json");
  });
});
