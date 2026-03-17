import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadFileConfig } from "../config/fileConfig.js";
import { ProxmoxClient } from "../proxmox/client.js";
import { printReport, type ReportItem } from "./report.js";
import { runSshBatch } from "../ssh/sshClient.js";
import { pctExec } from "../ssh/pctExec.js";
import { normalizeMcpConfigDocument, validateMcpConfig, validateMcpManifest } from "../config/installDescriptor.js";

const parseRequestedChecks = (value?: string): Set<string> => {
  if (!value) {
    return new Set(["mcp-config", "nodes", "vms", "cts", "node-status", "remote-op"]);
  }

  return new Set(value.split(",").map((segment) => segment.trim()).filter(Boolean));
};

export const runDoctor = async (checksArg?: string): Promise<void> => {
  const checks = parseRequestedChecks(checksArg);
  const report: ReportItem[] = [];
  const config = await loadFileConfig();
  const client = new ProxmoxClient(config);

  let firstNode = "";

  if (checks.has("mcp-config")) {
    try {
      const mcpPath = resolve(process.cwd(), ".vscode", "mcp.json");
      const manifestPath = resolve(process.cwd(), "mcp-manifest.json");
      const mcpRaw = await readFile(mcpPath, "utf8");
      const normalized = normalizeMcpConfigDocument(mcpRaw);
      const configValidation = validateMcpConfig(normalized.normalized);
      if (!configValidation.ok) {
        throw new Error(configValidation.errors.join(" | "));
      }

      const manifestRaw = await readFile(manifestPath, "utf8");
      const manifestValidation = validateMcpManifest(JSON.parse(manifestRaw) as unknown);
      if (!manifestValidation.ok) {
        throw new Error(`Manifest invalid: ${manifestValidation.errors.join(" | ")}`);
      }

      report.push({ check: "mcpConfig", ok: true, detail: "MCP config and manifest are valid" });
    } catch (error) {
      report.push({ check: "mcpConfig", ok: false, detail: error instanceof Error ? error.message : "Unknown error" });
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
        throw new Error(`SSH batch failed. Interactive may still work. stderr=${sshRes.stderr.trim()}`);
      }

      report.push({ check: "sshBatch", ok: true, detail: "Batch SSH succeeded" });
    } catch (error) {
      report.push({ check: "sshBatch", ok: false, detail: error instanceof Error ? error.message : "Unknown error" });
    }

    const ctid = Number.parseInt(process.env.NANDI_DOCTOR_CTID ?? "0", 10);
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
      report.push({
        check: "pctExec",
        ok: false,
        detail: "Set NANDI_DOCTOR_CTID environment variable to validate CT remote operation"
      });
    }
  }

  printReport("Doctor report", report);
};
