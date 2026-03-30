import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { runtimeConfigSchema, type RuntimeConfig } from "./validate.js";

const maxConfigBytes = 64 * 1024;
const hasControlChars = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

export const defaultConfigPath = (): string => {
  return resolve(process.cwd(), ".nandi-proxmox-mcp", "config.json");
};

const resolveConfigPath = (inputPath: string): string => {
  const trimmed = inputPath.trim();
  if (trimmed.length === 0) {
    throw new Error("NANDI_PROXMOX_CONFIG points to an empty path");
  }

  if (hasControlChars(trimmed)) {
    throw new Error("NANDI_PROXMOX_CONFIG contains control characters");
  }

  return resolve(trimmed);
};

export const loadFileConfig = async (explicitPath?: string): Promise<RuntimeConfig> => {
  const path = resolveConfigPath(explicitPath ?? process.env.NANDI_PROXMOX_CONFIG ?? defaultConfigPath());
  const details = await stat(path);
  if (!details.isFile()) {
    throw new Error(`Config path is not a file: ${path}`);
  }

  if (details.size > maxConfigBytes) {
    throw new Error(`Config file exceeds ${maxConfigBytes} bytes: ${path}`);
  }

  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return runtimeConfigSchema.parse(parsed);
};
