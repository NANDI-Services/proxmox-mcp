import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../../src/server/toolRegistry.js";
import { registerPrompts } from "../../src/server/prompts.js";
import type { RuntimeConfig } from "../../src/config/validate.js";

/**
 * A server wired exactly like the real one, pointed at nowhere.
 *
 * Registration builds a ProxmoxClient but never calls it, so this is safe
 * without a Proxmox or an emulator behind it -- enough to exercise anything
 * that happens at connect time, such as what the server advertises.
 */
export const unreachableConfig = (): RuntimeConfig => ({
  proxmoxHost: "127.0.0.1",
  proxmoxPort: 8006,
  proxmoxUser: "mcp",
  proxmoxRealm: "pve",
  tokenName: "nandi",
  // Deliberately word-shaped rather than hex. The schema only requires ten
  // characters, and a random-looking literal next to a key called
  // `tokenSecret` is what the CI secret scanner's generic-api-key rule exists
  // to catch -- it cannot tell a placeholder from the real thing, and it is
  // right not to try.
  tokenSecret: "placeholder-not-a-real-secret",
  allowInsecureTls: true,
  sshHost: "127.0.0.1",
  sshPort: 22,
  sshUser: "root",
  sshKeyPath: "/dev/null",
  sshStrategy: "disabled"
});

export const startMcpServerForTest = (config: RuntimeConfig = unreachableConfig()): McpServer => {
  const server = new McpServer(
    { name: "nandi-proxmox-mcp-test", version: "0.0.0-test" },
    { capabilities: { tools: {}, prompts: {} } }
  );

  const registeredTools = registerTools(server, config, { transport: "stdio" });
  registerPrompts(server, registeredTools);

  return server;
};
