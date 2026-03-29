import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
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

const JSONRPC_INTERNAL_ERROR = {
  jsonrpc: "2.0" as const,
  error: {
    code: -32603,
    message: "Internal server error"
  },
  id: null
};

const JSONRPC_PARSE_ERROR = {
  jsonrpc: "2.0" as const,
  error: {
    code: -32700,
    message: "Parse error: Invalid JSON"
  },
  id: null
};

const JSONRPC_INVALID_REQUEST = {
  jsonrpc: "2.0" as const,
  error: {
    code: -32600,
    message: "Invalid Request: Invalid JSON-RPC message"
  },
  id: null
};

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const WILDCARD_BIND_HOSTS = new Set(["0.0.0.0", "::"]);

const normalizeHost = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return trimmed;
  }

  if (trimmed.startsWith("[")) {
    const closeIndex = trimmed.indexOf("]");
    if (closeIndex > 1) {
      return trimmed.slice(1, closeIndex);
    }
    return trimmed;
  }

  const firstColon = trimmed.indexOf(":");
  const lastColon = trimmed.lastIndexOf(":");
  if (firstColon !== -1 && firstColon === lastColon) {
    return trimmed.slice(0, firstColon);
  }

  return trimmed;
};

const parseHostAllowList = (value: string | undefined, fallbackHosts: string[] = []): Set<string> => {
  const parsed = (value ?? "")
    .split(",")
    .map((entry) => normalizeHost(entry))
    .filter((entry) => entry.length > 0);

  const fallback = fallbackHosts.map((entry) => normalizeHost(entry)).filter((entry) => entry.length > 0);

  return new Set([...LOCALHOST_HOSTS, ...fallback, ...parsed]);
};

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const createServerInstance = (config: RuntimeConfig, transport: "stdio" | "http"): McpServer => {
  const server = new McpServer(
    {
      name: "nandi-proxmox-mcp",
      version: "0.2.2"
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
  const host = process.env.MCP_HOST ?? "0.0.0.0";
  const port = toPort(process.env.MCP_PORT);
  const expectedHost = normalizeHost(host);
  const allowedHosts = parseHostAllowList(process.env.MCP_ALLOWED_HOSTS, [config.proxmoxHost, config.sshHost]);
  const windowMs = toPositiveInt(process.env.MCP_RATE_LIMIT_WINDOW_MS, 60_000);
  const maxRequests = toPositiveInt(process.env.MCP_RATE_LIMIT_MAX, 120);
  const enforceAllowList = WILDCARD_BIND_HOSTS.has(expectedHost);
  const sdkAllowedHosts = enforceAllowList
    ? Array.from(allowedHosts).map((entry) => (entry === "::1" ? "[::1]" : entry))
    : undefined;
  const app = createMcpExpressApp({ host, allowedHosts: sdkAllowedHosts });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const hostHeader = req.headers.host;
    if (!hostHeader || Array.isArray(hostHeader)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: Host header is required"
        },
        id: null
      });
      return;
    }

    const incomingHost = normalizeHost(hostHeader);
    if (incomingHost.length === 0) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: Host header is invalid"
        },
        id: null
      });
      return;
    }

    if (enforceAllowList) {
      if (!allowedHosts.has(incomingHost)) {
        res.status(403).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Forbidden: Host header is not allowed"
          },
          id: null
        });
        return;
      }
      next();
      return;
    }

    if (incomingHost !== expectedHost) {
      res.status(403).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Forbidden: Host header mismatch"
        },
        id: null
      });
      return;
    }

    next();
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, service: "nandi-proxmox-mcp", mode: "http" });
  });

  app.get("/ready", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, ready: true });
  });

  app.use(
    "/mcp",
    rateLimit({
      windowMs,
      max: maxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Too Many Requests"
          },
          id: null
        });
      }
    })
  );

  app.post("/mcp", async (req: Request, res: Response) => {
    const payloadResult = Array.isArray(req.body)
      ? JSONRPCMessageSchema.array().nonempty().safeParse(req.body)
      : JSONRPCMessageSchema.safeParse(req.body);

    if (!payloadResult.success) {
      res.status(400).json(JSONRPC_INVALID_REQUEST);
      return;
    }

    const server = createServerInstance(config, "http");
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, payloadResult.data);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      logger.error("HTTP transport request failed", {
        error: error instanceof Error ? error.message : "unknown"
      });
      if (!res.headersSent) {
        res.status(500).json(JSONRPC_INTERNAL_ERROR);
      }
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;

    logger.error("HTTP middleware error", {
      error: error instanceof Error ? error.message : "unknown"
    });

    if (res.headersSent) {
      return;
    }

    const status = typeof error === "object" && error !== null && "status" in error ? error.status : 500;
    const type = typeof error === "object" && error !== null && "type" in error ? error.type : "";
    if (status === 400 || type === "entity.parse.failed") {
      res.status(400).json(JSONRPC_PARSE_ERROR);
      return;
    }

    res.status(500).json(JSONRPC_INTERNAL_ERROR);
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
