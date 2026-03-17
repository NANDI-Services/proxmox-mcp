import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runtimeConfigSchema, type RuntimeConfig } from "./validate.js";

export const defaultConfigPath = (): string => {
  return resolve(process.cwd(), ".nandi-proxmox-mcp", "config.json");
};

export const loadFileConfig = async (explicitPath?: string): Promise<RuntimeConfig> => {
  const path = explicitPath ?? process.env.NANDI_PROXMOX_CONFIG ?? defaultConfigPath();
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return runtimeConfigSchema.parse(parsed);
};
