import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ProxmoxClient } from "../proxmox/client.js";
import type { RuntimeConfig } from "../config/validate.js";
import { runtimeConfigSchema } from "../config/validate.js";
import { printReport, type ReportItem } from "./report.js";
import { runSshBatch } from "../ssh/sshClient.js";

const defaultConfigDir = resolve(process.cwd(), ".nandi-proxmox-mcp");
const defaultConfigPath = resolve(defaultConfigDir, "config.json");

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
    resolve(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".ssh", "id_ed25519");

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

const validatePrereqs = async (): Promise<ReportItem[]> => {
  const checks: ReportItem[] = [];
  checks.push({
    check: "Node.js",
    ok: Number(process.versions.node.split(".")[0]) >= 20,
    detail: `Detected ${process.versions.node}`
  });

  const npmUserAgent = process.env.npm_config_user_agent;
  checks.push({
    check: "npm",
    ok: Boolean(npmUserAgent),
    detail: npmUserAgent ?? "npm user agent not detected"
  });

  return checks;
};

const writeVscodeConfig = async (): Promise<void> => {
  const vscodeDir = resolve(process.cwd(), ".vscode");
  await mkdir(vscodeDir, { recursive: true });

  const templatePath = resolve(process.cwd(), "templates", "vscode.mcp.template.json");
  const template = await readFile(templatePath, "utf8");
  const resolvedConfigPath = resolve(process.cwd(), ".nandi-proxmox-mcp", "config.json").replace(/\\/g, "\\\\");
  const rendered = template.replace("__LOCAL_CONFIG_PATH__", resolvedConfigPath);

  await writeFile(resolve(vscodeDir, "mcp.json"), rendered, "utf8");
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

export const runSetup = async (): Promise<void> => {
  process.stdout.write("nandi-proxmox-mcp setup wizard\n");
  process.stdout.write("The API token is NOT provided by npm or MCP. You must create it in your own Proxmox server.\n\n");

  const prereq = await validatePrereqs();
  printReport("Prerequisites", prereq);

  const config = await ask();
  await mkdir(defaultConfigDir, { recursive: true });
  await writeFile(defaultConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await writeVscodeConfig();

  const connectivity = await connectivityChecks(config);
  printReport("Connectivity", connectivity);

  const allOk = [...prereq, ...connectivity].every((item) => item.ok);
  process.stdout.write(`\nFinal status: ${allOk ? "GREEN" : "RED"}\n`);
  process.stdout.write(`Local config created at: ${defaultConfigPath}\n`);
};
