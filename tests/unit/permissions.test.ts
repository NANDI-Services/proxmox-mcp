import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  claudeSettingsPath,
  humanGateRules,
  humanGateToolNames,
  mergeAskRules,
  writeHumanGateRules
} from "../../src/config/permissions.js";
import { toolCatalog } from "../../src/tools/catalog.js";

const scratch = (): string => mkdtempSync(join(tmpdir(), "nandi-permissions-"));

const settingsIn = (dir: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8")) as Record<string, unknown>;

const askIn = (dir: string): string[] =>
  ((settingsIn(dir).permissions as Record<string, unknown>).ask ?? []) as string[];

describe("humanGateToolNames", () => {
  // Derived from the flag rather than listed here, so a tool added tomorrow is
  // covered without anyone remembering to update a second list.
  it("is exactly the confirm-required tools plus their aliases", () => {
    const expected = toolCatalog
      .filter((tool) => tool.confirmRequired)
      .flatMap((tool) => [tool.name, ...(tool.aliases ?? [])]);

    expect(humanGateToolNames().sort()).toEqual(expected.sort());
  });

  it("covers the aliases, which are separate tool names on the wire", () => {
    expect(humanGateToolNames()).toContain("stopVM");
    expect(humanGateToolNames()).toContain("execInContainer");
  });

  it("leaves start and resume out", () => {
    expect(humanGateToolNames()).not.toContain("pve_start_qemu_vm");
    expect(humanGateToolNames()).not.toContain("startVM");
  });
});

describe("humanGateRules", () => {
  it("namespaces every rule under the instance's server key", () => {
    const rules = humanGateRules("lab-cluster");

    expect(rules).toContain("mcp__lab-cluster__pve_qemu_delete");
    expect(rules.every((rule) => rule.startsWith("mcp__lab-cluster__"))).toBe(true);
    expect(rules).toHaveLength(humanGateToolNames().length);
  });

  it("keeps two instances apart", () => {
    expect(humanGateRules("weizman")).not.toEqual(humanGateRules("lab-cluster"));
  });
});

describe("mergeAskRules", () => {
  it("creates the block when the file had none", () => {
    const merged = mergeAskRules(undefined, ["mcp__lab__pve_qemu_delete"]);

    expect((merged.permissions as Record<string, unknown>).ask).toEqual(["mcp__lab__pve_qemu_delete"]);
  });

  // settings.json routinely holds hooks, env and the operator's own rules.
  // Losing those to a guard meant to protect them would be its own damage.
  it("preserves unrelated settings and existing permission rules", () => {
    const merged = mergeAskRules(
      {
        env: { FOO: "bar" },
        permissions: { allow: ["Bash(npm test)"], deny: ["Read(./.env)"], ask: ["Bash(rm *)"] }
      },
      ["mcp__lab__pve_qemu_delete"]
    );

    const permissions = merged.permissions as Record<string, unknown>;
    expect(merged.env).toEqual({ FOO: "bar" });
    expect(permissions.allow).toEqual(["Bash(npm test)"]);
    expect(permissions.deny).toEqual(["Read(./.env)"]);
    expect(permissions.ask).toEqual(["Bash(rm *)", "mcp__lab__pve_qemu_delete"]);
  });

  it("does not duplicate a rule that is already there", () => {
    const once = mergeAskRules(undefined, ["mcp__lab__pve_qemu_delete"]);
    const twice = mergeAskRules(once, ["mcp__lab__pve_qemu_delete"]);

    expect((twice.permissions as Record<string, unknown>).ask).toEqual(["mcp__lab__pve_qemu_delete"]);
  });

  it("refuses a permissions value it does not understand instead of replacing it", () => {
    expect(() => mergeAskRules({ permissions: "everything" }, ["mcp__lab__x"])).toThrow(/not an object/);
    expect(() => mergeAskRules({ permissions: { ask: "everything" } }, ["mcp__lab__x"])).toThrow(/not an array/);
  });
});

describe("claudeSettingsPath", () => {
  // Asserted relative to the base the function was given, not as an absolute
  // string: `resolve("/repo")` is absolute on Linux and gets the drive letter
  // prepended on Windows, so pinning the prefix would make this pass or fail by
  // operating system rather than by behaviour.
  it("follows the instance scope, so a user-scope server is guarded everywhere", () => {
    const project = claudeSettingsPath("project", join(tmpdir(), "repo"));
    const user = claudeSettingsPath("user", join(tmpdir(), "repo"));

    expect(relative(join(tmpdir(), "repo"), project).replace(/\\/g, "/")).toBe(".claude/settings.json");
    expect(relative(homedir(), user).replace(/\\/g, "/")).toBe(".claude/settings.json");
    expect(project).not.toBe(user);
  });
});

describe("writeHumanGateRules", () => {
  it("writes every rule and reports how many were new", async () => {
    const dir = scratch();

    const result = await writeHumanGateRules("lab-cluster", "project", dir);

    expect(result.added).toBe(humanGateToolNames().length);
    expect(result.total).toBe(humanGateToolNames().length);
    expect(askIn(dir)).toContain("mcp__lab-cluster__pve_qemu_delete");
  });

  // Running it twice is the normal case: setup writes it, then the operator
  // runs harden, or a second instance is added later.
  it("is idempotent", async () => {
    const dir = scratch();

    await writeHumanGateRules("lab-cluster", "project", dir);
    const second = await writeHumanGateRules("lab-cluster", "project", dir);

    expect(second.added).toBe(0);
    expect(askIn(dir)).toHaveLength(humanGateToolNames().length);
  });

  it("adds a second instance without disturbing the first", async () => {
    const dir = scratch();

    await writeHumanGateRules("lab-cluster", "project", dir);
    await writeHumanGateRules("weizman", "project", dir);

    const ask = askIn(dir);
    expect(ask).toContain("mcp__lab-cluster__pve_qemu_delete");
    expect(ask).toContain("mcp__weizman__pve_qemu_delete");
    expect(ask).toHaveLength(humanGateToolNames().length * 2);
  });

  it("refuses to overwrite a settings file it cannot parse", async () => {
    const dir = scratch();
    mkdirSync(join(dir, ".claude"), { recursive: true });
    const target = join(dir, ".claude", "settings.json");
    writeFileSync(target, "{ not json", "utf8");

    await expect(writeHumanGateRules("lab-cluster", "project", dir)).rejects.toThrow(/not valid JSON/);
    expect(readFileSync(target, "utf8")).toBe("{ not json");
  });
});
