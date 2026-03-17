import { runGuarded } from "../guardian/guardian.js";
import type { ToolResult } from "../guardian/result.js";
import type { ProxmoxClient } from "../proxmox/client.js";

export const startVM = async (client: ProxmoxClient, node: string, vmid: number): Promise<ToolResult<unknown>> => {
  return await runGuarded(async () => ({ upid: await client.startVm(node, vmid) }));
};

export const stopVM = async (client: ProxmoxClient, node: string, vmid: number): Promise<ToolResult<unknown>> => {
  return await runGuarded(async () => ({ upid: await client.stopVm(node, vmid) }));
};

export const startContainer = async (
  client: ProxmoxClient,
  node: string,
  vmid: number
): Promise<ToolResult<unknown>> => {
  return await runGuarded(async () => ({ upid: await client.startContainer(node, vmid) }));
};

export const stopContainer = async (
  client: ProxmoxClient,
  node: string,
  vmid: number
): Promise<ToolResult<unknown>> => {
  return await runGuarded(async () => ({ upid: await client.stopContainer(node, vmid) }));
};
