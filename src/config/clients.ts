import { resolve } from "node:path";
import {
  serverId,
  validateMcpConfig,
  type McpConfigRootKey,
  type McpServerEntry
} from "./installDescriptor.js";

/**
 * Client adapters.
 *
 * Every MCP client stores the same information in a slightly different place
 * and shape: Claude Code uses `.mcp.json` with a `mcpServers` root, VS Code
 * uses `.vscode/mcp.json` with a `servers` root. Isolating those differences
 * here keeps `setup` and `doctor` free of per-client branching, and adding
 * Codex or Cursor later is a matter of appending one entry.
 */

export const clientIds = ["claude-code", "vscode"] as const;
export type ClientId = (typeof clientIds)[number];

export type McpClientDocument = Record<string, unknown>;

export type ClientAdapter = {
  id: ClientId;
  label: string;
  rootKey: McpConfigRootKey;
  /** Relative to the project root, so callers can inject a cwd for testing. */
  relativePath: string;
  targetPath: (cwd: string) => string;
  /** Documentation note printed after setup writes the file. */
  note?: string;
};

export const clientAdapters: Record<ClientId, ClientAdapter> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    rootKey: "mcpServers",
    relativePath: ".mcp.json",
    targetPath: (cwd) => resolve(cwd, ".mcp.json"),
    note: "`.mcp.json` is meant to be committed and shared. It contains only a path and policy settings; your token stays in .nandi-proxmox-mcp/config.json, which is gitignored."
  },
  vscode: {
    id: "vscode",
    label: "VS Code",
    rootKey: "servers",
    relativePath: ".vscode/mcp.json",
    targetPath: (cwd) => resolve(cwd, ".vscode", "mcp.json")
  }
};

export const defaultClientIds: ClientId[] = ["claude-code", "vscode"];

export const isClientId = (value: string): value is ClientId =>
  (clientIds as readonly string[]).includes(value);

export const parseClientIds = (csv: string): ClientId[] => {
  const requested = csv
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const invalid = requested.filter((item) => !isClientId(item));
  if (invalid.length > 0) {
    throw new Error(
      `Unknown client id(s): ${invalid.join(", ")}. Valid ids: ${clientIds.join(", ")}.`
    );
  }

  return requested as ClientId[];
};

/**
 * Merges the server entry into an existing document without disturbing
 * anything else. A client config routinely holds other servers and unrelated
 * top-level keys, so replacing the file wholesale would destroy user data.
 */
export const mergeServerEntry = (
  doc: McpClientDocument | undefined,
  rootKey: McpConfigRootKey,
  entry: McpServerEntry,
  serverKey: string = serverId
): McpClientDocument => {
  const next: McpClientDocument = { ...(doc ?? {}) };
  const existing = next[rootKey];
  const servers: Record<string, unknown> =
    typeof existing === "object" && existing !== null ? { ...(existing as Record<string, unknown>) } : {};

  servers[serverKey] = entry;
  next[rootKey] = servers;
  return next;
};

export const serializeClientDocument = (doc: McpClientDocument): string =>
  `${JSON.stringify(doc, null, 2)}\n`;

export const validateForClient = (
  adapter: ClientAdapter,
  doc: unknown,
  options: { strictLauncher?: boolean; serverKey?: string } = {}
): { ok: boolean; errors: string[]; warnings: string[] } =>
  validateMcpConfig(doc, {
    rootKey: adapter.rootKey,
    strictLauncher: options.strictLauncher,
    serverKey: options.serverKey
  });

/**
 * Renders a paste-ready config block for any MCP client, including ones this
 * package does not write directly.
 */
export const renderGenericConfig = (entry: McpServerEntry, serverKey: string = serverId): string => {
  const envLines = Object.entries(entry.env ?? {})
    .map(([key, value]) => `  ${key}=${value}`)
    .join("\n");

  const claudeCode = serializeClientDocument({ mcpServers: { [serverKey]: entry } });
  const vscode = serializeClientDocument({ servers: { [serverKey]: entry } });

  return [
    "# Claude Code  ->  .mcp.json (project root)",
    claudeCode.trimEnd(),
    "",
    "# VS Code  ->  .vscode/mcp.json",
    vscode.trimEnd(),
    "",
    "# Any client that takes a command plus environment variables:",
    `  command: ${entry.command}`,
    `  args:    ${entry.args.join(" ")}`,
    "  env:",
    envLines.length > 0 ? envLines : "  (none)",
    ""
  ].join("\n");
};
