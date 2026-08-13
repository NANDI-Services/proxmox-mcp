import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../../src/server/toolRegistry.js";
import type { RuntimeConfig } from "../../src/config/validate.js";
import type { ToolResult } from "../../src/guardian/result.js";
import type { EmulatorHandle } from "./globalSetup.js";

/**
 * Drives the real MCP server in-process: registerTools -> PolicyEngine ->
 * runGuarded -> ProxmoxClient -> HTTPS to the emulator. Using the SDK's
 * in-memory transport keeps the protocol layer real without needing to parse
 * SSE frames, which the streamable HTTP transport would require.
 */
export type Harness = {
  callTool: (name: string, args?: Record<string, unknown>) => Promise<ToolResult<unknown>>;
  listToolNames: () => Promise<string[]>;
  close: () => Promise<void>;
};

export const buildRuntimeConfig = (emulator: EmulatorHandle): RuntimeConfig => ({
  proxmoxHost: "127.0.0.1",
  proxmoxPort: emulator.apiPort,
  proxmoxUser: emulator.tokenUser,
  proxmoxRealm: emulator.tokenRealm,
  tokenName: emulator.tokenName,
  tokenSecret: emulator.tokenSecret,
  // The emulator serves a self-signed certificate, exactly like a stock
  // Proxmox install. Tests that assert TLS behaviour flip this off.
  allowInsecureTls: true,
  sshHost: "127.0.0.1",
  sshPort: emulator.sshPort,
  sshUser: "root",
  sshKeyPath: emulator.keyPath,
  sshStrategy: "auto",
  // The entry host is node pve01, so guests there need no routing at all.
  sshNodeName: "pve01"
});

export const startHarness = async (config: RuntimeConfig): Promise<Harness> => {
  // loadPolicySettings reads process.env at registration time; the emulator
  // suite needs the full surface including the advanced remote-exec module.
  process.env.PVE_ACCESS_TIER = "full";
  process.env.PVE_MODULE_MODE = "advanced";

  const server = new McpServer({ name: "nandi-proxmox-mcp-e2e", version: "0.0.0-test" });
  registerTools(server, config, { transport: "stdio" });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "e2e-harness", version: "0.0.0-test" });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    callTool: async (name, args = {}) => {
      const response = await client.callTool({ name, arguments: args });
      const content = (response.content ?? []) as Array<{ type: string; text?: string }>;
      const first = content[0];
      if (!first || first.type !== "text" || typeof first.text !== "string") {
        throw new Error(`Tool ${name} returned no text content`);
      }

      // A protocol-level rejection (bad arguments, unknown tool) is not a
      // ToolResult; surface its text so the failure is readable.
      if (response.isError) {
        throw new Error(`Tool ${name} was rejected by the MCP layer: ${first.text}`);
      }

      return JSON.parse(first.text) as ToolResult<unknown>;
    },
    listToolNames: async () => {
      const listed = await client.listTools();
      return listed.tools.map((tool) => tool.name);
    },
    close: async () => {
      await client.close();
      await server.close();
    }
  };
};

/**
 * Arms a fault on the emulator's control plane. Each fault is consumed by the
 * next matching request.
 */
export const armFault = async (
  emulator: EmulatorHandle,
  mode: string,
  options: { count?: number; pathPrefix?: string } = {}
): Promise<void> => {
  const body = new URLSearchParams({
    mode,
    count: String(options.count ?? 1),
    pathPrefix: options.pathPrefix ?? ""
  });

  const response = await fetch(`http://127.0.0.1:${emulator.ctrlPort}/_control/fault`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!response.ok) {
    throw new Error(`Failed to arm fault ${mode}: HTTP ${response.status}`);
  }
};

export const resetEmulator = async (emulator: EmulatorHandle): Promise<void> => {
  const response = await fetch(`http://127.0.0.1:${emulator.ctrlPort}/_control/reset`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Failed to reset emulator: HTTP ${response.status}`);
  }
};

/**
 * Polls a Proxmox task to completion, the way a real operator would after a
 * mutation returns a UPID.
 */
export const waitForTask = async (
  harness: Harness,
  node: string,
  upid: string,
  timeoutMs = 15_000
): Promise<Record<string, unknown>> => {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const result = await harness.callTool("pve_get_task_status", { node, upid });
    if (!result.ok) {
      throw new Error(`Task status failed: ${result.error?.code} ${result.error?.message}`);
    }

    const data = result.data as Record<string, unknown>;
    if (data.status === "stopped") {
      return data;
    }

    if (Date.now() > deadline) {
      throw new Error(`Task ${upid} did not finish within ${timeoutMs}ms`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
