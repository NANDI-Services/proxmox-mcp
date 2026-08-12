import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * Instances: one Proxmox connection per MCP server process.
 *
 * An admin usually has more than one Proxmox to talk to -- a production
 * cluster and a lab box, say. Each gets its own instance, which means its own
 * credentials file and its own entry in the client config, so the two never
 * share a process. That process boundary is the isolation: the lab server
 * simply has no way to reach the production cluster's token.
 *
 * The alternative -- one server with a `target` argument on every tool -- would
 * put both sets of credentials in one process and make "which cluster did that
 * delete run against?" a question the model answers, not the operating system.
 */

export const DEFAULT_INSTANCE_NAME = "proxmox";

/** Legacy single-instance layout, still read so existing installs keep working. */
export const LEGACY_CONFIG_FILENAME = "config.json";

export type InstanceScope = "project" | "user";

export type InstanceRef = {
  name: string;
  scope: InstanceScope;
  configPath: string;
  /** Key used for this instance in the client config, and the tool prefix. */
  serverKey: string;
};

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * Turns anything an admin might type -- or a cluster name discovered from the
 * API -- into a usable instance name, so nobody has to know the rules.
 */
export const sanitizeInstanceName = (raw: string): string => {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[-.]+$/, "")
    .slice(0, 64);

  return cleaned.length > 0 ? cleaned : DEFAULT_INSTANCE_NAME;
};

export const assertValidInstanceName = (name: string): void => {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid instance name "${name}". Use lowercase letters, digits, dot, dash or underscore, ` +
        "starting with a letter or digit (for example: production-cluster)."
    );
  }
};

export const configDirFor = (scope: InstanceScope, cwd: string): string =>
  scope === "user" ? resolve(homedir(), ".nandi-proxmox-mcp") : resolve(cwd, ".nandi-proxmox-mcp");

export const instanceRef = (name: string, scope: InstanceScope, cwd: string): InstanceRef => {
  assertValidInstanceName(name);
  return {
    name,
    scope,
    configPath: resolve(configDirFor(scope, cwd), `${name}.json`),
    serverKey: name
  };
};

/**
 * Lists configured instances, project scope first. Used by `list` and to give
 * a useful error when `--name` does not match anything.
 */
export const findInstances = async (cwd: string): Promise<InstanceRef[]> => {
  const { readdir } = await import("node:fs/promises");
  const found: InstanceRef[] = [];

  for (const scope of ["project", "user"] as const) {
    const dir = configDirFor(scope, cwd);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".json")) {
        continue;
      }

      const name = entry.slice(0, -".json".length);
      if (entry === LEGACY_CONFIG_FILENAME) {
        found.push(legacyInstanceRef(cwd));
        continue;
      }
      if (!NAME_PATTERN.test(name)) {
        continue;
      }

      found.push({ name, scope, configPath: resolve(dir, entry), serverKey: name });
    }
  }

  return found;
};

/** Resolves a named instance, preferring project scope over user scope. */
export const resolveInstanceByName = async (name: string, cwd: string): Promise<InstanceRef> => {
  const instances = await findInstances(cwd);
  const match = instances.find((instance) => instance.name === name);
  if (match) {
    return match;
  }

  const available = instances.map((instance) => instance.name);
  throw new Error(
    available.length > 0
      ? `No Proxmox instance named "${name}". Configured: ${available.join(", ")}.`
      : `No Proxmox instance named "${name}", and none are configured yet. Run \`nandi-proxmox-mcp setup\`.`
  );
};

/** The pre-instances layout: `.nandi-proxmox-mcp/config.json` keyed as the package name. */
export const legacyInstanceRef = (cwd: string): InstanceRef => ({
  name: "nandi-proxmox-mcp",
  scope: "project",
  configPath: resolve(configDirFor("project", cwd), LEGACY_CONFIG_FILENAME),
  serverKey: "nandi-proxmox-mcp"
});
