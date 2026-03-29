import type { z } from "zod";
import type { ToolResult } from "../guardian/result.js";
import type { ProxmoxClient } from "../proxmox/client.js";
import type { SshBatchOptions } from "../ssh/sshClient.js";

export const accessTierValues = ["read-only", "read-execute", "full"] as const;
export type AccessTier = (typeof accessTierValues)[number];

export const transportModeValues = ["stdio", "http", "both"] as const;
export type TransportCompatibility = (typeof transportModeValues)[number];

export const moduleScopeValues = ["core", "advanced"] as const;
export type ModuleScope = (typeof moduleScopeValues)[number];

export const toolCategoryValues = [
  "nodes",
  "cluster",
  "qemu",
  "lxc",
  "storage",
  "backup",
  "tasks",
  "network",
  "firewall",
  "pools",
  "access",
  "templates",
  "monitoring",
  "remote"
] as const;
export type ToolCategory = (typeof toolCategoryValues)[number];

export type ToolShape = Record<string, z.ZodTypeAny>;

export type ToolExecutionContext = {
  client: ProxmoxClient;
  ssh: SshBatchOptions;
  transport: "stdio" | "http";
};

export type ToolDescriptor = {
  name: string;
  title?: string;
  description: string;
  category: ToolCategory;
  module: ModuleScope;
  accessTier: AccessTier;
  destructive: boolean;
  confirmRequired: boolean;
  idempotent: boolean;
  transport: TransportCompatibility;
  aliases?: string[];
  deprecated?: boolean;
  inputShape: ToolShape;
  argGuard?: (args: Record<string, unknown>) => { ok: boolean; message?: string; hint?: string };
  execute: (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<ToolResult<unknown>>;
};

export const tierRank: Record<AccessTier, number> = {
  "read-only": 0,
  "read-execute": 1,
  full: 2
};

export const normalizeToolName = (value: string): string => value.trim();
