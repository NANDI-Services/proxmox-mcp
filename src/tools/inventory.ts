import type { RuntimeConfig } from "../config/validate.js";
import { ProxmoxClient } from "../proxmox/client.js";
import { runGuarded } from "../guardian/guardian.js";
import type { ToolResult } from "../guardian/result.js";

export const listNodes = async (client: ProxmoxClient): Promise<ToolResult<unknown>> => {
  return await runGuarded(async () => await client.listNodes());
};

export const listVMs = async (client: ProxmoxClient, node?: string): Promise<ToolResult<unknown>> => {
  return await runGuarded(async () => {
    const nodes = node ? [node] : (await client.listNodes()).map((n) => n.node);
    const all = await Promise.all(nodes.map(async (currentNode) => await client.listVms(currentNode)));
    return all.flat();
  });
};

export const listContainers = async (client: ProxmoxClient, node?: string): Promise<ToolResult<unknown>> => {
  return await runGuarded(async () => {
    const nodes = node ? [node] : (await client.listNodes()).map((n) => n.node);
    const all = await Promise.all(nodes.map(async (currentNode) => await client.listContainers(currentNode)));
    return all.flat();
  });
};

export const createInventoryContext = (config: RuntimeConfig): ProxmoxClient => new ProxmoxClient(config);
