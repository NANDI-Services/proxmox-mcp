import { z } from "zod";
import { runGuarded } from "../guardian/guardian.js";
import type { ToolResult } from "../guardian/result.js";
import type { EndpointDescriptor } from "../proxmox/descriptor.js";
import type { ToolDescriptor, ToolShape } from "../server/toolMetadata.js";
import { dockerLogsInContainer, dockerPsInContainer, execInContainer, runRemoteDiagnostic } from "./operations.js";
import { sshBatchDiagnostics } from "./diagnostics.js";

const noInput = {} satisfies ToolShape;
const nodeShape = { node: z.string().min(1) } satisfies ToolShape;
const nodeOptionalShape = { node: z.string().min(1).optional() } satisfies ToolShape;
const vmShape = { node: z.string().min(1), vmid: z.number().int().positive() } satisfies ToolShape;
const ctShape = { node: z.string().min(1), vmid: z.number().int().positive() } satisfies ToolShape;
const storageShape = { storage: z.string().min(1) } satisfies ToolShape;
const upidShape = { node: z.string().min(1), upid: z.string().min(1) } satisfies ToolShape;

const withConfirm = (shape: ToolShape): ToolShape => ({ ...shape, confirm: z.boolean().optional() });
const pathParamsFromPath = (path: string): string[] =>
  [...path.matchAll(/{([^}]+)}/g)].map((match) => match[1]).filter((value): value is string => Boolean(value));

const apiTool = (config: {
  name: string;
  description: string;
  category: ToolDescriptor["category"];
  module?: ToolDescriptor["module"];
  accessTier: ToolDescriptor["accessTier"];
  destructive?: boolean;
  confirmRequired?: boolean;
  idempotent?: boolean;
  transport?: ToolDescriptor["transport"];
  aliases?: string[];
  deprecated?: boolean;
  atLeastOneOf?: readonly string[];
  inputShape: ToolShape;
  endpoint: EndpointDescriptor;
}): ToolDescriptor => {
  const confirmRequired = config.confirmRequired ?? false;
  const atLeastOneOf = config.atLeastOneOf;
  return {
    name: config.name,
    description: config.description,
    category: config.category,
    module: config.module ?? "core",
    accessTier: config.accessTier,
    destructive: config.destructive ?? false,
    confirmRequired,
    idempotent: config.idempotent ?? false,
    transport: config.transport ?? "both",
    aliases: config.aliases,
    deprecated: config.deprecated,
    inputShape: confirmRequired ? withConfirm(config.inputShape) : config.inputShape,
    argGuard:
      atLeastOneOf && atLeastOneOf.length > 0
        ? (args) => {
            const hasAny = atLeastOneOf.some((field) => args[field] !== undefined && args[field] !== null);
            if (hasAny) {
              return { ok: true };
            }
            return {
              ok: false,
              message: `At least one mutable field is required: ${atLeastOneOf.join(", ")}.`,
              hint: "Provide one or more update fields before retrying."
            };
          }
        : undefined,
    execute: async (args, ctx): Promise<ToolResult<unknown>> =>
      await runGuarded(async () => await ctx.client.requestEndpoint(config.endpoint, args), {
        timeoutMs: config.endpoint.timeoutMs ?? 20_000
      })
  };
};

const qemuOps = ["start", "stop", "shutdown", "reboot", "reset", "suspend", "resume"] as const;
const lxcOps = ["start", "stop", "shutdown", "reboot", "suspend", "resume"] as const;
const timeframes = ["hour", "day", "week", "month", "year"] as const;

const coreFixed: ToolDescriptor[] = [
  apiTool({ name: "pve_list_nodes", description: "List Proxmox nodes.", category: "nodes", accessTier: "read-only", idempotent: true, aliases: ["listNodes"], inputShape: noInput, endpoint: { id: "nodes.list", method: "GET", path: "/api2/json/nodes" } }),
  apiTool({ name: "pve_get_node_status", description: "Get node status.", category: "nodes", accessTier: "read-only", idempotent: true, aliases: ["getNodeStatus"], inputShape: nodeShape, endpoint: { id: "nodes.status", method: "GET", path: "/api2/json/nodes/{node}/status", pathParams: ["node"] } }),
  apiTool({ name: "pve_list_qemu_vms", description: "List QEMU VMs.", category: "qemu", accessTier: "read-only", idempotent: true, inputShape: nodeShape, endpoint: { id: "qemu.list", method: "GET", path: "/api2/json/nodes/{node}/qemu", pathParams: ["node"] } }),
  apiTool({ name: "pve_get_qemu_status", description: "Get QEMU status.", category: "qemu", accessTier: "read-only", idempotent: true, aliases: ["getVMStatus"], inputShape: vmShape, endpoint: { id: "qemu.status", method: "GET", path: "/api2/json/nodes/{node}/qemu/{vmid}/status/current", pathParams: ["node", "vmid"] } }),
  apiTool({ name: "pve_list_lxc_containers", description: "List LXC containers.", category: "lxc", accessTier: "read-only", idempotent: true, inputShape: nodeShape, endpoint: { id: "lxc.list", method: "GET", path: "/api2/json/nodes/{node}/lxc", pathParams: ["node"] } }),
  apiTool({ name: "pve_get_lxc_status", description: "Get LXC status.", category: "lxc", accessTier: "read-only", idempotent: true, aliases: ["getContainerStatus"], inputShape: ctShape, endpoint: { id: "lxc.status", method: "GET", path: "/api2/json/nodes/{node}/lxc/{vmid}/status/current", pathParams: ["node", "vmid"] } }),
  apiTool({ name: "pve_get_cluster_status", description: "Get cluster status.", category: "cluster", accessTier: "read-only", idempotent: true, inputShape: noInput, endpoint: { id: "cluster.status", method: "GET", path: "/api2/json/cluster/status" } }),
  apiTool({ name: "pve_list_storage", description: "List storage backends.", category: "storage", accessTier: "read-only", idempotent: true, inputShape: noInput, endpoint: { id: "storage.list", method: "GET", path: "/api2/json/storage" } }),
  apiTool({ name: "pve_list_tasks", description: "List node tasks.", category: "tasks", accessTier: "read-only", idempotent: true, inputShape: { ...nodeShape, limit: z.number().int().min(1).max(500).optional() }, endpoint: { id: "tasks.list", method: "GET", path: "/api2/json/nodes/{node}/tasks", pathParams: ["node"], queryParams: ["limit"] } }),
  apiTool({ name: "pve_get_task_status", description: "Get task status.", category: "tasks", accessTier: "read-only", idempotent: true, inputShape: upidShape, endpoint: { id: "tasks.status", method: "GET", path: "/api2/json/nodes/{node}/tasks/{upid}/status", pathParams: ["node", "upid"] } }),
  apiTool({ name: "pve_get_task_log", description: "Get task log.", category: "tasks", accessTier: "read-only", idempotent: true, inputShape: upidShape, endpoint: { id: "tasks.log", method: "GET", path: "/api2/json/nodes/{node}/tasks/{upid}/log", pathParams: ["node", "upid"] } })
];

coreFixed.push(
  apiTool({ name: "pve_list_networks", description: "List node network interfaces.", category: "network", accessTier: "read-only", idempotent: true, inputShape: nodeShape, endpoint: { id: "network.list", method: "GET", path: "/api2/json/nodes/{node}/network", pathParams: ["node"] } }),
  apiTool({ name: "pve_list_pools", description: "List pools.", category: "pools", accessTier: "read-only", idempotent: true, inputShape: noInput, endpoint: { id: "pools.list", method: "GET", path: "/api2/json/pools" } }),
  apiTool({ name: "pve_list_users", description: "List users.", category: "access", module: "advanced", accessTier: "read-only", idempotent: true, inputShape: noInput, endpoint: { id: "access.users", method: "GET", path: "/api2/json/access/users" } }),
  apiTool({ name: "pve_list_cluster_firewall_rules", description: "List cluster firewall rules.", category: "firewall", module: "advanced", accessTier: "read-only", idempotent: true, inputShape: noInput, endpoint: { id: "firewall.cluster.rules", method: "GET", path: "/api2/json/cluster/firewall/rules" } }),
  apiTool({ name: "pve_list_backup_jobs", description: "List scheduled backup jobs.", category: "backup", accessTier: "read-only", idempotent: true, inputShape: noInput, endpoint: { id: "backup.jobs", method: "GET", path: "/api2/json/cluster/backup" } }),
  apiTool({ name: "pve_get_qemu_config", description: "Get QEMU config.", category: "qemu", accessTier: "read-only", idempotent: true, inputShape: vmShape, endpoint: { id: "qemu.config", method: "GET", path: "/api2/json/nodes/{node}/qemu/{vmid}/config", pathParams: ["node", "vmid"] } }),
  apiTool({ name: "pve_get_lxc_config", description: "Get LXC config.", category: "lxc", accessTier: "read-only", idempotent: true, inputShape: ctShape, endpoint: { id: "lxc.config", method: "GET", path: "/api2/json/nodes/{node}/lxc/{vmid}/config", pathParams: ["node", "vmid"] } })
);

coreFixed.push(
  {
    name: "pve_run_remote_diagnostic", description: "Run safe diagnostic command in container.", category: "remote", module: "core", accessTier: "read-execute", destructive: false,
    confirmRequired: false, idempotent: true, transport: "both", aliases: ["runRemoteDiagnostic"], inputShape: { ctid: z.number().int().positive(), command: z.string().min(1) },
    execute: async (args, ctx) => await runRemoteDiagnostic(ctx.ssh, Number(args.ctid), String(args.command))
  },
  {
    name: "pve_ssh_batch_diagnostics", description: "Run SSH batch diagnostics.", category: "remote", module: "core", accessTier: "read-only", destructive: false,
    confirmRequired: false, idempotent: true, transport: "both", aliases: ["sshBatchDiagnostics"], inputShape: noInput,
    execute: async (_args, ctx) => await sshBatchDiagnostics(ctx.ssh)
  },
  {
    name: "pve_exec_in_container", description: "Run command in container via pct exec.", category: "remote", module: "advanced", accessTier: "full", destructive: true,
    confirmRequired: true, idempotent: false, transport: "both", aliases: ["execInContainer"], inputShape: withConfirm({ ctid: z.number().int().positive(), command: z.string().min(1) }),
    execute: async (args, ctx) => await execInContainer(ctx.ssh, Number(args.ctid), String(args.command))
  },
  {
    name: "pve_docker_ps_in_container", description: "Run docker ps in container.", category: "remote", module: "advanced", accessTier: "read-execute", destructive: false,
    confirmRequired: false, idempotent: true, transport: "both", aliases: ["dockerPsInContainer"], inputShape: { ctid: z.number().int().positive() },
    execute: async (args, ctx) => await dockerPsInContainer(ctx.ssh, Number(args.ctid))
  },
  {
    name: "pve_docker_logs_in_container", description: "Run docker logs in container.", category: "remote", module: "advanced", accessTier: "read-execute", destructive: false,
    confirmRequired: false, idempotent: true, transport: "both", aliases: ["dockerLogsInContainer"], inputShape: { ctid: z.number().int().positive(), containerName: z.string().min(1), tail: z.number().int().min(1).max(2000).optional() },
    execute: async (args, ctx) => await dockerLogsInContainer(ctx.ssh, Number(args.ctid), String(args.containerName), Number(args.tail ?? 200))
  }
);

coreFixed.push(
  {
    name: "listVMs", description: "Legacy list VMs (optionally by node).", category: "qemu", module: "core", accessTier: "read-only", destructive: false,
    confirmRequired: false, idempotent: true, deprecated: true, transport: "both", inputShape: nodeOptionalShape,
    execute: async (args, ctx): Promise<ToolResult<unknown>> => await runGuarded(async () => {
      if (typeof args.node === "string" && args.node.length > 0) {
        return await ctx.client.requestEndpoint({ id: "legacy.vms.byNode", method: "GET", path: "/api2/json/nodes/{node}/qemu", pathParams: ["node"] }, args);
      }
      const nodes = await ctx.client.requestEndpoint<Array<{ node: string }>>({ id: "legacy.nodes", method: "GET", path: "/api2/json/nodes" }, {});
      const all = await Promise.all(nodes.map(async (n) => await ctx.client.requestEndpoint({ id: "legacy.vms", method: "GET", path: "/api2/json/nodes/{node}/qemu", pathParams: ["node"] }, { node: n.node })));
      return all.flat();
    })
  },
  {
    name: "listContainers", description: "Legacy list containers (optionally by node).", category: "lxc", module: "core", accessTier: "read-only", destructive: false,
    confirmRequired: false, idempotent: true, deprecated: true, transport: "both", inputShape: nodeOptionalShape,
    execute: async (args, ctx): Promise<ToolResult<unknown>> => await runGuarded(async () => {
      if (typeof args.node === "string" && args.node.length > 0) {
        return await ctx.client.requestEndpoint({ id: "legacy.ct.byNode", method: "GET", path: "/api2/json/nodes/{node}/lxc", pathParams: ["node"] }, args);
      }
      const nodes = await ctx.client.requestEndpoint<Array<{ node: string }>>({ id: "legacy.nodes", method: "GET", path: "/api2/json/nodes" }, {});
      const all = await Promise.all(nodes.map(async (n) => await ctx.client.requestEndpoint({ id: "legacy.ct", method: "GET", path: "/api2/json/nodes/{node}/lxc", pathParams: ["node"] }, { node: n.node })));
      return all.flat();
    })
  }
);

const generated: ToolDescriptor[] = [];

for (const op of qemuOps) {
  generated.push(apiTool({
    name: `pve_${op}_qemu_vm`, description: `${op} QEMU VM.`, category: "qemu", accessTier: "read-execute", destructive: true, confirmRequired: op !== "start" && op !== "resume", inputShape: vmShape,
    aliases: op === "start" ? ["startVM"] : op === "stop" ? ["stopVM"] : undefined,
    endpoint: { id: `qemu.${op}`, method: "POST", path: `/api2/json/nodes/{node}/qemu/{vmid}/status/${op}`, pathParams: ["node", "vmid"] }
  }));
}

for (const op of lxcOps) {
  generated.push(apiTool({
    name: `pve_${op}_lxc_container`, description: `${op} LXC container.`, category: "lxc", accessTier: "read-execute", destructive: true, confirmRequired: op !== "start" && op !== "resume", inputShape: ctShape,
    aliases: op === "start" ? ["startContainer"] : op === "stop" ? ["stopContainer"] : undefined,
    endpoint: { id: `lxc.${op}`, method: "POST", path: `/api2/json/nodes/{node}/lxc/{vmid}/status/${op}`, pathParams: ["node", "vmid"] }
  }));
}

const timeframeTargets = [
  { entity: "node", category: "monitoring", shape: nodeShape, path: "/api2/json/nodes/{node}/rrddata", pathParams: ["node"] as const },
  { entity: "qemu", category: "monitoring", shape: vmShape, path: "/api2/json/nodes/{node}/qemu/{vmid}/rrddata", pathParams: ["node", "vmid"] as const },
  { entity: "lxc", category: "monitoring", shape: ctShape, path: "/api2/json/nodes/{node}/lxc/{vmid}/rrddata", pathParams: ["node", "vmid"] as const }
] as const;

for (const timeframe of timeframes) {
  for (const target of timeframeTargets) {
    generated.push(apiTool({
      name: `pve_get_${target.entity}_metrics_${timeframe}`,
      description: `Get ${target.entity} metrics for ${timeframe}.`,
      category: target.category,
      accessTier: "read-only",
      idempotent: true,
      inputShape: target.shape,
      endpoint: { id: `metrics.${target.entity}.${timeframe}`, method: "GET", path: target.path, pathParams: [...target.pathParams], queryParams: ["timeframe"] }
    }));
  }
}

const qemuMutations = [
  { key: "create", method: "POST" as const, path: "/api2/json/nodes/{node}/qemu", shape: { ...nodeShape, vmid: z.number().int().positive(), name: z.string().optional(), memory: z.number().int().positive().optional(), cores: z.number().int().positive().optional() }, body: ["vmid", "name", "memory", "cores"], tier: "full" as const, destructive: false, confirmRequired: false },
  { key: "delete", method: "DELETE" as const, path: "/api2/json/nodes/{node}/qemu/{vmid}", shape: vmShape, body: [], tier: "full" as const, destructive: true, confirmRequired: true },
  { key: "migrate", method: "POST" as const, path: "/api2/json/nodes/{node}/qemu/{vmid}/migrate", shape: { ...vmShape, target: z.string().min(1), online: z.number().int().min(0).max(1).optional() }, body: ["target", "online"], tier: "read-execute" as const, destructive: true, confirmRequired: true },
  { key: "clone", method: "POST" as const, path: "/api2/json/nodes/{node}/qemu/{vmid}/clone", shape: { ...vmShape, newid: z.number().int().positive(), name: z.string().optional(), target: z.string().optional() }, body: ["newid", "name", "target"], tier: "full" as const, destructive: false, confirmRequired: false },
  { key: "update_config", method: "PUT" as const, path: "/api2/json/nodes/{node}/qemu/{vmid}/config", shape: { ...vmShape, memory: z.number().int().positive().optional(), cores: z.number().int().positive().optional(), sockets: z.number().int().positive().optional(), onboot: z.number().int().min(0).max(1).optional() }, body: ["memory", "cores", "sockets", "onboot"], tier: "full" as const, destructive: true, confirmRequired: true },
  { key: "resize_disk", method: "PUT" as const, path: "/api2/json/nodes/{node}/qemu/{vmid}/resize", shape: { ...vmShape, disk: z.string().min(1), size: z.string().min(2) }, body: ["disk", "size"], tier: "full" as const, destructive: true, confirmRequired: true },
  { key: "create_snapshot", method: "POST" as const, path: "/api2/json/nodes/{node}/qemu/{vmid}/snapshot", shape: { ...vmShape, snapname: z.string().min(1), description: z.string().optional() }, body: ["snapname", "description"], tier: "full" as const, destructive: false, confirmRequired: false },
  { key: "delete_snapshot", method: "DELETE" as const, path: "/api2/json/nodes/{node}/qemu/{vmid}/snapshot/{snapname}", shape: { ...vmShape, snapname: z.string().min(1) }, body: [], tier: "full" as const, destructive: true, confirmRequired: true },
  { key: "rollback_snapshot", method: "POST" as const, path: "/api2/json/nodes/{node}/qemu/{vmid}/snapshot/{snapname}/rollback", shape: { ...vmShape, snapname: z.string().min(1) }, body: [], tier: "full" as const, destructive: true, confirmRequired: true },
  { key: "create_template", method: "POST" as const, path: "/api2/json/nodes/{node}/qemu/{vmid}/template", shape: vmShape, body: [], tier: "full" as const, destructive: true, confirmRequired: true }
] as const;

for (const item of qemuMutations) {
  generated.push(apiTool({
    name: `pve_qemu_${item.key}`,
    description: `QEMU ${item.key.replaceAll("_", " ")}.`,
    category: "qemu",
    accessTier: item.tier,
    destructive: item.destructive,
    confirmRequired: item.confirmRequired,
    idempotent: item.key.includes("update"),
      inputShape: item.shape,
      atLeastOneOf: item.key.includes("update") ? item.body : undefined,
      endpoint: { id: `qemu.${item.key}`, method: item.method, path: item.path, pathParams: pathParamsFromPath(item.path), bodyParams: item.body }
    }));
  }

const lxcMutations = [
  { key: "create", method: "POST" as const, path: "/api2/json/nodes/{node}/lxc", shape: { ...nodeShape, vmid: z.number().int().positive(), ostemplate: z.string().min(1), hostname: z.string().optional(), memory: z.number().int().positive().optional(), cores: z.number().int().positive().optional() }, body: ["vmid", "ostemplate", "hostname", "memory", "cores"], tier: "full" as const, destructive: false, confirmRequired: false },
  { key: "delete", method: "DELETE" as const, path: "/api2/json/nodes/{node}/lxc/{vmid}", shape: ctShape, body: [], tier: "full" as const, destructive: true, confirmRequired: true },
  { key: "migrate", method: "POST" as const, path: "/api2/json/nodes/{node}/lxc/{vmid}/migrate", shape: { ...ctShape, target: z.string().min(1) }, body: ["target"], tier: "read-execute" as const, destructive: true, confirmRequired: true },
  { key: "clone", method: "POST" as const, path: "/api2/json/nodes/{node}/lxc/{vmid}/clone", shape: { ...ctShape, newid: z.number().int().positive(), hostname: z.string().optional(), target: z.string().optional() }, body: ["newid", "hostname", "target"], tier: "full" as const, destructive: false, confirmRequired: false },
  { key: "update_config", method: "PUT" as const, path: "/api2/json/nodes/{node}/lxc/{vmid}/config", shape: { ...ctShape, memory: z.number().int().positive().optional(), cores: z.number().int().positive().optional(), swap: z.number().int().min(0).optional() }, body: ["memory", "cores", "swap"], tier: "full" as const, destructive: true, confirmRequired: true },
  { key: "create_snapshot", method: "POST" as const, path: "/api2/json/nodes/{node}/lxc/{vmid}/snapshot", shape: { ...ctShape, snapname: z.string().min(1), description: z.string().optional() }, body: ["snapname", "description"], tier: "full" as const, destructive: false, confirmRequired: false },
  { key: "delete_snapshot", method: "DELETE" as const, path: "/api2/json/nodes/{node}/lxc/{vmid}/snapshot/{snapname}", shape: { ...ctShape, snapname: z.string().min(1) }, body: [], tier: "full" as const, destructive: true, confirmRequired: true },
  { key: "rollback_snapshot", method: "POST" as const, path: "/api2/json/nodes/{node}/lxc/{vmid}/snapshot/{snapname}/rollback", shape: { ...ctShape, snapname: z.string().min(1) }, body: [], tier: "full" as const, destructive: true, confirmRequired: true }
] as const;

for (const item of lxcMutations) {
    generated.push(apiTool({
    name: `pve_lxc_${item.key}`,
    description: `LXC ${item.key.replaceAll("_", " ")}.`,
    category: "lxc",
    accessTier: item.tier,
    destructive: item.destructive,
    confirmRequired: item.confirmRequired,
    idempotent: item.key.includes("update"),
      inputShape: item.shape,
      atLeastOneOf: item.key.includes("update") ? item.body : undefined,
      endpoint: { id: `lxc.${item.key}`, method: item.method, path: item.path, pathParams: pathParamsFromPath(item.path), bodyParams: item.body }
    }));
  }

const categoryEndpoints = [
  ["cluster", "pve_get_cluster_log", "/api2/json/cluster/log"],
  ["cluster", "pve_get_cluster_options", "/api2/json/cluster/options"],
  ["cluster", "pve_get_next_vmid", "/api2/json/cluster/nextid"],
  ["cluster", "pve_list_cluster_resources", "/api2/json/cluster/resources"],
  ["cluster", "pve_list_cluster_replication", "/api2/json/cluster/replication"],
  ["cluster", "pve_get_cluster_ha_status", "/api2/json/cluster/ha/status/current"],
  ["cluster", "pve_list_cluster_backup_info", "/api2/json/cluster/backup-info"],
  ["storage", "pve_get_storage_config", "/api2/json/storage/{storage}"],
  ["storage", "pve_list_node_storage", "/api2/json/nodes/{node}/storage"],
  ["storage", "pve_get_storage_status", "/api2/json/nodes/{node}/storage/{storage}/status"],
  ["storage", "pve_list_storage_content", "/api2/json/nodes/{node}/storage/{storage}/content"],
  ["backup", "pve_get_backup_job", "/api2/json/cluster/backup/{id}"],
  ["backup", "pve_list_backups", "/api2/json/nodes/{node}/storage/{storage}/content"],
  ["network", "pve_get_network", "/api2/json/nodes/{node}/network/{iface}"],
  ["network", "pve_list_node_bridges", "/api2/json/nodes/{node}/network"],
  ["network", "pve_list_node_bonds", "/api2/json/nodes/{node}/network"],
  ["network", "pve_list_node_physical_nics", "/api2/json/nodes/{node}/network"],
  ["pools", "pve_get_pool", "/api2/json/pools/{poolid}"],
  ["access", "pve_list_roles", "/api2/json/access/roles"],
  ["access", "pve_list_groups", "/api2/json/access/groups"],
  ["access", "pve_list_acls", "/api2/json/access/acl"],
  ["access", "pve_list_domains", "/api2/json/access/domains"],
  ["access", "pve_list_api_tokens", "/api2/json/access/users/{userid}/token"],
  ["templates", "pve_get_qemu_cloudinit_dump", "/api2/json/nodes/{node}/qemu/{vmid}/cloudinit/dump"],
  ["templates", "pve_list_qemu_templates", "/api2/json/nodes/{node}/qemu"],
  ["templates", "pve_list_iso_images", "/api2/json/nodes/{node}/storage/{storage}/content"],
  ["templates", "pve_list_storage_templates", "/api2/json/nodes/{node}/storage/{storage}/content"],
  ["firewall", "pve_get_cluster_firewall_options", "/api2/json/cluster/firewall/options"],
  ["firewall", "pve_list_cluster_firewall_aliases", "/api2/json/cluster/firewall/aliases"],
  ["firewall", "pve_list_cluster_firewall_ipsets", "/api2/json/cluster/firewall/ipset"],
  ["firewall", "pve_list_guest_firewall_rules", "/api2/json/nodes/{node}/{guest_type}/{vmid}/firewall/rules"],
  ["monitoring", "pve_get_cluster_metrics_overview", "/api2/json/cluster/resources"],
  ["monitoring", "pve_get_node_version", "/api2/json/nodes/{node}/version"],
  ["monitoring", "pve_get_node_dns", "/api2/json/nodes/{node}/dns"],
  ["monitoring", "pve_get_node_time", "/api2/json/nodes/{node}/time"],
  ["monitoring", "pve_get_node_syslog", "/api2/json/nodes/{node}/syslog"],
  ["monitoring", "pve_list_node_services", "/api2/json/nodes/{node}/services"],
  ["monitoring", "pve_get_qemu_agent_info", "/api2/json/nodes/{node}/qemu/{vmid}/agent/info"],
  ["monitoring", "pve_get_qemu_agent_network", "/api2/json/nodes/{node}/qemu/{vmid}/agent/network-get-interfaces"],
  ["monitoring", "pve_get_qemu_agent_osinfo", "/api2/json/nodes/{node}/qemu/{vmid}/agent/get-osinfo"],
  ["monitoring", "pve_get_qemu_agent_fsinfo", "/api2/json/nodes/{node}/qemu/{vmid}/agent/get-fsinfo"]
] as const;

for (const [category, name, path] of categoryEndpoints) {
  const shape: ToolShape = {
    ...(path.includes("{node}") ? nodeShape : noInput),
    ...(path.includes("{vmid}") ? { vmid: z.number().int().positive() } : {}),
    ...(path.includes("{storage}") ? storageShape : {}),
    ...(path.includes("{id}") ? { id: z.string().min(1) } : {}),
    ...(path.includes("{iface}") ? { iface: z.string().min(1) } : {}),
    ...(path.includes("{poolid}") ? { poolid: z.string().min(1) } : {}),
    ...(path.includes("{userid}") ? { userid: z.string().min(1) } : {}),
    ...(path.includes("{guest_type}") ? { guest_type: z.enum(["qemu", "lxc"]).default("qemu") } : {})
  };
  const pathParams = pathParamsFromPath(path);
  generated.push(apiTool({
    name,
    description: `${name.replace("pve_", "").replaceAll("_", " ")}.`,
    category: category as ToolDescriptor["category"],
    module: category === "access" || category === "firewall" ? "advanced" : "core",
    accessTier: "read-only",
    idempotent: true,
    inputShape: shape,
    endpoint: { id: name, method: "GET", path, pathParams: pathParams.length > 0 ? pathParams : undefined }
  }));
}

const writeEndpoints = [
  ["storage", "pve_create_storage", "POST", "/api2/json/storage", { storage: z.string().min(1), type: z.string().min(1), content: z.string().optional(), path: z.string().optional() }, ["storage", "type", "content", "path"], false, false],
  ["storage", "pve_update_storage", "PUT", "/api2/json/storage/{storage}", { ...storageShape, content: z.string().optional(), disable: z.number().int().min(0).max(1).optional() }, ["content", "disable"], true, true],
  ["storage", "pve_delete_storage", "DELETE", "/api2/json/storage/{storage}", storageShape, [], true, true],
  ["backup", "pve_run_backup", "POST", "/api2/json/nodes/{node}/vzdump", { ...nodeShape, vmid: z.string().min(1), storage: z.string().optional(), mode: z.enum(["snapshot", "suspend", "stop"]).optional() }, ["vmid", "storage", "mode"], false, false],
  ["backup", "pve_create_backup_job", "POST", "/api2/json/cluster/backup", { vmid: z.string().min(1), storage: z.string().min(1), schedule: z.string().min(1), mode: z.enum(["snapshot", "suspend", "stop"]).optional() }, ["vmid", "storage", "schedule", "mode"], false, false],
  ["backup", "pve_delete_backup_job", "DELETE", "/api2/json/cluster/backup/{id}", { id: z.string().min(1) }, [], true, true],
  ["backup", "pve_restore_qemu_backup", "POST", "/api2/json/nodes/{node}/qemu", { ...nodeShape, vmid: z.number().int().positive(), archive: z.string().min(1), storage: z.string().optional() }, ["vmid", "archive", "storage"], true, true],
  ["backup", "pve_restore_lxc_backup", "POST", "/api2/json/nodes/{node}/lxc", { ...nodeShape, vmid: z.number().int().positive(), archive: z.string().min(1), storage: z.string().optional() }, ["vmid", "archive", "storage"], true, true],
  ["tasks", "pve_stop_task", "DELETE", "/api2/json/nodes/{node}/tasks/{upid}", upidShape, [], true, true],
  ["network", "pve_create_network", "POST", "/api2/json/nodes/{node}/network", { ...nodeShape, iface: z.string().min(1), type: z.string().min(1), autostart: z.number().int().min(0).max(1).optional() }, ["iface", "type", "autostart"], false, false],
  ["network", "pve_update_network", "PUT", "/api2/json/nodes/{node}/network/{iface}", { ...nodeShape, iface: z.string().min(1), autostart: z.number().int().min(0).max(1).optional(), comments: z.string().optional() }, ["autostart", "comments"], true, true],
  ["network", "pve_delete_network", "DELETE", "/api2/json/nodes/{node}/network/{iface}", { ...nodeShape, iface: z.string().min(1) }, [], true, true],
  ["pools", "pve_create_pool", "POST", "/api2/json/pools", { poolid: z.string().min(1), comment: z.string().optional() }, ["poolid", "comment"], false, false],
  ["pools", "pve_update_pool", "PUT", "/api2/json/pools/{poolid}", { poolid: z.string().min(1), comment: z.string().optional(), vms: z.string().optional(), storage: z.string().optional() }, ["comment", "vms", "storage"], true, true],
  ["pools", "pve_delete_pool", "DELETE", "/api2/json/pools/{poolid}", { poolid: z.string().min(1) }, [], true, true],
  ["access", "pve_create_user", "POST", "/api2/json/access/users", { userid: z.string().min(1), password: z.string().optional(), email: z.string().optional() }, ["userid", "password", "email"], false, false],
  ["access", "pve_update_user", "PUT", "/api2/json/access/users/{userid}", { userid: z.string().min(1), email: z.string().optional(), enable: z.number().int().min(0).max(1).optional() }, ["email", "enable"], true, true],
  ["access", "pve_delete_user", "DELETE", "/api2/json/access/users/{userid}", { userid: z.string().min(1) }, [], true, true],
  ["access", "pve_update_acl", "PUT", "/api2/json/access/acl", { path: z.string().min(1), roles: z.string().min(1), users: z.string().optional(), groups: z.string().optional(), propagate: z.number().int().min(0).max(1).optional(), delete: z.number().int().min(0).max(1).optional() }, ["path", "roles", "users", "groups", "propagate", "delete"], true, true],
  ["access", "pve_create_api_token", "POST", "/api2/json/access/users/{userid}/token/{tokenid}", { userid: z.string().min(1), tokenid: z.string().min(1), expire: z.number().int().optional(), privsep: z.number().int().min(0).max(1).optional() }, ["expire", "privsep"], false, false],
  ["access", "pve_delete_api_token", "DELETE", "/api2/json/access/users/{userid}/token/{tokenid}", { userid: z.string().min(1), tokenid: z.string().min(1) }, [], true, true],
  ["firewall", "pve_update_cluster_firewall_options", "PUT", "/api2/json/cluster/firewall/options", { enable: z.number().int().min(0).max(1).optional(), policy_in: z.string().optional(), policy_out: z.string().optional() }, ["enable", "policy_in", "policy_out"], true, true],
  ["firewall", "pve_create_cluster_firewall_rule", "POST", "/api2/json/cluster/firewall/rules", { type: z.enum(["in", "out"]), action: z.string().min(1), proto: z.string().optional(), dport: z.string().optional(), source: z.string().optional(), dest: z.string().optional() }, ["type", "action", "proto", "dport", "source", "dest"], false, false],
  ["firewall", "pve_update_cluster_firewall_rule", "PUT", "/api2/json/cluster/firewall/rules/{pos}", { pos: z.number().int().min(0), action: z.string().optional(), proto: z.string().optional(), dport: z.string().optional() }, ["action", "proto", "dport"], true, true],
  ["firewall", "pve_delete_cluster_firewall_rule", "DELETE", "/api2/json/cluster/firewall/rules/{pos}", { pos: z.number().int().min(0) }, [], true, true],
  ["firewall", "pve_create_guest_firewall_rule", "POST", "/api2/json/nodes/{node}/{guest_type}/{vmid}/firewall/rules", { ...nodeShape, guest_type: z.enum(["qemu", "lxc"]).default("qemu"), vmid: z.number().int().positive(), type: z.enum(["in", "out"]), action: z.string().min(1), proto: z.string().optional(), dport: z.string().optional() }, ["type", "action", "proto", "dport"], false, false],
  ["firewall", "pve_update_guest_firewall_rule", "PUT", "/api2/json/nodes/{node}/{guest_type}/{vmid}/firewall/rules/{pos}", { ...nodeShape, guest_type: z.enum(["qemu", "lxc"]).default("qemu"), vmid: z.number().int().positive(), pos: z.number().int().min(0), action: z.string().optional(), proto: z.string().optional(), dport: z.string().optional() }, ["action", "proto", "dport"], true, true],
  ["firewall", "pve_delete_guest_firewall_rule", "DELETE", "/api2/json/nodes/{node}/{guest_type}/{vmid}/firewall/rules/{pos}", { ...nodeShape, guest_type: z.enum(["qemu", "lxc"]).default("qemu"), vmid: z.number().int().positive(), pos: z.number().int().min(0) }, [], true, true],
  ["templates", "pve_set_qemu_cloudinit", "PUT", "/api2/json/nodes/{node}/qemu/{vmid}/config", { ...vmShape, ciuser: z.string().optional(), cipassword: z.string().optional(), sshkeys: z.string().optional(), ipconfig0: z.string().optional(), nameserver: z.string().optional() }, ["ciuser", "cipassword", "sshkeys", "ipconfig0", "nameserver"], true, true],
  ["templates", "pve_create_qemu_template", "POST", "/api2/json/nodes/{node}/qemu/{vmid}/template", vmShape, [], true, true],
  ["qemu", "pve_exec_qemu_guest_command", "POST", "/api2/json/nodes/{node}/qemu/{vmid}/agent/exec", { ...vmShape, command: z.string().min(1) }, ["command"], true, true]
] as const;

for (const [category, name, method, path, shape, bodyParams, destructive, confirmRequired] of writeEndpoints) {
  const pathParams = pathParamsFromPath(path);
  generated.push(apiTool({
    name,
    description: `${name.replace("pve_", "").replaceAll("_", " ")}.`,
    category: category as ToolDescriptor["category"],
    module: category === "access" || category === "firewall" ? "advanced" : "core",
    accessTier: category === "backup" && name === "pve_run_backup" ? "read-execute" : "full",
    destructive,
    confirmRequired,
    inputShape: shape as ToolShape,
    atLeastOneOf: name.includes("update_") ? (bodyParams as readonly string[]) : undefined,
    endpoint: { id: name, method: method as EndpointDescriptor["method"], path, pathParams: pathParams.length > 0 ? pathParams : undefined, bodyParams }
  }));
}

export const toolCatalog: ToolDescriptor[] = [...coreFixed, ...generated];

export const toolCountByCategory = (): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const tool of toolCatalog) {
    out[tool.category] = (out[tool.category] ?? 0) + 1;
  }
  return out;
};

export const totalToolCount = (): number => toolCatalog.length;
