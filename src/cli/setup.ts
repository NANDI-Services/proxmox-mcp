import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawnSync } from "node:child_process";
import { ProxmoxClient } from "../proxmox/client.js";
import type { RuntimeConfig } from "../config/validate.js";
import { runtimeConfigSchema } from "../config/validate.js";
import { printReport, type ReportItem } from "./report.js";
import { runSshBatch } from "../ssh/sshClient.js";
import {
  buildWorkspaceMcpConfig,
  normalizeMcpConfigDocument,
  validateMcpConfig,
  type McpConfigFile
} from "../config/installDescriptor.js";

const defaultConfigDir = resolve(process.cwd(), ".nandi-proxmox-mcp");
const defaultConfigPath = resolve(defaultConfigDir, "config.json");

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

const writeVscodeConfig = async (): Promise<void> => {
  const vscodeDir = resolve(process.cwd(), ".vscode");
  await mkdir(vscodeDir, { recursive: true });

  const mcpPath = resolve(vscodeDir, "mcp.json");
  const resolvedConfigPath = resolve(process.cwd(), ".nandi-proxmox-mcp", "config.json");

  let config: McpConfigFile = buildWorkspaceMcpConfig(resolvedConfigPath);
  let migratedLegacy = false;

  try {
    const existing = await readFile(mcpPath, "utf8");
    const normalized = normalizeMcpConfigDocument(existing);
    config = normalized.normalized;
    migratedLegacy = normalized.migratedLegacy;
  } catch {
    // No previous config or invalid JSON, fall back to generated structure.
  }

  config.servers["nandi-proxmox-mcp"] = {
    command: "npx",
    args: ["nandi-proxmox-mcp", "run"],
    env: {
      NANDI_PROXMOX_CONFIG: resolvedConfigPath
    }
  };

  const validation = validateMcpConfig(config);
  if (!validation.ok) {
    throw new Error(`Generated MCP config failed validation: ${validation.errors.join(" | ")}`);
  }

  await writeFile(mcpPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  if (migratedLegacy) {
    process.stdout.write("Migrated legacy `.vscode/mcp.json` format to root `servers` format.\n");
  }
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

export const runSetup = async (options: SetupOptions = {}): Promise<void> => {
  process.stdout.write("nandi-proxmox-mcp setup wizard\n");
  process.stdout.write("The API token is NOT provided by npm or MCP. You must create it in your own Proxmox server.\n\n");

  const prereq = await validatePrereqs();
  printReport("Prerequisites", prereq);

  const config = hasCliOverrides(options) ? resolveSetupConfig(options) : await ask();
  await mkdir(defaultConfigDir, { recursive: true });
  await writeFile(defaultConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await writeVscodeConfig();

  const connectivity = options.skipConnectivity
    ? [{ check: "Connectivity", ok: true, detail: "Skipped by --skip-connectivity" }]
    : await connectivityChecks(config);
  printReport("Connectivity", connectivity);

  const allOk = [...prereq, ...connectivity].every((item) => item.ok);
  process.stdout.write(`\nFinal status: ${allOk ? "GREEN" : "RED"}\n`);
  process.stdout.write(`Local config created at: ${defaultConfigPath}\n`);
  process.stdout.write("\nNext steps for VS Code/Codex:\n");
  process.stdout.write("1. Open MCP settings and verify `nandi-proxmox-mcp` appears.\n");
  process.stdout.write("2. If needed, use `.vscode/mcp.json` generated by setup as your custom server source.\n");
  process.stdout.write("3. Run `nandi-proxmox-mcp doctor --check mcp-config,nodes,vms,cts,node-status,remote-op`.\n");
};
