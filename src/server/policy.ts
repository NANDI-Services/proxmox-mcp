import { z } from "zod";
import {
  accessTierValues,
  moduleScopeValues,
  normalizeToolName,
  tierRank,
  toolCategoryValues,
  type AccessTier,
  type ToolDescriptor
} from "./toolMetadata.js";

const parseCsv = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
};

const accessTierSchema = z.enum(accessTierValues).default("full");
const moduleSchema = z.enum(moduleScopeValues).default("core");

export type PolicySettings = {
  accessTier: AccessTier;
  categoryAllowlist: string[];
  toolBlacklist: string[];
  toolWhitelist: string[];
  moduleMode: "core" | "advanced";
};

export const loadPolicySettings = (): PolicySettings => {
  return {
    accessTier: accessTierSchema.parse(process.env.PVE_ACCESS_TIER),
    categoryAllowlist: parseCsv(process.env.PVE_CATEGORIES).map((item) => item.toLowerCase()),
    toolBlacklist: parseCsv(process.env.PVE_TOOL_BLACKLIST).map(normalizeToolName),
    toolWhitelist: parseCsv(process.env.PVE_TOOL_WHITELIST).map(normalizeToolName),
    moduleMode: moduleSchema.parse(process.env.PVE_MODULE_MODE)
  };
};

export type ConfirmGuard = {
  ok: boolean;
  message?: string;
  impact?: string;
};

export class PolicyEngine {
  public constructor(private readonly settings: PolicySettings) {}

  public shouldRegister(descriptor: ToolDescriptor, transport: "stdio" | "http"): boolean {
    if (!this.isTransportCompatible(descriptor.transport, transport)) {
      return false;
    }

    if (this.settings.moduleMode === "core" && descriptor.module === "advanced") {
      return false;
    }

    if (this.settings.toolWhitelist.length > 0) {
      return this.settings.toolWhitelist.includes(descriptor.name);
    }

    if (tierRank[descriptor.accessTier] > tierRank[this.settings.accessTier]) {
      return false;
    }

    if (this.settings.categoryAllowlist.length > 0 && !this.settings.categoryAllowlist.includes(descriptor.category)) {
      return false;
    }

    if (this.settings.toolBlacklist.includes(descriptor.name)) {
      return false;
    }

    return true;
  }

  public guardConfirmation(descriptor: ToolDescriptor, args: Record<string, unknown>): ConfirmGuard {
    if (!descriptor.confirmRequired) {
      return { ok: true };
    }

    if (args.confirm === true) {
      return { ok: true };
    }

    return {
      ok: false,
      message: `Tool '${descriptor.name}' requires explicit confirmation.`,
      impact: descriptor.destructive
        ? "This operation is destructive and may modify or remove existing resources."
        : "This operation may alter cluster state."
    };
  }

  private isTransportCompatible(value: ToolDescriptor["transport"], transport: "stdio" | "http"): boolean {
    if (value === "both") {
      return true;
    }

    return value === transport;
  }
}

export const isKnownToolCategory = (value: string): value is (typeof toolCategoryValues)[number] => {
  return (toolCategoryValues as readonly string[]).includes(value);
};
