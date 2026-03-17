import { runGuarded } from "../guardian/guardian.js";
import type { ToolResult } from "../guardian/result.js";
import type { ProxmoxClient } from "../proxmox/client.js";

export const getNodeStatus = async (client: ProxmoxClient, node: string): Promise<ToolResult<unknown>> => {
  return await runGuarded(async () => await client.getNodeStatus(node));
};

export const getVMStatus = async (client: ProxmoxClient, node: string, vmid: number): Promise<ToolResult<unknown>> => {
  return await runGuarded(async () => await client.getVmStatus(node, vmid));
};

export const getContainerStatus = async (
  client: ProxmoxClient,
  node: string,
  vmid: number
): Promise<ToolResult<unknown>> => {
  return await runGuarded(async () => await client.getContainerStatus(node, vmid));
};
