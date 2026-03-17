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

export const validateMcpConfig = (value: unknown): { ok: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (typeof value !== "object" || value === null) {
    return { ok: false, errors: ["MCP config must be a JSON object."] };
  }

  if (!("servers" in value) || typeof (value as { servers?: unknown }).servers !== "object" || (value as { servers?: unknown }).servers === null) {
    errors.push("Missing `servers` object in MCP config root.");
    return { ok: false, errors };
  }

  const servers = (value as { servers: Record<string, unknown> }).servers;
  const nandi = servers[serverId];
  if (!nandi || typeof nandi !== "object") {
    errors.push(`Missing '${serverId}' server entry under servers.`);
    return { ok: false, errors };
  }

  const entry = nandi as Partial<McpServerEntry>;
  if (entry.command !== "npx") {
    errors.push("Server command should be `npx`.");
  }
  if (!Array.isArray(entry.args) || entry.args[0] !== serverId || entry.args[1] !== "run") {
    errors.push("Server args should be ['nandi-proxmox-mcp','run'].");
  }
  if (!entry.env || typeof entry.env.NANDI_PROXMOX_CONFIG !== "string" || entry.env.NANDI_PROXMOX_CONFIG.length < 3) {
    errors.push("env.NANDI_PROXMOX_CONFIG is required and must be a valid path string.");
  }

  return {
    ok: errors.length === 0,
    errors
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
