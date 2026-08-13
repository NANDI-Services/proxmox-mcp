import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  accessTiers,
  parseTier,
  readPublicKey,
  renderBootstrapScript,
  rolesForTier,
  type AccessTier
} from "../../src/cli/bootstrap.js";

const scratch = (): string => mkdtempSync(join(tmpdir(), "nandi-bootstrap-"));

const SAMPLE_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyMaterialForTests nandi-proxmox-mcp";

describe("rolesForTier", () => {
  it("grants only audit permissions at read-only", () => {
    expect(rolesForTier("read-only")).toEqual(["PVEAuditor"]);
  });

  // PVEAuditor alone cannot start or stop a guest, which is the whole point of
  // this tier: without the second role the tier would be read-only in practice.
  it("adds power management at read-execute", () => {
    expect(rolesForTier("read-execute")).toContain("PVEVMUser");
  });

  it("never emits an empty role set", () => {
    for (const tier of accessTiers) {
      expect(rolesForTier(tier).length).toBeGreaterThan(0);
    }
  });
});

describe("parseTier", () => {
  it("defaults to the safest tier", () => {
    expect(parseTier(undefined)).toBe("read-only");
  });

  it("names the valid tiers when given a typo", () => {
    expect(() => parseTier("readonly")).toThrow(/read-only/);
  });
});

describe("renderBootstrapScript", () => {
  const base = { user: "mcp", realm: "pve", tokenName: "nandi", tier: "read-only" as AccessTier };

  // The whole reason this command exists: --privsep 1 is the web UI default and
  // produces a token with no permissions, which surfaces as a 401 that looks
  // like a wrong secret.
  it("creates the token with privilege separation off", () => {
    expect(renderBootstrapScript(base)).toContain("pveum user token add mcp@pve nandi --privsep 0");
  });

  it("explains why, so nobody pastes it blind", () => {
    expect(renderBootstrapScript(base)).toMatch(/401/);
  });

  it("creates a dedicated user rather than using root", () => {
    const script = renderBootstrapScript(base);
    expect(script).toContain("pveum user add mcp@pve");

    // The prose explains why root@pam is avoided, so assert on the commands
    // themselves rather than on the presence of the string.
    const commands = script.split("\n").filter((line) => line.startsWith("pveum"));
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.some((line) => line.includes("root@pam"))).toBe(false);
  });

  it("grants the roles that match the requested tier", () => {
    expect(renderBootstrapScript({ ...base, tier: "full" })).toContain("--roles PVEAdmin");
    expect(renderBootstrapScript({ ...base, tier: "read-execute" })).toContain("--roles PVEAuditor,PVEVMUser");
  });

  it("omits the SSH section when no key is given", () => {
    const script = renderBootstrapScript(base);
    expect(script).not.toContain("authorized_keys");
  });

  it("appends the key idempotently when one is given", () => {
    const script = renderBootstrapScript({ ...base, publicKey: SAMPLE_KEY });
    expect(script).toContain("authorized_keys");
    // Re-pasting the block must not duplicate the entry.
    expect(script).toContain("grep -qxF");
  });

  it("says that one paste covers every node of a cluster", () => {
    expect(renderBootstrapScript({ ...base, publicKey: SAMPLE_KEY })).toMatch(/pmxcfs|shared by every/);
  });

  // The key is interpolated into a shell script, so a quote in the comment
  // field must not be able to end the string.
  it("quotes a public key containing a single quote", () => {
    const nasty = `${SAMPLE_KEY} o'brien`;
    const script = renderBootstrapScript({ ...base, publicKey: nasty });
    expect(script).toContain(`'\\''`);
    expect(script).not.toMatch(/echo 'ssh-ed25519[^']*o'brien'/);
  });
});

describe("readPublicKey", () => {
  it("refuses a private key instead of silently sending it to a server", () => {
    const dir = scratch();
    const path = join(dir, "id_ed25519");
    // Assembled at runtime so the PEM header never appears literally in this
    // file. CI runs gitleaks over the whole history, whose default private-key
    // rule matches the header regardless of the body -- and a match that lands
    // in a commit cannot be undone by a later one.
    const header = ["-----BEGIN OPENSSH", "PRIVATE", "KEY-----"].join(" ");
    writeFileSync(path, `${header}\nabc\n${header.replace("BEGIN", "END")}\n`);

    expect(() => readPublicKey(path)).toThrow(/PRIVATE key/);
  });

  it("rejects a file that is not a key at all", () => {
    const dir = scratch();
    const path = join(dir, "notes.txt");
    writeFileSync(path, "just some text\n");

    expect(() => readPublicKey(path)).toThrow(/does not look like an SSH public key/);
  });

  it("accepts a well-formed public key", () => {
    const dir = scratch();
    const path = join(dir, "id_ed25519.pub");
    writeFileSync(path, `${SAMPLE_KEY}\n`);

    expect(readPublicKey(path)).toBe(SAMPLE_KEY);
  });
});
