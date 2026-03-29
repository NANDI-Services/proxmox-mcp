import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { RuntimeConfig } from "../config/validate.js";
import { registerTools } from "./toolRegistry.js";
import { logger } from "../logging/logger.js";

export type RunningServer = {
  mode: "stdio" | "http";
  http?: {
    host: string;
    port: number;
    path: string;
  };
  close: () => Promise<void>;
};

const createServerInstance = (config: RuntimeConfig, transport: "stdio" | "http"): McpServer => {
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

  registerTools(server, config, { transport });
  return server;
};

const startStdioServer = async (config: RuntimeConfig): Promise<RunningServer> => {
  const server = createServerInstance(config, "stdio");
  const transport = new StdioServerTransport();
  await server.connect(transport);

  return {
    mode: "stdio",
    close: async () => {
      await server.close();
    }
  };
};

const toPort = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? "3000", 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 65535) {
    return 3000;
  }
  return parsed;
};

const startHttpServer = async (config: RuntimeConfig): Promise<RunningServer> => {
  const app = createMcpExpressApp();
  const host = process.env.MCP_HOST ?? "0.0.0.0";
  const port = toPort(process.env.MCP_PORT);

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, service: "nandi-proxmox-mcp", mode: "http" });
  });

  app.get("/ready", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, ready: true });
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createServerInstance(config, "http");
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      logger.error("HTTP transport request failed", {
        error: error instanceof Error ? error.message : "unknown"
      });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    }
  });

  const listener = await new Promise<HttpServer>((resolve, reject) => {
    const created = app.listen(port, host, () => resolve(created));
    created.on("error", (error: unknown) => reject(error));
  });

  const address = listener.address() as AddressInfo | string | null;
  const boundPort = typeof address === "object" && address ? address.port : port;
  logger.info("HTTP MCP transport listening", { host, port: boundPort, path: "/mcp" });

  return {
    mode: "http",
    http: {
      host,
      port: boundPort,
      path: "/mcp"
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        listener.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
};

export const startMcpServer = async (config: RuntimeConfig): Promise<RunningServer> => {
  const transport = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
  if (transport === "http") {
    return await startHttpServer(config);
  }

  return await startStdioServer(config);
};
