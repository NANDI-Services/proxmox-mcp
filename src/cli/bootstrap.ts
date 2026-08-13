import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

/**
 * Bootstrap: the part of setup that does not happen on your machine.
 *
 * Before this MCP can do anything, an operator has to create an API token
 * inside Proxmox itself. That step is the single biggest drop-off point: it is
 * a web UI form with an easily-missed checkbox, and getting it wrong produces a
 * 401 that looks like a bad secret rather than a permissions problem.
 *
 * So this command does not talk to Proxmox at all. It prints a block the
 * operator pastes into the Proxmox shell (Datacenter -> Shell in the web UI),
 * which needs no SSH key -- and SSH access is precisely what they do not have
 * yet. The block is plain `pveum`, so it is auditable before running.
 */

export const accessTiers = ["read-only", "read-execute", "full"] as const;
export type AccessTier = (typeof accessTiers)[number];

export type BootstrapOptions = {
  user?: string;
  realm?: string;
  tokenName?: string;
  tier?: string;
  /** Path to an SSH *public* key to authorize on the node. */
  sshKey?: string;
  /** Generate a new keypair first, then authorize it. */
  newSshKey?: boolean;
};

/**
 * Built-in Proxmox roles per tier.
 *
 * These are Proxmox's own roles, but the mapping is our choice: it is the
 * smallest role that still lets every tool in that tier work. An operator who
 * wants tighter scoping can swap the role or narrow the ACL path; the emitted
 * script says so.
 */
export const rolesForTier = (tier: AccessTier): string[] => {
  switch (tier) {
    case "read-only":
      return ["PVEAuditor"];
    case "read-execute":
      // PVEAuditor alone cannot start or stop a guest; PVEVMUser adds power
      // management without granting create/delete.
      return ["PVEAuditor", "PVEVMUser"];
    case "full":
      return ["PVEAdmin"];
  }
};

export const parseTier = (value: string | undefined): AccessTier => {
  if (value === undefined) {
    return "read-only";
  }

  const normalized = value.trim().toLowerCase();
  if ((accessTiers as readonly string[]).includes(normalized)) {
    return normalized as AccessTier;
  }

  throw new Error(`Unknown access tier "${value}". Use one of: ${accessTiers.join(", ")}.`);
};

/** Proxmox identifiers end up inside a shell script, so keep them boring. */
const assertShellSafe = (value: string, label: string): string => {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) {
    throw new Error(
      `Invalid ${label} "${value}". Use letters, digits, dot, dash or underscore, starting with a letter or digit.`
    );
  }
  return trimmed;
};

/** Single-quote for /bin/sh: the only byte that matters is the quote itself. */
const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

export const defaultKeyPath = (): string => resolve(homedir(), ".ssh", "id_ed25519_proxmox");

export type GeneratedKey = {
  privateKeyPath: string;
  publicKeyPath: string;
  publicKey: string;
  created: boolean;
};

/**
 * Generates an ed25519 keypair with no passphrase.
 *
 * The empty passphrase is passed as its own argv entry with `shell: false`.
 * Going through a shell instead is a real trap on Windows: PowerShell turns
 * `-N '""'` into the two-character literal passphrase `""`, producing a key
 * that every server rejects with "Permission denied (publickey)" -- a message
 * that says nothing about a passphrase and sends people to inspect
 * authorized_keys for hours.
 */
export const generateSshKey = (keyPath: string): GeneratedKey => {
  const publicKeyPath = `${keyPath}.pub`;

  if (existsSync(keyPath)) {
    if (!existsSync(publicKeyPath)) {
      throw new Error(
        `${keyPath} exists but ${publicKeyPath} does not. Recover the public key with ` +
          `\`ssh-keygen -y -f "${keyPath}" > "${publicKeyPath}"\`, then re-run.`
      );
    }

    return {
      privateKeyPath: keyPath,
      publicKeyPath,
      publicKey: readFileSync(publicKeyPath, "utf8").trim(),
      created: false
    };
  }

  const result = spawnSync(
    "ssh-keygen",
    ["-t", "ed25519", "-f", keyPath, "-N", "", "-C", "nandi-proxmox-mcp"],
    { encoding: "utf8", shell: false }
  );

  if (result.error) {
    throw new Error(
      `Could not run ssh-keygen (${result.error.message}). On Windows, install the OpenSSH Client optional feature.`
    );
  }

  if (result.status !== 0) {
    throw new Error(`ssh-keygen failed: ${(result.stderr || result.stdout || "").trim()}`);
  }

  return {
    privateKeyPath: keyPath,
    publicKeyPath,
    publicKey: readFileSync(publicKeyPath, "utf8").trim(),
    created: true
  };
};

export const readPublicKey = (path: string): string => {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`No such file: ${resolved}`);
  }

  const contents = readFileSync(resolved, "utf8").trim();

  if (contents.includes("PRIVATE KEY")) {
    throw new Error(
      `${resolved} is a PRIVATE key. Pass the public one instead -- same path with a .pub suffix. ` +
        "The private key must never leave your machine."
    );
  }

  if (!/^(ssh-ed25519|ssh-rsa|ecdsa-sha2-\S+|sk-ssh-\S+)\s/.test(contents)) {
    throw new Error(`${resolved} does not look like an SSH public key (expected it to start with e.g. "ssh-ed25519").`);
  }

  return contents;
};

export type ScriptInput = {
  user: string;
  realm: string;
  tokenName: string;
  tier: AccessTier;
  publicKey?: string;
};

/**
 * The block the operator pastes into the Proxmox shell.
 *
 * It is deliberately readable rather than clever: whoever runs it is granting
 * an API credential over their own infrastructure and should be able to see
 * exactly what each line does before pressing enter.
 */
export const renderBootstrapScript = (input: ScriptInput): string => {
  const account = `${input.user}@${input.realm}`;
  const roles = rolesForTier(input.tier);
  const lines: string[] = [];

  lines.push(`# nandi-proxmox-mcp bootstrap -- tier: ${input.tier}`);
  lines.push("# Paste this into the Proxmox shell (web UI: Datacenter -> Shell), as root.");
  lines.push("");
  lines.push("# 1. A dedicated account, so this MCP never uses root@pam.");
  lines.push(
    `pveum user add ${account} --comment "nandi-proxmox-mcp" 2>/dev/null || echo "user ${account} already exists, continuing"`
  );
  lines.push("");
  lines.push(`# 2. Permissions. ${roles.join(" + ")} on / is the smallest role set that`);
  lines.push(`#    covers the "${input.tier}" tier. Narrow the path (e.g. /vms/101) to scope it further.`);
  lines.push(`pveum acl modify / --users ${account} --roles ${roles.join(",")}`);
  lines.push("");
  lines.push("# 3. The token. --privsep 0 makes it inherit the permissions granted above.");
  lines.push("#    With --privsep 1 (the web UI default) the token starts with NO permissions");
  lines.push("#    at all, and every call returns 401 even though the user is configured");
  lines.push("#    correctly. That mismatch is the most common setup failure.");
  lines.push(`pveum user token add ${account} ${input.tokenName} --privsep 0`);
  lines.push("");
  lines.push("# ^ Copy the `value` from that table NOW. Proxmox shows it exactly once.");

  if (input.publicKey) {
    lines.push("");
    lines.push("# 4. SSH key, needed only for tools that run commands inside containers");
    lines.push("#    (pct exec) -- every REST tool works without it.");
    lines.push("#    In a cluster, authorized_keys lives on pmxcfs and is shared by every");
    lines.push("#    node, so running this once authorizes all of them.");
    lines.push("mkdir -p /root/.ssh && chmod 700 /root/.ssh");
    lines.push(`grep -qxF ${shellQuote(input.publicKey)} /root/.ssh/authorized_keys 2>/dev/null || \\`);
    lines.push(`  echo ${shellQuote(input.publicKey)} >> /root/.ssh/authorized_keys`);
    lines.push("chmod 600 /root/.ssh/authorized_keys");
  }

  return `${lines.join("\n")}\n`;
};

export const runBootstrap = async (options: BootstrapOptions = {}): Promise<void> => {
  const tier = parseTier(options.tier);
  const user = assertShellSafe(options.user ?? "mcp", "user");
  const realm = assertShellSafe(options.realm ?? "pve", "realm");
  const tokenName = assertShellSafe(options.tokenName ?? "nandi", "token name");

  let publicKey: string | undefined;
  let generated: GeneratedKey | undefined;

  if (options.newSshKey) {
    generated = generateSshKey(options.sshKey ? resolve(options.sshKey) : defaultKeyPath());
    publicKey = generated.publicKey;
  } else if (options.sshKey) {
    publicKey = readPublicKey(options.sshKey);
  }

  const out = process.stdout;

  out.write("nandi-proxmox-mcp bootstrap\n\n");
  out.write("This command talks to nothing. It prints the commands that create an API token\n");
  out.write("inside your own Proxmox, so you can read them before running them.\n\n");

  if (generated) {
    out.write(
      generated.created
        ? `Generated a new SSH key: ${generated.privateKeyPath}\n`
        : `Reusing the existing SSH key at ${generated.privateKeyPath}\n`
    );
    out.write(`Public half (the only one that leaves this machine): ${generated.publicKeyPath}\n\n`);
  }

  out.write("--- copy from here ---\n\n");
  out.write(renderBootstrapScript({ user, realm, tokenName, tier, publicKey }));
  out.write("\n--- to here ---\n\n");

  out.write("Then, back here:\n\n");
  out.write("  npx nandi-proxmox-mcp setup\n\n");
  out.write(`It will ask for the token name (${tokenName}) and the secret you just copied.\n`);

  if (!publicKey) {
    out.write(
      "\nNo SSH key included. That is fine for the REST tools, which are most of them.\n" +
        "Re-run with --new-ssh-key if you also want to run commands inside containers.\n"
    );
  }
};
