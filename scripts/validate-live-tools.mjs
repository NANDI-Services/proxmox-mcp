import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const distCatalog = await import(`file://${resolve(root, "dist/src/tools/catalog.js").replaceAll("\\", "/")}`);
const distClient = await import(`file://${resolve(root, "dist/src/proxmox/client.js").replaceAll("\\", "/")}`);
const distPolicy = await import(`file://${resolve(root, "dist/src/server/policy.js").replaceAll("\\", "/")}`);

const configPath = resolve(root, ".nandi-proxmox-mcp/config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const client = new distClient.ProxmoxClient(config);
const policy = new distPolicy.PolicyEngine({
  accessTier: "full",
  categoryAllowlist: [],
  toolBlacklist: [],
  toolWhitelist: [],
  moduleMode: "advanced"
});

const nodes = await client.requestEndpoint({ id: "nodes.list", method: "GET", path: "/api2/json/nodes" }, {});
const firstNode = nodes?.[0]?.node ?? "PROXMOX";
const vms = await client.requestEndpoint({ id: "qemu.list", method: "GET", path: "/api2/json/nodes/{node}/qemu", pathParams: ["node"] }, { node: firstNode });
const cts = await client.requestEndpoint({ id: "lxc.list", method: "GET", path: "/api2/json/nodes/{node}/lxc", pathParams: ["node"] }, { node: firstNode });
const storages = await client.requestEndpoint({ id: "storage.list", method: "GET", path: "/api2/json/storage" }, {});
const nodeStorages = await client.requestEndpoint(
  { id: "storage.node.list", method: "GET", path: "/api2/json/nodes/{node}/storage", pathParams: ["node"] },
  { node: firstNode }
);
const tasks = await client.requestEndpoint({ id: "tasks.list", method: "GET", path: "/api2/json/nodes/{node}/tasks", pathParams: ["node"] }, { node: firstNode });
const pools = await client.requestEndpoint({ id: "pools.list", method: "GET", path: "/api2/json/pools" }, {});
const users = await client.requestEndpoint({ id: "users.list", method: "GET", path: "/api2/json/access/users" }, {});
const networks = await client.requestEndpoint(
  { id: "net.list", method: "GET", path: "/api2/json/nodes/{node}/network", pathParams: ["node"] },
  { node: firstNode }
);

const firstVm = vms?.[0];
const firstCt = cts?.[0];
const firstStorage = nodeStorages?.find((item) => item?.storage && (item?.active === 1 || item?.enabled === 1)) ?? storages?.[0];
const firstTask = tasks?.[0];
const firstPool = pools?.[0];
const firstUser = users?.[0];
const firstNet = networks?.[0];
const backupJobs = await client.requestEndpoint({ id: "backup.jobs", method: "GET", path: "/api2/json/cluster/backup" }, {});
const firstBackupJob = backupJobs?.[0];

const canSafelyExecute = (tool) => {
  if (tool.confirmRequired || tool.destructive) {
    return false;
  }
  if (tool.idempotent !== true) {
    return false;
  }
  return true;
};

const qemuVmid = firstVm?.vmid;
const lxcVmid = firstCt?.vmid;

const buildArgs = (tool) => {
  const byNameVmid = tool.name.includes("_lxc_") || tool.name.includes("_container") ? lxcVmid : qemuVmid;
  const baseArgs = {
    node: firstNode,
    vmid: byNameVmid,
    ctid: firstCt?.vmid ?? 124,
    storage: firstStorage?.storage,
    upid: firstTask?.upid,
    id: firstBackupJob?.id,
    iface: firstNet?.iface,
    poolid: firstPool?.poolid,
    userid: firstUser?.userid ?? "root@pam",
    guest_type: "qemu",
    command: "uptime",
    tokenid: "mcp-live-validation",
    containerName: "nonexistent"
  };

  const args = {};
  for (const key of Object.keys(tool.inputShape)) {
    if (key in baseArgs) {
      const value = baseArgs[key];
      if (value !== undefined) {
        args[key] = value;
      }
    }
  }

  return args;
};

const report = {
  timestamp: new Date().toISOString(),
  cluster: { nodes: nodes.length, vms: vms.length, cts: cts.length },
  totals: { catalog: distCatalog.toolCatalog.length, attempted: 0, passed: 0, failed: 0, skipped: 0, guarded: 0 },
  entries: []
};

for (const tool of distCatalog.toolCatalog) {
  if (!policy.shouldRegister(tool, "stdio")) {
    report.entries.push({ tool: tool.name, status: "skipped", reason: "policy_filtered" });
    report.totals.skipped += 1;
    continue;
  }

  if (tool.confirmRequired) {
    const guard = policy.guardConfirmation(tool, {});
    if (guard.ok) {
      report.entries.push({ tool: tool.name, status: "failed", reason: "expected_guard_but_passed" });
      report.totals.failed += 1;
    } else {
      report.entries.push({ tool: tool.name, status: "guarded", reason: "confirmation_required" });
      report.totals.guarded += 1;
    }
    continue;
  }

  if (tool.destructive) {
    report.entries.push({ tool: tool.name, status: "skipped", reason: "destructive_without_confirmation_probe" });
    report.totals.skipped += 1;
    continue;
  }

  if (!canSafelyExecute(tool)) {
    report.entries.push({ tool: tool.name, status: "skipped", reason: "non_idempotent_or_risky" });
    report.totals.skipped += 1;
    continue;
  }

  const args = buildArgs(tool);
  const missingRequired = Object.entries(tool.inputShape)
    .filter(([, schema]) => typeof schema?.isOptional !== "function" || schema.isOptional() === false)
    .map(([key]) => key)
    .filter((key) => !(key in args));
  if (missingRequired.length > 0) {
    report.entries.push({ tool: tool.name, status: "skipped", reason: `missing_inputs:${missingRequired.join(",")}` });
    report.totals.skipped += 1;
    continue;
  }

  report.totals.attempted += 1;
  try {
    const result = await tool.execute(args, {
      client,
      ssh: {
        host: config.sshHost,
        port: config.sshPort,
        user: config.sshUser,
        keyPath: config.sshKeyPath,
        timeoutMs: 20_000
      },
      transport: "stdio"
    });
    if (result.ok) {
      report.entries.push({ tool: tool.name, status: "passed" });
      report.totals.passed += 1;
    } else {
      const message = result.error?.message ?? "";
      if (
        result.error?.code === "PROXMOX_ACL_FORBIDDEN" ||
        message.includes("No such container")
      ) {
        report.entries.push({
          tool: tool.name,
          status: "skipped",
          reason: result.error?.code === "PROXMOX_ACL_FORBIDDEN" ? "acl_forbidden" : "env_missing_target",
          message
        });
        report.totals.skipped += 1;
        continue;
      }
      report.entries.push({
        tool: tool.name,
        status: "failed",
        error: result.error?.code ?? "unknown",
        message
      });
      report.totals.failed += 1;
    }
  } catch (error) {
    report.entries.push({ tool: tool.name, status: "failed", error: error instanceof Error ? error.message : "unknown" });
    report.totals.failed += 1;
  }
}

const outputPath = resolve(root, "docs", "E2E_LIVE_REPORT.json");
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Live validation report saved: ${outputPath}`);
console.log(JSON.stringify(report.totals, null, 2));
