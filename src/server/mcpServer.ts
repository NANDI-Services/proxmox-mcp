import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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

const JSONRPC_REQUEST_TOO_LARGE = {
  jsonrpc: "2.0" as const,
  error: {
    code: -32000,
    message: "Request entity too large"
  },
  id: null
};

const JSONRPC_METHOD_NOT_ALLOWED = {
  jsonrpc: "2.0" as const,
  error: {
    code: -32000,
    message: "Method not allowed"
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

const normalizeOrigin = (value: string): string | null => {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
};

const formatHostHeaderValue = (host: string): string => {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
};

const buildAllowedOrigins = (value: string | undefined, hosts: Set<string>): Set<string> => {
  const parsed = (value ?? "")
    .split(",")
    .map((entry) => normalizeOrigin(entry.trim()))
    .filter((entry): entry is string => entry !== null);

  const fallback: string[] = [];
  for (const host of hosts) {
    const normalizedHost = formatHostHeaderValue(host);
    fallback.push(`http://${normalizedHost}`.toLowerCase());
    fallback.push(`https://${normalizedHost}`.toLowerCase());
  }

  return new Set([...fallback, ...parsed]);
};

const buildAllowedHostHeaderValues = (hosts: Set<string>, port: number): Set<string> => {
  const values = new Set<string>();
  for (const host of hosts) {
    const formattedHost = formatHostHeaderValue(host);
    values.add(formattedHost);
    values.add(`${formattedHost}:${port}`);
  }
  return values;
};

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const toPort = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? "3000", 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 65535) {
    return 3000;
  }
  return parsed;
};

const createServerInstance = (config: RuntimeConfig, transport: "stdio" | "http"): McpServer => {
  const server = new McpServer(
    {
      name: "nandi-proxmox-mcp",
      version: "0.2.4"
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

const requestContext = (req: Request): Record<string, unknown> => ({
  method: req.method,
  path: req.path,
  remoteAddress: req.ip || req.socket.remoteAddress || "unknown"
});

const startHttpServer = async (config: RuntimeConfig): Promise<RunningServer> => {
  const host = process.env.MCP_HOST ?? "0.0.0.0";
  const port = toPort(process.env.MCP_PORT);
  const expectedHost = normalizeHost(host);
  const allowedHosts = parseHostAllowList(process.env.MCP_ALLOWED_HOSTS, [config.proxmoxHost, config.sshHost]);
  const allowedOrigins = buildAllowedOrigins(process.env.MCP_ALLOWED_ORIGINS, allowedHosts);
  const windowMs = toPositiveInt(process.env.MCP_RATE_LIMIT_WINDOW_MS, 60_000);
  const maxRequests = toPositiveInt(process.env.MCP_RATE_LIMIT_MAX, 120);
  const maxBodyBytes = toPositiveInt(process.env.MCP_MAX_BODY_SIZE_BYTES, 256 * 1024);
  const headersTimeoutMs = toPositiveInt(process.env.MCP_HEADERS_TIMEOUT_MS, 15_000);
  const requestTimeoutMs = toPositiveInt(process.env.MCP_REQUEST_TIMEOUT_MS, 120_000);
  const keepAliveTimeoutMs = toPositiveInt(process.env.MCP_KEEPALIVE_TIMEOUT_MS, 5_000);
  const maxHeadersCount = toPositiveInt(process.env.MCP_MAX_HEADERS_COUNT, 64);
  const enforceAllowList = WILDCARD_BIND_HOSTS.has(expectedHost);
  let boundPort = port;

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers["content-length"];
    const parsedContentLength = typeof contentLength === "string" ? Number.parseInt(contentLength, 10) : Number.NaN;
    if (Number.isFinite(parsedContentLength) && parsedContentLength > maxBodyBytes) {
      logger.warn("Rejected oversized MCP request before parsing", {
        ...requestContext(req),
        contentLength: parsedContentLength,
        maxBodyBytes
      });
      res.status(413).json(JSONRPC_REQUEST_TOO_LARGE);
      return;
    }

    next();
  });

  app.use(
    express.json({
      limit: maxBodyBytes,
      strict: true
    })
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    const hostHeader = req.headers.host;
    if (!hostHeader || Array.isArray(hostHeader)) {
      logger.warn("Rejected request without a valid Host header", requestContext(req));
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
      logger.warn("Rejected request with invalid Host header", {
        ...requestContext(req),
        hostHeader
      });
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
        logger.warn("Rejected request due to Host allowlist violation", {
          ...requestContext(req),
          hostHeader
        });
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
    } else if (incomingHost !== expectedHost) {
      logger.warn("Rejected request due to Host header mismatch", {
        ...requestContext(req),
        hostHeader,
        expectedHost
      });
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

    const originHeader = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    if (originHeader) {
      const normalizedOrigin = normalizeOrigin(originHeader);
      if (!normalizedOrigin || !allowedOrigins.has(normalizedOrigin)) {
        logger.warn("Rejected request due to Origin validation failure", {
          ...requestContext(req),
          origin: originHeader
        });
        res.status(403).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Forbidden: Origin header is not allowed"
          },
          id: null
        });
        return;
      }
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
      handler: (req, res) => {
        logger.warn("Rate limit exceeded for /mcp", requestContext(req));
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
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      allowedHosts: Array.from(buildAllowedHostHeaderValues(allowedHosts, boundPort)),
      enableDnsRebindingProtection: true
    });
    transport.onerror = (error) => {
      logger.warn("MCP transport emitted an HTTP error", {
        ...requestContext(req),
        error: error instanceof Error ? error.message : "unknown"
      });
    };

    try {
      await server.connect(transport);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await transport.handleRequest(req, res, payloadResult.data);
    } catch (error) {
      logger.error("HTTP transport request failed", {
        ...requestContext(req),
        error: error instanceof Error ? error.message : "unknown"
      });
      if (!res.headersSent) {
        res.status(500).json(JSONRPC_INTERNAL_ERROR);
      }
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  });

  app.all("/mcp", (_req: Request, res: Response) => {
    res.status(405).json(JSONRPC_METHOD_NOT_ALLOWED);
  });

  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    void next;

    logger.error("HTTP middleware error", {
      ...requestContext(req),
      error: error instanceof Error ? error.message : "unknown"
    });

    if (res.headersSent) {
      return;
    }

    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
    const type = typeof error === "object" && error !== null && "type" in error ? String(error.type) : "";
    if (status === 413 || type === "entity.too.large") {
      res.status(413).json(JSONRPC_REQUEST_TOO_LARGE);
      return;
    }

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
  boundPort = typeof address === "object" && address ? address.port : port;
  listener.maxHeadersCount = maxHeadersCount;
  listener.keepAliveTimeout = keepAliveTimeoutMs;
  listener.headersTimeout = headersTimeoutMs;
  listener.requestTimeout = requestTimeoutMs;
  listener.setTimeout(requestTimeoutMs);

  logger.info("HTTP MCP transport listening", {
    host,
    port: boundPort,
    path: "/mcp",
    maxBodyBytes,
    maxRequests,
    windowMs
  });

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
