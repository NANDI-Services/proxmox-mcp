export type McpServerEntry = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

export type McpConfigFile = {
  servers: Record<string, McpServerEntry>;
};

export type McpManifest = {
  schema_version: string;
  id: string;
  display_name: string;
  description: string;
  transport: "stdio";
  runtime: McpServerEntry;
  docs: {
    quickstart: string;
    security: string;
    troubleshooting: string;
  };
};

export const serverId = "nandi-proxmox-mcp";

export const buildWorkspaceMcpConfig = (configPath: string): McpConfigFile => ({
  servers: {
    [serverId]: {
      command: "npx",
      args: [serverId, "run"],
      env: {
        NANDI_PROXMOX_CONFIG: configPath
      }
    }
  }
});

export type PolicyEnvOptions = {
  accessTier?: string;
  moduleMode?: string;
};

/**
 * Builds the server entry written into a client's MCP config.
 *
 * PVE_ACCESS_TIER and PVE_MODULE_MODE are read from the environment at
 * registration time and are not part of the JSON runtime config, so emitting
 * them here is the only way a generated config can pin the tool surface.
 * The access tier defaults to `full` inside the server, which is why setup
 * writes it explicitly rather than leaving it implicit.
 */
export const buildServerEntry = (configPath: string, policy: PolicyEnvOptions = {}): McpServerEntry => {
  const env: Record<string, string> = {
    NANDI_PROXMOX_CONFIG: configPath
  };

  if (policy.accessTier) {
    env.PVE_ACCESS_TIER = policy.accessTier;
  }
  if (policy.moduleMode) {
    env.PVE_MODULE_MODE = policy.moduleMode;
  }

  return {
    command: "npx",
    args: [serverId, "run"],
    env
  };
};

export const normalizeMcpConfigDocument = (raw: string): {
  normalized: McpConfigFile;
  migratedLegacy: boolean;
} => {
  const parsed = JSON.parse(raw) as unknown;

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "servers" in parsed &&
    typeof (parsed as { servers: unknown }).servers === "object"
  ) {
    return {
      normalized: parsed as McpConfigFile,
      migratedLegacy: false
    };
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "mcp" in parsed &&
    typeof (parsed as { mcp: unknown }).mcp === "object" &&
    (parsed as { mcp: { servers?: unknown } }).mcp.servers &&
    typeof (parsed as { mcp: { servers: unknown } }).mcp.servers === "object"
  ) {
    return {
      normalized: {
        servers: (parsed as { mcp: { servers: Record<string, McpServerEntry> } }).mcp.servers
      },
      migratedLegacy: true
    };
  }

  throw new Error("Invalid MCP config JSON structure. Expected `servers` at root.");
};

export type McpConfigRootKey = "servers" | "mcpServers";

export type ValidateMcpConfigOptions = {
  /** `servers` for VS Code, `mcpServers` for Claude Code. */
  rootKey?: McpConfigRootKey;
  /**
   * When true (the default, used for configs this tool generates) the launcher
   * must be exactly `npx nandi-proxmox-mcp run`. Reading a user's existing file
   * should pass false: `node dist/...`, `docker run` and `pnpm dlx` are all
   * legitimate ways to launch the server, and rejecting them would make
   * `doctor` fail on a perfectly working setup.
   */
  strictLauncher?: boolean;
  /** Which server key to validate. Defaults to the single-instance name. */
  serverKey?: string;
};

export const validateMcpConfig = (
  value: unknown,
  options: ValidateMcpConfigOptions = {}
): { ok: boolean; errors: string[]; warnings: string[] } => {
  const rootKey = options.rootKey ?? "servers";
  const strictLauncher = options.strictLauncher ?? true;
  const key = options.serverKey ?? serverId;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof value !== "object" || value === null) {
    return { ok: false, errors: ["MCP config must be a JSON object."], warnings };
  }

  const root = (value as Record<string, unknown>)[rootKey];
  if (typeof root !== "object" || root === null) {
    errors.push(`Missing \`${rootKey}\` object in MCP config root.`);
    return { ok: false, errors, warnings };
  }

  const servers = root as Record<string, unknown>;
  const nandi = servers[key];
  if (!nandi || typeof nandi !== "object") {
    errors.push(`Missing '${key}' server entry under ${rootKey}.`);
    return { ok: false, errors, warnings };
  }

  const entry = nandi as Partial<McpServerEntry>;

  if (typeof entry.command !== "string" || entry.command.length === 0) {
    errors.push("Server `command` must be a non-empty string.");
  } else if (entry.command !== "npx") {
    const message = "Server command is not `npx`.";
    if (strictLauncher) {
      errors.push(message);
    } else {
      warnings.push(`${message} That is supported, but not the documented default.`);
    }
  }

  if (!Array.isArray(entry.args)) {
    errors.push("Server `args` must be an array.");
  } else if (entry.args[0] !== serverId || entry.args[1] !== "run") {
    const message = "Server args are not ['nandi-proxmox-mcp','run'].";
    if (strictLauncher) {
      errors.push(message);
    } else {
      warnings.push(`${message} That is supported, but not the documented default.`);
    }
  }

  if (!entry.env || typeof entry.env.NANDI_PROXMOX_CONFIG !== "string" || entry.env.NANDI_PROXMOX_CONFIG.length < 3) {
    errors.push("env.NANDI_PROXMOX_CONFIG is required and must be a valid path string.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
};

export const validateMcpManifest = (value: unknown): { ok: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) {
    return { ok: false, errors: ["Manifest must be a JSON object."] };
  }

  const manifest = value as Partial<McpManifest>;
  if (manifest.schema_version !== "1.0") errors.push("schema_version must be '1.0'.");
  if (manifest.id !== serverId) errors.push(`id must be '${serverId}'.`);
  if (manifest.transport !== "stdio") errors.push("transport must be 'stdio'.");
  if (!manifest.runtime || manifest.runtime.command !== "npx") errors.push("runtime.command must be 'npx'.");
  if (!manifest.runtime || !Array.isArray(manifest.runtime.args) || manifest.runtime.args[0] !== serverId || manifest.runtime.args[1] !== "run") {
    errors.push("runtime.args must start with ['nandi-proxmox-mcp','run'].");
  }
  if (!manifest.docs?.quickstart || !manifest.docs?.security || !manifest.docs?.troubleshooting) {
    errors.push("docs.quickstart/security/troubleshooting are required.");
  }

  return { ok: errors.length === 0, errors };
};
