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

const ask = async (): Promise<RuntimeConfig> => {
  const rl = createInterface({ input, output });

  const proxmoxHost = (await rl.question("Proxmox host (IP/FQDN): ")).trim();
  const proxmoxPort = Number.parseInt((await rl.question("Proxmox port [8006]: ")).trim() || "8006", 10);
  const proxmoxUser = (await rl.question("Proxmox user (without realm, e.g. svc_mcp): ")).trim();
  const proxmoxRealm = (await rl.question("Proxmox realm [pve]: ")).trim() || "pve";
  const tokenName = (await rl.question("API token name (e.g. nandi-mcp): ")).trim();
  const tokenSecret = (await rl.question("API token secret: ")).trim();
  const allowInsecureTls = ((await rl.question("Allow insecure TLS for self-signed cert? [no]: ")).trim() || "no")
    .toLowerCase()
    .startsWith("y");
  const sshHost = (await rl.question("SSH host [same as Proxmox host]: ")).trim() || proxmoxHost;
  const sshPort = Number.parseInt((await rl.question("SSH port [22]: ")).trim() || "22", 10);
  const sshUser = (await rl.question("SSH user [root]: ")).trim() || "root";
  const sshKeyPath =
    (await rl.question("SSH private key path [~/.ssh/id_ed25519]: ")).trim() ||
    defaultSshKeyPath();

  rl.close();

  return runtimeConfigSchema.parse({
    proxmoxHost,
    proxmoxPort,
    proxmoxUser,
    proxmoxRealm,
    tokenName,
    tokenSecret,
    allowInsecureTls,
    sshHost,
    sshPort,
    sshUser,
    sshKeyPath
  });
};

const hasCliOverrides = (options: SetupOptions): boolean =>
  Object.entries(options).some(([key, value]) => key !== "skipConnectivity" && value !== undefined);

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

    checks.push({
      check: "SSH batch (non-interactive)",
      ok: ssh.exitCode === 0 && ssh.stdout.includes("ssh-batch-ok"),
      detail: ssh.exitCode === 0 ? "Batch SSH command succeeded" : ssh.stderr.trim()
    });
  } catch (error) {
    checks.push({
      check: "SSH batch (non-interactive)",
      ok: false,
      detail: error instanceof Error ? error.message : "Unknown SSH batch error"
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

  let config = hasCliOverrides(options) ? resolveSetupConfig(options) : await ask();

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
    accessTier: options.accessTier,
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

  if (!options.accessTier) {
    process.stdout.write(
      "\nWarning: no --access-tier given, so the server default (`full`) applies and every\n" +
        "destructive tool is exposed. Re-run with --access-tier read-only to start restricted.\n"
    );
  }

  process.stdout.write("\nNext steps:\n");
  process.stdout.write("1. Restart your MCP client so it picks up the new server.\n");
  process.stdout.write(`2. Run \`nandi-proxmox-mcp doctor --name ${instance.name}\`.\n`);
  process.stdout.write("3. For any other client, run `nandi-proxmox-mcp setup --print-config`.\n");
  process.stdout.write(
    "\nHave another Proxmox? Run setup again with a different --name. Each one gets its own\n" +
      "credentials file and its own server entry, so they stay completely separate.\n"
  );
};
