import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadFileConfig } from "../config/fileConfig.js";
import { ProxmoxClient } from "../proxmox/client.js";
import { hasFailure, printReport, type ReportItem } from "./report.js";
import { runSshBatch } from "../ssh/sshClient.js";
import { pctExec } from "../ssh/pctExec.js";
import { validateMcpManifest } from "../config/installDescriptor.js";
import { clientAdapters, defaultClientIds, parseClientIds, validateForClient } from "../config/clients.js";
import { resolveInstanceByName } from "../config/instances.js";
import { summarizeSshFailure } from "./setup.js";

const parseRequestedChecks = (value?: string): Set<string> => {
  if (!value) {
    return new Set(["mcp-config", "nodes", "vms", "cts", "node-status", "remote-op"]);
  }

  return new Set(value.split(",").map((segment) => segment.trim()).filter(Boolean));
};

export type DoctorOptions = {
  check?: string;
  ctid?: number;
  /** Restrict the mcp-config check to specific clients. */
  clients?: string;
  /** Which configured Proxmox instance to check. */
  name?: string;
};

export const runDoctor = async (options: DoctorOptions = {}): Promise<void> => {
  const checksArg = options.check;
  const checks = parseRequestedChecks(checksArg);
  const report: ReportItem[] = [];
  // --name selects one of several configured Proxmox connections; without it we
  // fall back to NANDI_PROXMOX_CONFIG or the default path.
  const instance = options.name ? await resolveInstanceByName(options.name, process.cwd()) : undefined;
  const config = await loadFileConfig(instance?.configPath);
  const client = new ProxmoxClient(config);

  if (instance) {
    report.push({ check: "instance", ok: true, detail: `${instance.name} (${instance.configPath})` });
  }

  let firstNode = "";

  if (checks.has("mcp-config")) {
    const requestedClients = options.clients ? parseClientIds(options.clients) : defaultClientIds;
    let found = 0;

    for (const clientId of requestedClients) {
      const adapter = clientAdapters[clientId];
      const targetPath = adapter.targetPath(process.cwd());

      let raw: string;
      try {
        raw = await readFile(targetPath, "utf8");
      } catch {
        // A client the user does not use is not an error.
        continue;
      }

      found += 1;

      try {
        const parsed = JSON.parse(raw) as unknown;
        // Reading a user's file: accept any working launcher, warn on unusual
        // ones rather than failing a setup that runs fine.
        const validation = validateForClient(adapter, parsed, {
          strictLauncher: false,
          serverKey: instance?.serverKey
        });
        if (!validation.ok) {
          throw new Error(validation.errors.join(" | "));
        }

        const detail =
          validation.warnings.length > 0
            ? `${adapter.relativePath} valid (${validation.warnings.join(" | ")})`
            : `${adapter.relativePath} valid`;
        report.push({ check: `mcpConfig:${adapter.id}`, ok: true, detail });
      } catch (error) {
        report.push({
          check: `mcpConfig:${adapter.id}`,
          ok: false,
          detail: `${targetPath}: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
    }

    if (found === 0) {
      report.push({
        check: "mcpConfig",
        ok: false,
        detail: `No client config found (looked for ${requestedClients
          .map((id) => clientAdapters[id].relativePath)
          .join(", ")}). Run \`nandi-proxmox-mcp setup\`.`
      });
    }

    // The published manifest only exists inside the package itself, so its
    // absence in a user's project is expected, not a failure.
    const manifestPath = resolve(process.cwd(), "mcp-manifest.json");
    try {
      const manifestRaw = await readFile(manifestPath, "utf8");
      const manifestValidation = validateMcpManifest(JSON.parse(manifestRaw) as unknown);
      report.push({
        check: "mcpManifest",
        ok: manifestValidation.ok,
        detail: manifestValidation.ok ? "Manifest is valid" : manifestValidation.errors.join(" | ")
      });
    } catch {
      // Not present: nothing to validate.
    }
  }

  if (checks.has("nodes")) {
    try {
      const nodes = await client.listNodes();
      firstNode = nodes[0]?.node ?? "";
      report.push({ check: "listNodes", ok: true, detail: `Found ${nodes.length} nodes` });
    } catch (error) {
      report.push({
        check: "listNodes",
        ok: false,
        detail: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  if (checks.has("vms") && firstNode) {
    try {
      const vms = await client.listVms(firstNode);
      report.push({ check: "listVMs", ok: true, detail: `Found ${vms.length} VMs on ${firstNode}` });
    } catch (error) {
      report.push({ check: "listVMs", ok: false, detail: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  if (checks.has("cts") && firstNode) {
    try {
      const cts = await client.listContainers(firstNode);
      report.push({ check: "listContainers", ok: true, detail: `Found ${cts.length} CTs on ${firstNode}` });
    } catch (error) {
      report.push({ check: "listContainers", ok: false, detail: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  if (checks.has("node-status") && firstNode) {
    try {
      const status = await client.getNodeStatus(firstNode);
      const keyCount = Object.keys(status).length;
      report.push({ check: "getNodeStatus", ok: true, detail: `Status keys: ${keyCount}` });
    } catch (error) {
      report.push({ check: "getNodeStatus", ok: false, detail: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  if (checks.has("remote-op")) {
    try {
      const sshRes = await runSshBatch(
        {
          host: config.sshHost,
          port: config.sshPort,
          user: config.sshUser,
          keyPath: config.sshKeyPath,
          timeoutMs: 15_000
        },
        "echo ssh-batch-ok"
      );

      if (sshRes.exitCode !== 0) {
        // ssh's own output is up to fifteen lines of banner; summarize it into
        // the one line that says what to do.
        report.push({
          check: "sshBatch",
          ok: false,
          detail: "Non-interactive SSH failed (interactive may still work).",
          fix: summarizeSshFailure(sshRes.stderr)
        });
      } else {
        report.push({ check: "sshBatch", ok: true, detail: "Batch SSH succeeded" });
      }
    } catch (error) {
      report.push({
        check: "sshBatch",
        ok: false,
        detail: error instanceof Error ? error.message : "Unknown error",
        fix: "SSH is only needed for container command execution. Set \"sshStrategy\": \"disabled\" in the config file to turn it off."
      });
    }

    const ctid = options.ctid ?? Number.parseInt(process.env.NANDI_DOCTOR_CTID ?? "0", 10);
    if (Number.isFinite(ctid) && ctid > 0) {
      try {
        await pctExec(
          {
            host: config.sshHost,
            port: config.sshPort,
            user: config.sshUser,
            keyPath: config.sshKeyPath,
            timeoutMs: 20_000
          },
          ctid,
          "echo ct-remote-ok"
        );

        report.push({ check: "pctExec", ok: true, detail: `pct exec succeeded for CT ${ctid}` });
      } catch (error) {
        report.push({ check: "pctExec", ok: false, detail: error instanceof Error ? error.message : "Unknown error" });
      }
    } else {
      // Not requested, so not run. It used to be reported as a failure, which
      // made a clean install look broken to anyone who had not opted into it.
      report.push({
        check: "pctExec",
        ok: true,
        skipped: true,
        detail: "Not checked. Pass --ctid <id> to try `pct exec` inside a real container."
      });
    }
  }

  printReport("Doctor report", report);

  if (hasFailure(report)) {
    process.stdout.write("\nSomething above is RED. `docs/EMPEZAR.md` lists the usual causes.\n");
    return;
  }

  process.stdout.write("\nAll good. Restart your MCP client and ask it to list your Proxmox nodes.\n");
};
