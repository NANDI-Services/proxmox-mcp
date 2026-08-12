import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawnSync } from "node:child_process";
import { ProxmoxClient } from "../proxmox/client.js";
import type { RuntimeConfig } from "../config/validate.js";
import { runtimeConfigSchema } from "../config/validate.js";
import { printReport, type ReportItem } from "./report.js";
import { runSshBatch } from "../ssh/sshClient.js";
import {
  buildServerEntry,
  type McpServerEntry
} from "../config/installDescriptor.js";
import {
  DEFAULT_INSTANCE_NAME,
  instanceRef,
  sanitizeInstanceName,
  type InstanceScope
} from "../config/instances.js";
import { readClusterTopology, type ClusterTopology } from "../ssh/nodeRouter.js";
import { parseTier, type AccessTier } from "./bootstrap.js";
import {
  clientAdapters,
  defaultClientIds,
  mergeServerEntry,
  parseClientIds,
  renderGenericConfig,
  serializeClientDocument,
  validateForClient,
  type ClientAdapter,
  type ClientId,
  type McpClientDocument
} from "../config/clients.js";


export type SetupOptions = {
  proxmoxHost?: string;
  proxmoxPort?: number;
  proxmoxUser?: string;
  proxmoxRealm?: string;
  tokenName?: string;
  tokenSecret?: string;
  allowInsecureTls?: boolean;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshKeyPath?: string;
  skipConnectivity?: boolean;
  /** Which client configs to write. Defaults to Claude Code + VS Code. */
  clients?: string;
  /** Emitted into the client config env block; the server defaults to `full`. */
  accessTier?: string;
  moduleMode?: string;
  /** Print a paste-ready config to stdout and write nothing. */
  printConfig?: boolean;
  /**
   * Instance name. One instance per Proxmox: run setup once per server and each
   * gets its own credentials file and its own entry in the client config.
   * Defaults to the discovered cluster or node name.
   */
  name?: string;
  /** `project` writes into the current directory, `user` into the home directory. */
  scope?: string;
};

const defaultSshKeyPath = (): string => resolve(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".ssh", "id_ed25519");

/**
 * The slice of readline the wizard uses.
 *
 * Declared as an interface rather than taken from `createInterface` so the flow
 * can be driven by a test. Piping a file into the real interface does not work:
 * readline flushes every line at once and the ones that arrive between two
 * questions are dropped, after which the process exits cleanly having answered
 * nothing -- which looks exactly like a hang that isn't one.
 */
export type Prompt = {
  question: (text: string) => Promise<string>;
  close: () => void;
};

/** Asks, explains first, and keeps asking until the answer is usable. */
const askText = async (
  rl: Prompt,
  options: { question: string; help?: string; fallback?: string; validate?: (value: string) => string | undefined }
): Promise<string> => {
  if (options.help) {
    output.write(`\n  ${options.help}\n`);
  }

  for (;;) {
    const suffix = options.fallback ? ` [${options.fallback}]` : "";
    const raw = (await rl.question(`  ${options.question}${suffix}: `)).trim();
    const value = raw.length > 0 ? raw : (options.fallback ?? "");

    if (value.length === 0) {
      output.write("  This one is required.\n");
      continue;
    }

    const problem = options.validate?.(value);
    if (problem) {
      output.write(`  ${problem}\n`);
      continue;
    }

    return value;
  }
};

const askYesNo = async (rl: Prompt, question: string, fallback: boolean, help?: string): Promise<boolean> => {
  if (help) {
    output.write(`\n  ${help}\n`);
  }

  for (;;) {
    const raw = (await rl.question(`  ${question} [${fallback ? "Y/n" : "y/N"}]: `)).trim().toLowerCase();
    if (raw.length === 0) {
      return fallback;
    }
    if (raw.startsWith("y") || raw === "s" || raw.startsWith("si") || raw.startsWith("sí")) {
      return true;
    }
    if (raw.startsWith("n")) {
      return false;
    }
    output.write("  Answer y or n.\n");
  }
};

const askChoice = async <T extends string>(
  rl: Prompt,
  question: string,
  choices: { value: T; label: string }[],
  fallback: T
): Promise<T> => {
  output.write(`\n  ${question}\n`);
  for (const [index, choice] of choices.entries()) {
    output.write(`    ${index + 1}) ${choice.value}${choice.value === fallback ? "  (default)" : ""} - ${choice.label}\n`);
  }

  for (;;) {
    const raw = (await rl.question(`  Choose 1-${choices.length} [${fallback}]: `)).trim().toLowerCase();
    if (raw.length === 0) {
      return fallback;
    }

    const byIndex = choices[Number.parseInt(raw, 10) - 1];
    if (byIndex) {
      return byIndex.value;
    }

    const byName = choices.find((choice) => choice.value === raw);
    if (byName) {
      return byName.value;
    }

    output.write(`  Pick a number from 1 to ${choices.length}.\n`);
  }
};

const parsePort = (value: string): number | undefined => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : undefined;
};

export type WizardResult = {
  config: RuntimeConfig;
  accessTier: AccessTier;
};

/**
 * The guided path.
 *
 * Rewritten around one observation: the hard part of this setup is not typing
 * the answers, it is knowing what the questions mean and what to do when the
 * answer is rejected. So every question carries one line of context, the two
 * decisions with real consequences (how much power to grant, and whether SSH is
 * needed at all) are asked explicitly instead of defaulted silently, and a
 * failed connection is retried in place with the fix on screen rather than
 * printed as a red report after everything has already been written.
 */
export type WizardDeps = {
  prompt?: Prompt;
  /** Returns the number of nodes Proxmox reports, or throws. Injectable for tests. */
  probe?: (config: RuntimeConfig) => Promise<number>;
};

export const ask = async (options: SetupOptions, deps: WizardDeps = {}): Promise<WizardResult> => {
  const rl = deps.prompt ?? createInterface({ input, output });
  const probe = deps.probe ?? (async (config: RuntimeConfig) => (await new ProxmoxClient(config).listNodes()).length);

  try {
    output.write("\nThis takes about two minutes. Nothing is written until the end.\n");

    // 1. The credential, which lives outside this machine and is where most
    //    people stop.
    const hasToken = await askYesNo(
      rl,
      "Do you already have a Proxmox API token?",
      true,
      "The token is created inside Proxmox itself; npm cannot give you one."
    );

    if (!hasToken) {
      output.write(
        "\n  No problem. Open your Proxmox web UI, go to Datacenter -> Shell, and paste the\n" +
          "  block that `npx nandi-proxmox-mcp bootstrap` prints. It creates a dedicated user,\n" +
          "  grants it permissions and prints the token. Then run this setup again.\n\n"
      );
      rl.close();
      process.exitCode = 1;
      throw new Error("Setup needs an API token. Run `npx nandi-proxmox-mcp bootstrap` first.");
    }

    // 2. How much power to hand over. Asked first and defaulted to the safest
    //    option, because the server's own default is `full`.
    const accessTier =
      options.accessTier !== undefined
        ? parseTier(options.accessTier)
        : await askChoice<AccessTier>(
            rl,
            "How much should the AI be allowed to do?",
            [
              { value: "read-only", label: "look at everything, change nothing" },
              { value: "read-execute", label: "also start, stop and reboot guests" },
              { value: "full", label: "also create, delete and run commands inside containers" }
            ],
            "read-only"
          );

    // 3. Where Proxmox is.
    output.write("\nConnection\n");
    const proxmoxHost = await askText(rl, {
      question: "Proxmox address (IP or hostname)",
      help: "The same address you type in the browser, without https:// and without the port."
    });
    const proxmoxPort =
      parsePort(
        await askText(rl, { question: "Port", fallback: "8006", validate: (value) => (parsePort(value) ? undefined : "Not a valid port.") })
      ) ?? 8006;

    output.write("\nCredentials\n");
    const proxmoxUser = await askText(rl, {
      question: "User the token belongs to, without the realm",
      fallback: "mcp",
      help: "If you used `bootstrap`, this is `mcp`."
    });
    const proxmoxRealm = await askText(rl, {
      question: "Realm",
      fallback: "pve",
      help: "`pve` for users created inside Proxmox, `pam` for Linux system users like root."
    });
    const tokenName = await askText(rl, {
      question: "Token name",
      fallback: "nandi",
      help: "The short name shown in the token list, not the secret."
    });
    const tokenSecret = await askText(rl, {
      question: "Token secret",
      help: "The long UUID Proxmox showed once when the token was created.",
      validate: (value) => (value.length >= 10 ? undefined : "That looks too short to be the secret.")
    });

    const allowInsecureTls = await askYesNo(
      rl,
      "Accept a self-signed certificate?",
      false,
      "Proxmox self-signs by default. Answering yes disables certificate checking for this connection,\n  which is fine on a trusted network and wrong over the open internet."
    );

    // 4. SSH, gated. Most tools are REST and need none of this; making everyone
    //    solve the hardest prerequisite to use the easy 90% was the single
    //    biggest unnecessary blocker in the old flow.
    const wantsSsh = await askYesNo(
      rl,
      "Do you need to run commands inside containers?",
      false,
      "Only a handful of tools need SSH (`pct exec` and the Docker helpers). Everything else --\n  inventory, status, start/stop, backups, storage, networking -- works over the API without it."
    );

    let sshHost = proxmoxHost;
    let sshPort = 22;
    let sshUser = "root";
    let sshKeyPath = defaultSshKeyPath();

    if (wantsSsh) {
      output.write("\nSSH\n");
      sshHost = await askText(rl, {
        question: "SSH address",
        fallback: proxmoxHost,
        help: "Usually the same node. In a cluster, any member: the server finds the rest by itself."
      });
      sshPort =
        parsePort(
          await askText(rl, { question: "SSH port", fallback: "22", validate: (value) => (parsePort(value) ? undefined : "Not a valid port.") })
        ) ?? 22;
      sshUser = await askText(rl, { question: "SSH user", fallback: "root" });
      sshKeyPath = await askText(rl, {
        question: "Private key path",
        fallback: defaultSshKeyPath(),
        help: "The private half stays here and is never sent anywhere. Only its .pub goes on the node."
      });
    }

    const config = runtimeConfigSchema.parse({
      proxmoxHost,
      proxmoxPort,
      proxmoxUser,
      proxmoxRealm,
      tokenName,
      tokenSecret,
      allowInsecureTls,
      // The schema requires these even when unused, so they are filled with
      // harmless values; `sshStrategy: "disabled"` is what actually stops the
      // SSH tools from being reachable.
      sshHost,
      sshPort,
      sshUser,
      sshKeyPath,
      sshStrategy: wantsSsh ? "auto" : "disabled"
    });

    // 5. Prove it works before writing anything, and let them fix it here.
    const verified = await verifyInteractively(rl, config, probe);
    rl.close();

    return { config: verified, accessTier };
  } catch (error) {
    rl.close();
    throw error;
  }
};

/**
 * Tests the credentials and, on failure, offers to correct them on the spot.
 *
 * The old flow wrote every file and then printed a red report, leaving a broken
 * config on disk and no indication of which answer was wrong.
 */
const verifyInteractively = async (
  rl: Prompt,
  initial: RuntimeConfig,
  probe: (config: RuntimeConfig) => Promise<number>
): Promise<RuntimeConfig> => {
  let config = initial;
  const account = `${config.proxmoxUser}@${config.proxmoxRealm}`;

  for (;;) {
    output.write("\n  Checking the connection...\n");

    try {
      const nodes = await probe(config);
      output.write(`  Connected. Proxmox reports ${nodes} node(s).\n`);
      return config;
    } catch (error) {
      output.write(`\n  Could not connect.\n  ${summarizeProxmoxFailure(error, account, config.tokenName)}\n`);

      const next = await askChoice(
        rl,
        "What now?",
        [
          { value: "retry", label: "I fixed it on the Proxmox side, try again" },
          { value: "edit", label: "Re-enter the secret" },
          { value: "save", label: "Save anyway and sort it out later" }
        ],
        "retry"
      );

      if (next === "save") {
        return config;
      }

      if (next === "edit") {
        const tokenSecret = await askText(rl, {
          question: "Token secret",
          validate: (value) => (value.length >= 10 ? undefined : "That looks too short to be the secret.")
        });
        config = { ...config, tokenSecret };
      }
    }
  }
};

/**
 * Whether the caller supplied connection details, i.e. wants the scripted path.
 *
 * This used to ask whether *any* option was defined, which silently disabled
 * the interactive wizard entirely: commander fills in defaults for
 * `--proxmox-realm` and `--scope`, so the answer was always yes and a bare
 * `nandi-proxmox-mcp setup` -- the command the docs hand to newcomers -- failed
 * with "missing required options" instead of asking anything.
 *
 * Only the four values that carry actual connection data can imply that intent.
 */
export const hasCliOverrides = (options: SetupOptions): boolean =>
  [options.proxmoxHost, options.proxmoxUser, options.tokenName, options.tokenSecret].some(
    (value) => value !== undefined
  );

export const resolveSetupConfig = (options: SetupOptions): RuntimeConfig => {
  const proxmoxHost = options.proxmoxHost?.trim();
  const proxmoxUser = options.proxmoxUser?.trim();
  const tokenName = options.tokenName?.trim();
  const tokenSecret = options.tokenSecret?.trim();

  const missing: string[] = [];
  if (!proxmoxHost) missing.push("--proxmox-host");
  if (!proxmoxUser) missing.push("--proxmox-user");
  if (!tokenName) missing.push("--token-name");
  if (!tokenSecret) missing.push("--token-secret");

  if (missing.length > 0) {
    throw new Error(`Non-interactive setup is missing required options: ${missing.join(", ")}`);
  }

  return runtimeConfigSchema.parse({
    proxmoxHost,
    proxmoxPort: options.proxmoxPort ?? 8006,
    proxmoxUser,
    proxmoxRealm: options.proxmoxRealm?.trim() || "pve",
    tokenName,
    tokenSecret,
    allowInsecureTls: options.allowInsecureTls ?? false,
    sshHost: options.sshHost?.trim() || proxmoxHost,
    sshPort: options.sshPort ?? 22,
    sshUser: options.sshUser?.trim() || "root",
    sshKeyPath: options.sshKeyPath?.trim() || defaultSshKeyPath()
  });
};

const validatePrereqs = async (): Promise<ReportItem[]> => {
  const checks: ReportItem[] = [];
  checks.push({
    check: "Node.js",
    ok: Number(process.versions.node.split(".")[0]) >= 20,
    detail: `Detected ${process.versions.node}`
  });

  const npmUserAgent = process.env.npm_config_user_agent;
  if (npmUserAgent) {
    checks.push({
      check: "npm",
      ok: true,
      detail: npmUserAgent
    });
    return checks;
  }

  const npmCheck =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/c", "npm", "--version"], { encoding: "utf8" })
      : spawnSync("npm", ["--version"], { encoding: "utf8" });
  const npmProbeFailure = npmCheck.error as NodeJS.ErrnoException | undefined;
  const npmProbeError = npmProbeFailure?.message?.trim();
  const npmProbeRestricted = npmProbeFailure?.code === "EPERM" || npmProbeFailure?.code === "EINVAL";
  checks.push({
    check: "npm",
    ok: npmCheck.status === 0 || npmProbeRestricted,
    detail:
      npmCheck.status === 0
        ? `Detected npm ${npmCheck.stdout.trim()}`
        : npmProbeRestricted
          ? `npm probe skipped in restricted runtime (${npmProbeError})`
          : (npmCheck.stderr || npmProbeError || "npm not available").trim()
  });

  return checks;
};

/** Detects the legacy `{ mcp: { servers: ... } }` nesting VS Code used to write. */
const migrateLegacyVscodeShape = (doc: McpClientDocument): { doc: McpClientDocument; migrated: boolean } => {
  const legacy = doc.mcp;
  if (
    !("servers" in doc) &&
    typeof legacy === "object" &&
    legacy !== null &&
    typeof (legacy as { servers?: unknown }).servers === "object"
  ) {
    const { mcp: _mcp, ...rest } = doc;
    return { doc: { ...rest, servers: (legacy as { servers: unknown }).servers }, migrated: true };
  }

  return { doc, migrated: false };
};

const writeClientConfig = async (
  adapter: ClientAdapter,
  cwd: string,
  entry: McpServerEntry,
  serverKey: string
): Promise<{ path: string; migratedLegacy: boolean }> => {
  const targetPath = adapter.targetPath(cwd);
  await mkdir(dirname(targetPath), { recursive: true });

  let existingRaw: string | undefined;
  try {
    existingRaw = await readFile(targetPath, "utf8");
  } catch {
    existingRaw = undefined;
  }

  let doc: McpClientDocument | undefined;
  let migratedLegacy = false;

  if (existingRaw !== undefined && existingRaw.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(existingRaw);
    } catch (error) {
      // Never clobber a file we cannot parse: it very likely holds the user's
      // other MCP servers.
      throw new Error(
        `Refusing to overwrite ${targetPath}: it exists but is not valid JSON ` +
          `(${error instanceof Error ? error.message : "parse error"}). Fix or remove it, then re-run setup.`
      );
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Refusing to overwrite ${targetPath}: expected a JSON object at the root.`);
    }

    if (adapter.rootKey === "servers") {
      const migration = migrateLegacyVscodeShape(parsed as McpClientDocument);
      doc = migration.doc;
      migratedLegacy = migration.migrated;
    } else {
      doc = parsed as McpClientDocument;
    }
  }

  const merged = mergeServerEntry(doc, adapter.rootKey, entry, serverKey);

  const validation = validateForClient(adapter, merged, { serverKey });
  if (!validation.ok) {
    throw new Error(`Generated ${adapter.label} config failed validation: ${validation.errors.join(" | ")}`);
  }

  await writeFile(targetPath, serializeClientDocument(merged), "utf8");
  return { path: targetPath, migratedLegacy };
};

const connectivityChecks = async (config: RuntimeConfig): Promise<ReportItem[]> => {
  const client = new ProxmoxClient(config);
  const checks: ReportItem[] = [];

  try {
    const nodes = await client.listNodes();
    checks.push({
      check: "Proxmox API token connectivity",
      ok: true,
      detail: `Connected. Nodes discovered: ${nodes.length}`
    });
  } catch (error) {
    checks.push({
      check: "Proxmox API token connectivity",
      ok: false,
      detail: error instanceof Error ? error.message : "Unknown Proxmox connectivity error"
    });
  }

  if (config.sshStrategy === "disabled") {
    // Asked for and declined. Probing anyway would print a failure for a
    // capability the operator deliberately turned off.
    checks.push({
      check: "SSH batch (non-interactive)",
      ok: true,
      skipped: true,
      detail: "Turned off. Only the API tools are registered."
    });
    return checks;
  }

  try {
    const ssh = await runSshBatch(
      {
        host: config.sshHost,
        port: config.sshPort,
        user: config.sshUser,
        keyPath: config.sshKeyPath,
        timeoutMs: 12_000
      },
      "echo ssh-batch-ok"
    );

    const ok = ssh.exitCode === 0 && ssh.stdout.includes("ssh-batch-ok");
    checks.push({
      check: "SSH batch (non-interactive)",
      ok,
      detail: ok ? "Batch SSH command succeeded" : "Non-interactive SSH failed",
      fix: ok ? undefined : summarizeSshFailure(ssh.stderr)
    });
  } catch (error) {
    checks.push({
      check: "SSH batch (non-interactive)",
      ok: false,
      detail: error instanceof Error ? error.message : "Unknown SSH batch error",
      fix: "SSH is only needed for container command execution; re-run setup and answer no to turn it off."
    });
  }

  return checks;
};

/**
 * Turns ssh's multi-line failures into one actionable line.
 *
 * A changed host key prints a 15-line banner that tells a non-expert nothing
 * about what to do; it happens whenever a node is reinstalled or its key
 * rotates, which is common enough to be worth handling explicitly.
 */
export const summarizeSshFailure = (stderr: string): string => {
  const text = stderr.trim();
  const lower = text.toLowerCase();

  if (lower.includes("host key verification failed") || lower.includes("remote host identification has changed")) {
    return (
      "The node's SSH host key changed since you last connected (common after a reinstall). " +
      'Remove the stale entry with: ssh-keygen -R "<host>" (add :port if not 22), then re-run setup.'
    );
  }

  if (lower.includes("permission denied")) {
    return (
      "SSH rejected the key. Make sure the public key is in /root/.ssh/authorized_keys on the node " +
      "(in a cluster that file is shared across all nodes) and that the private key path is correct."
    );
  }

  if (lower.includes("connection refused")) {
    return "Nothing is listening on the SSH port. Check the host and port, and that sshd is running.";
  }

  if (lower.includes("connection timed out") || lower.includes("operation timed out")) {
    return "SSH timed out. If the node is only reachable over a VPN, confirm the tunnel is up.";
  }

  return text.split("\n")[0] ?? "SSH command failed";
};

/**
 * The API-side twin of `summarizeSshFailure`.
 *
 * The 401 case is the one that matters. Proxmox returns it both for a wrong
 * secret and for a token created with privilege separation left on -- the web
 * UI's default -- and those need opposite fixes. A token with `privsep 1`
 * starts with no permissions at all, so a perfectly correct user, role and
 * secret still fails, and the operator reasonably concludes they mistyped the
 * secret and retypes it forever.
 */
export const summarizeProxmoxFailure = (error: unknown, account: string, tokenName: string): string => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "";

  if (message.includes("401") || code === "PROXMOX_AUTH_FAILED") {
    return (
      "Proxmox rejected the credentials. Two different causes look identical here: " +
      "the secret is wrong, or the token was created with privilege separation on (the web UI default), " +
      `which gives it no permissions at all. Rule the second one out with: pveum user token modify ${account} ${tokenName} --privsep 0`
    );
  }

  if (message.includes("403") || code === "PROXMOX_ACL_FORBIDDEN") {
    return `The token authenticated but lacks permissions. Grant them with: pveum acl modify / --users ${account} --roles PVEAuditor`;
  }

  if (code === "TLS_ERROR" || message.includes("self-signed") || message.includes("certificate")) {
    return "Proxmox self-signs its certificate by default. Answer yes to the insecure-TLS question, or install the cluster CA on this machine.";
  }

  if (code === "DNS_RESOLUTION_FAILED" || message.includes("getaddrinfo")) {
    return "That hostname does not resolve. Check the spelling, or connect the VPN if the name only exists inside it.";
  }

  if (code === "HOST_UNREACHABLE" || code === "TIMEOUT" || message.includes("timed out")) {
    return "No route to the host. Over a VPN this almost always means the tunnel, not Proxmox.";
  }

  if (code === "CONNECTION_REFUSED" || message.includes("econnrefused")) {
    return "The host answered but nothing is listening on that port. Proxmox uses 8006 by default.";
  }

  if (code === "PROXMOX_INVALID_RESPONSE") {
    return "Something that is not the Proxmox API replied -- usually a reverse proxy or a login page. Check the host and port.";
  }

  return error instanceof Error ? error.message : "Unknown error contacting Proxmox";
};

export type Discovery = {
  topology?: ClusterTopology;
  /** Which node `sshHost` is, asked of the node itself. */
  sshNodeName?: string;
  report: ReportItem[];
};

/**
 * Learns the shape of the installation instead of asking the operator for it.
 *
 * `/cluster/status` tells us whether this is a cluster or a standalone node,
 * what the cluster is called, and who the members are. Asking the entry node
 * its own hostname over SSH tells us which node we are connected to, which is
 * what lets the router skip routing for guests that already live there.
 */
const discoverInstallation = async (config: RuntimeConfig): Promise<Discovery> => {
  const report: ReportItem[] = [];
  const client = new ProxmoxClient(config);
  let topology: ClusterTopology | undefined;
  let sshNodeName: string | undefined;

  try {
    topology = await readClusterTopology(client);
    report.push({
      check: "Installation type",
      ok: true,
      detail: topology.isCluster
        ? `Cluster "${topology.clusterName ?? "unnamed"}" with ${topology.nodes.length} node(s)` +
          `${topology.quorate === false ? " - WARNING: cluster has no quorum" : ""}`
        : "Standalone Proxmox node (not part of a cluster)"
    });

    if (topology.nodes.length > 0) {
      report.push({
        check: "Nodes discovered",
        ok: true,
        detail: topology.nodes.map((node) => `${node.name}${node.online ? "" : " (offline)"}`).join(", ")
      });
    }
  } catch (error) {
    report.push({
      check: "Installation type",
      ok: false,
      detail: error instanceof Error ? error.message : "Could not read cluster status"
    });
  }

  if (config.sshStrategy === "disabled") {
    // Node routing only matters for SSH-backed tools; the REST API already
    // reaches the whole cluster from any node.
    return { topology, report };
  }

  try {
    // `hostname -s` gives the short name, which is what Proxmox uses as the
    // node name. The FQDN form would not match the cluster's node list.
    const result = await runSshBatch(
      { host: config.sshHost, port: config.sshPort, user: config.sshUser, keyPath: config.sshKeyPath, timeoutMs: 15_000 },
      "hostname -s"
    );

    if (result.exitCode === 0) {
      const detected = result.stdout.trim().split(/\s+/)[0];
      const knownNodes = topology?.nodes.map((node) => node.name) ?? [];

      if (detected && (knownNodes.length === 0 || knownNodes.includes(detected))) {
        sshNodeName = detected;
        report.push({ check: "SSH entry node", ok: true, detail: `Connected to node "${detected}"` });
      } else if (detected) {
        // Never record a name the cluster does not know: a wrong value would
        // make the router treat a remote node as local and fail confusingly.
        report.push({
          check: "SSH entry node",
          ok: false,
          detail:
            `SSH reports hostname "${detected}", which is not one of the cluster nodes ` +
            `(${knownNodes.join(", ")}). Check that sshHost points at a Proxmox node. ` +
            "Node routing will fall back to address matching."
        });
      }
    } else {
      report.push({ check: "SSH entry node", ok: false, detail: summarizeSshFailure(result.stderr) });
    }
  } catch (error) {
    report.push({
      check: "SSH entry node",
      ok: false,
      detail: error instanceof Error ? error.message : "SSH unavailable"
    });
  }

  // Containers on other nodes are reached either directly or by hopping from
  // the entry node, so tell the operator which nodes are directly reachable.
  if (topology && topology.nodes.length > 1 && sshNodeName) {
    const others = topology.nodes.filter((node) => node.name !== sshNodeName);
    const results = await Promise.all(
      others.map(async (node) => {
        const address = config.sshNodes?.[node.name]?.host ?? node.ip ?? node.name;
        try {
          const probe = await runSshBatch(
            {
              host: address,
              port: config.sshNodes?.[node.name]?.port ?? config.sshPort,
              user: config.sshNodes?.[node.name]?.user ?? config.sshUser,
              keyPath: config.sshKeyPath,
              timeoutMs: 10_000
            },
            "hostname"
          );
          return { node: node.name, direct: probe.exitCode === 0, address };
        } catch {
          return { node: node.name, direct: false, address };
        }
      })
    );

    for (const entry of results) {
      report.push({
        check: `Node ${entry.node}`,
        ok: true,
        detail: entry.direct
          ? `Reachable directly at ${entry.address}`
          : `Not reachable directly at ${entry.address}; commands will hop through ${sshNodeName}`
      });
    }
  }

  return { topology, sshNodeName, report };
};

export const runSetup = async (options: SetupOptions = {}): Promise<void> => {
  // Validate up front so a typo fails fast on every path, including
  // --print-config, rather than being silently ignored.
  const selectedClients: ClientId[] = options.clients ? parseClientIds(options.clients) : defaultClientIds;
  const scope: InstanceScope = options.scope === "user" ? "user" : "project";

  // --print-config is a read-only helper: it emits a paste-ready block for any
  // MCP client and touches nothing on disk, so it is safe to pipe.
  if (options.printConfig) {
    const previewName = options.name ? sanitizeInstanceName(options.name) : DEFAULT_INSTANCE_NAME;
    const preview = instanceRef(previewName, scope, process.cwd());
    const entry = buildServerEntry(preview.configPath, {
      accessTier: options.accessTier,
      moduleMode: options.moduleMode
    });
    process.stdout.write(renderGenericConfig(entry, preview.serverKey));
    return;
  }

  process.stdout.write("nandi-proxmox-mcp setup\n");
  process.stdout.write("The API token is NOT provided by npm or MCP. You must create it in your own Proxmox server.\n\n");

  const prereq = await validatePrereqs();
  printReport("Prerequisites", prereq);

  const scripted = hasCliOverrides(options);
  const wizard = scripted ? undefined : await ask(options);
  let config = wizard?.config ?? resolveSetupConfig(options);

  // The wizard asks for the tier explicitly, so it is only implicit on the
  // scripted path.
  const accessTier = options.accessTier ?? wizard?.accessTier;

  // Discovery has to happen before anything is written: it decides the default
  // instance name and fills in which node we are connected to.
  let discovery: Discovery = { report: [] };
  if (!options.skipConnectivity) {
    discovery = await discoverInstallation(config);
    printReport("Discovered installation", discovery.report);

    if (discovery.sshNodeName) {
      config = { ...config, sshNodeName: discovery.sshNodeName };
    }
  }

  const instanceName = options.name
    ? sanitizeInstanceName(options.name)
    : discovery.topology?.clusterName
      ? sanitizeInstanceName(discovery.topology.clusterName)
      : discovery.sshNodeName
        ? sanitizeInstanceName(discovery.sshNodeName)
        : DEFAULT_INSTANCE_NAME;

  const instance = instanceRef(instanceName, scope, process.cwd());

  await mkdir(dirname(instance.configPath), { recursive: true });
  await writeFile(instance.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const entry = buildServerEntry(instance.configPath, {
    accessTier,
    moduleMode: options.moduleMode
  });

  const clientIdsToWrite = selectedClients;
  const written: string[] = [];

  for (const clientId of clientIdsToWrite) {
    const adapter = clientAdapters[clientId];
    const result = await writeClientConfig(adapter, process.cwd(), entry, instance.serverKey);
    written.push(`${adapter.label}: ${result.path}`);

    if (result.migratedLegacy) {
      process.stdout.write(`Migrated legacy \`${adapter.relativePath}\` format to root \`servers\` format.\n`);
    }
  }

  const connectivity = options.skipConnectivity
    ? [{ check: "Connectivity", ok: true, detail: "Skipped by --skip-connectivity" }]
    : await connectivityChecks(config);
  printReport("Connectivity", connectivity);

  const allOk = [...prereq, ...connectivity].every((item) => item.ok);
  process.stdout.write(`\nFinal status: ${allOk ? "GREEN" : "RED"}\n`);
  process.stdout.write(`\nInstance name: ${instance.name}  (tools appear with this prefix)\n`);
  process.stdout.write(`Credentials stored at: ${instance.configPath}\n`);

  process.stdout.write("\nClient configs written:\n");
  for (const line of written) {
    process.stdout.write(`  ${line}\n`);
  }

  for (const clientId of clientIdsToWrite) {
    const note = clientAdapters[clientId].note;
    if (note) {
      process.stdout.write(`\nNote (${clientAdapters[clientId].label}): ${note}\n`);
    }
  }

  // Only reachable on the scripted path now: the wizard always asks.
  if (!accessTier) {
    process.stdout.write(
      "\nWarning: no --access-tier given, so the server default (`full`) applies and every\n" +
        "destructive tool is exposed. Re-run with --access-tier read-only to start restricted.\n"
    );
  } else {
    process.stdout.write(`Access tier: ${accessTier}\n`);
  }

  if (config.sshStrategy === "disabled") {
    process.stdout.write(
      "SSH: off. The API tools all work; re-run setup if you later want to run commands inside containers.\n"
    );
  }

  process.stdout.write("\nNext steps:\n");
  process.stdout.write("1. Restart your MCP client so it picks up the new server.\n");
  process.stdout.write(`2. Ask it: "list my Proxmox nodes". That is the whole test.\n`);
  process.stdout.write(`3. If it cannot, run \`nandi-proxmox-mcp doctor --name ${instance.name}\`.\n`);
  process.stdout.write("4. For any other client, run `nandi-proxmox-mcp setup --print-config`.\n");
  process.stdout.write(
    "\nHave another Proxmox? Run setup again with a different --name. Each one gets its own\n" +
      "credentials file and its own server entry, so they stay completely separate.\n"
  );
};
