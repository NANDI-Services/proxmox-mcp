import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { RuntimeConfig } from "../config/validate.js";
import { registerTools } from "./toolRegistry.js";

export type RunningServer = {
  server: McpServer;
  transport: StdioServerTransport;
};

export const createMcpServer = (config: RuntimeConfig): RunningServer => {
  const server = new McpServer(
    {
      name: "nandi-proxmox-mcp",
      version: "0.1.4"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  registerTools(server, config);

  const transport = new StdioServerTransport();
  return {
    server,
    transport
  };
};

export const startMcpServer = async (config: RuntimeConfig): Promise<RunningServer> => {
  const running = createMcpServer(config);
  await running.server.connect(running.transport);
  return running;
};
