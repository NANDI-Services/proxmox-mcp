import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runHarden } from "../../src/cli/harden.js";
import { humanGateToolNames } from "../../src/config/permissions.js";

/**
 * Only the `--name` path is exercised here.
 *
 * Calling `runHarden()` with no name targets every instance `findInstances`
 * discovers, and that scan includes the home directory -- so a test for it
 * would edit the settings file of whoever ran the suite, and would pass or fail
 * depending on which clusters they happen to have configured.
 */

const scratch = (): string => mkdtempSync(join(tmpdir(), "nandi-harden-"));

const askIn = (dir: string): string[] => {
  const doc = JSON.parse(readFileSync(join(dir, ".claude", "settings.json"), "utf8")) as {
    permissions: { ask: string[] };
  };
  return doc.permissions.ask;
};

let out: string[];

beforeEach(() => {
  out = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    out.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("harden", () => {
  // The case this command exists for: a server added straight to the client
  // config with `claude mcp add`, which leaves no credentials file here.
  it("hardens an instance that was configured by hand", async () => {
    const dir = scratch();

    await runHarden({ name: "hand-rolled", scope: "project" }, dir);

    expect(askIn(dir)).toHaveLength(humanGateToolNames().length);
    expect(askIn(dir)).toContain("mcp__hand-rolled__pve_qemu_delete");
    expect(process.exitCode).toBeUndefined();
  });

  it("says so instead of rewriting when the rules are already there", async () => {
    const dir = scratch();

    await runHarden({ name: "lab", scope: "project" }, dir);
    out = [];
    await runHarden({ name: "lab", scope: "project" }, dir);

    expect(out.join("")).toContain("already covered");
    expect(askIn(dir)).toHaveLength(humanGateToolNames().length);
  });

  // A guard that reports success it did not achieve is worse than no guard, so
  // an unwritable settings file has to fail loudly and set a non-zero exit.
  it("fails with a non-zero exit when the settings file cannot be parsed", async () => {
    const dir = scratch();
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, ".claude", "settings.json"), "{ broken", "utf8");

    await runHarden({ name: "lab", scope: "project" }, dir);

    expect(process.exitCode).toBe(1);
    expect(out.join("")).toContain("FAILED");
    expect(out.join("")).not.toContain("Restart your MCP client");
  });
});
