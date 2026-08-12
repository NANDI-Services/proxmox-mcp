import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { runtimeConfigSchema, type RuntimeConfig } from "./validate.js";
import { findInstances, LEGACY_CONFIG_FILENAME, type InstanceRef } from "./instances.js";

const maxConfigBytes = 64 * 1024;
const hasControlChars = (value: string): boolean =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

export const defaultConfigPath = (): string => {
  return resolve(process.cwd(), ".nandi-proxmox-mcp", LEGACY_CONFIG_FILENAME);
};

const isFile = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

/**
 * Works out which credentials file to use when nobody said.
 *
 * `NANDI_PROXMOX_CONFIG` is still the explicit answer and always wins. Without
 * it, the server used to look only at the legacy `config.json` name, which the
 * multi-instance layout stopped writing -- so any launcher that could not
 * hardcode an absolute path (a published client plugin, for one) simply failed
 * to start. Discovering the instance instead is what lets a client config be
 * portable between machines.
 *
 * Ambiguity is an error rather than a guess: picking one of two Proxmox
 * clusters on the model's behalf is exactly the decision that must not be made
 * silently.
 */
export const chooseConfigPath = (instances: InstanceRef[]): string => {
  // Project scope wins outright, matching `resolveInstanceByName`. Without this
  // precedence, anyone with two user-scope instances -- the normal state for an
  // admin running a production cluster and a lab -- would get an ambiguity
  // error in every directory, including projects that configured exactly one.
  const projectScoped = instances.filter((instance) => instance.scope === "project");
  const candidates = projectScoped.length > 0 ? projectScoped : instances;

  const only = candidates[0];
  if (candidates.length === 1 && only) {
    return only.configPath;
  }

  if (candidates.length === 0) {
    throw new Error(
      "No Proxmox connection is configured yet. Run `npx nandi-proxmox-mcp setup` " +
        "(or `npx nandi-proxmox-mcp bootstrap` first if you still need an API token)."
    );
  }

  const names = candidates.map((instance) => instance.name).join(", ");
  throw new Error(
    `More than one Proxmox is configured (${names}), so there is no single default. ` +
      "Point NANDI_PROXMOX_CONFIG at the one you want -- `npx nandi-proxmox-mcp list` prints each path."
  );
};

export const discoverConfigPath = async (cwd: string = process.cwd()): Promise<string> => {
  // Pre-instances installs keep working untouched.
  const legacy = resolve(cwd, ".nandi-proxmox-mcp", LEGACY_CONFIG_FILENAME);
  if (await isFile(legacy)) {
    return legacy;
  }

  return chooseConfigPath(await findInstances(cwd));
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
  const stated = explicitPath ?? process.env.NANDI_PROXMOX_CONFIG;
  const path = resolveConfigPath(stated ?? (await discoverConfigPath()));
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
