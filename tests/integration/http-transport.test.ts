import { request as httpRequest } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startMcpServer } from "../../src/server/mcpServer.js";
import type { RuntimeConfig } from "../../src/config/validate.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

const fakeConfig: RuntimeConfig = {
  proxmoxHost: "pve.local",
  proxmoxPort: 8006,
  proxmoxUser: "svc_mcp",
  proxmoxRealm: "pve",
  tokenName: "nandi",
  tokenSecret: "secretsecret",
  allowInsecureTls: false,
  sshHost: "pve.local",
  sshPort: 22,
  sshUser: "root",
  sshKeyPath: "C:/id_ed25519"
};

type RawHttpResponse = {
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
};

const sendRawHttpRequest = (args: {
  port: number;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<RawHttpResponse> => {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: args.port,
        path: args.path,
        method: args.method ?? "GET",
        headers: args.headers
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers
          });
        });
      }
    );

    req.on("error", (error: unknown) => reject(error));
    if (args.body !== undefined) {
      req.write(args.body);
    }
    req.end();
  });
};

describe("http transport", () => {
  it("exposes health and readiness endpoints", async () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.MCP_HOST = "127.0.0.1";
    process.env.MCP_PORT = "0";

    const running = await startMcpServer(fakeConfig);
    expect(running.mode).toBe("http");
    expect(running.http).toBeDefined();

    const base = `http://${running.http?.host}:${running.http?.port}`;
    const healthRes = await fetch(`${base}/health`);
    const readyRes = await fetch(`${base}/ready`);

    expect(healthRes.status).toBe(200);
    expect(readyRes.status).toBe(200);

    const healthJson = (await healthRes.json()) as { ok: boolean; mode: string };
    const readyJson = (await readyRes.json()) as { ok: boolean; ready: boolean };

    expect(healthJson.ok).toBe(true);
    expect(healthJson.mode).toBe("http");
    expect(readyJson.ok).toBe(true);
    expect(readyJson.ready).toBe(true);

    await running.close();
  });

  it("rejects host header mismatches", async () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.MCP_HOST = "127.0.0.1";
    process.env.MCP_PORT = "0";

    const running = await startMcpServer(fakeConfig);
    const response = await sendRawHttpRequest({
      port: running.http?.port ?? 0,
      path: "/health",
      headers: {
        Host: "evil.example"
      }
    });

    expect(response.status).toBe(403);
    const payload = JSON.parse(response.body) as { error?: { message?: string } };
    expect(payload.error?.message?.toLowerCase()).toContain("host");

    await running.close();
  });

  it("returns sanitized JSON parse errors for malformed request bodies", async () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.MCP_HOST = "127.0.0.1";
    process.env.MCP_PORT = "0";

    const running = await startMcpServer(fakeConfig);
    const base = `http://${running.http?.host}:${running.http?.port}`;

    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: "{"
    });

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type") ?? "").toContain("application/json");

    const payload = (await res.json()) as { error: { code: number; message: string } };
    expect(payload.error.code).toBe(-32700);
    expect(payload.error.message).toContain("Parse error");

    await running.close();
  });

  it("rejects disallowed origin headers", async () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.MCP_HOST = "0.0.0.0";
    process.env.MCP_PORT = "0";
    delete process.env.MCP_ALLOWED_HOSTS;
    delete process.env.MCP_ALLOWED_ORIGINS;

    const running = await startMcpServer(fakeConfig);
    const response = await sendRawHttpRequest({
      port: running.http?.port ?? 0,
      path: "/health",
      headers: {
        Host: "127.0.0.1",
        Origin: "https://evil.example"
      }
    });

    expect(response.status).toBe(403);
    const payload = JSON.parse(response.body) as { error?: { message?: string } };
    expect(payload.error?.message?.toLowerCase()).toContain("origin");

    await running.close();
  });

  it("rejects malformed JSON-RPC payloads before transport execution", async () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.MCP_HOST = "127.0.0.1";
    process.env.MCP_PORT = "0";

    const running = await startMcpServer(fakeConfig);
    const base = `http://${running.http?.host}:${running.http?.port}`;

    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: "{}"
    });

    expect(res.status).toBe(400);

    const payload = (await res.json()) as { error: { code: number; message: string } };
    expect(payload.error.code).toBe(-32600);
    expect(payload.error.message).toContain("Invalid JSON-RPC");

    await running.close();
  });

  it("enforces /mcp rate limits", async () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.MCP_HOST = "127.0.0.1";
    process.env.MCP_PORT = "0";
    process.env.MCP_RATE_LIMIT_MAX = "2";
    process.env.MCP_RATE_LIMIT_WINDOW_MS = "60000";

    const running = await startMcpServer(fakeConfig);
    const base = `http://${running.http?.host}:${running.http?.port}`;

    const reqInit = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: "{}"
    } as const;

    const first = await fetch(`${base}/mcp`, reqInit);
    const second = await fetch(`${base}/mcp`, reqInit);
    const third = await fetch(`${base}/mcp`, reqInit);

    expect(first.status).toBe(400);
    expect(second.status).toBe(400);
    expect(third.status).toBe(429);

    const payload = (await third.json()) as { error: { message: string } };
    expect(payload.error.message).toContain("Too Many Requests");

    await running.close();
  });

  it("rejects oversized /mcp request bodies with sanitized payloads", async () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.MCP_HOST = "127.0.0.1";
    process.env.MCP_PORT = "0";
    process.env.MCP_MAX_BODY_SIZE_BYTES = "16";

    const running = await startMcpServer(fakeConfig);
    const base = `http://${running.http?.host}:${running.http?.port}`;

    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "ping",
        params: { pad: "this payload is intentionally too large" }
      })
    });

    expect(res.status).toBe(413);
    const payload = (await res.json()) as { error: { message: string } };
    expect(payload.error.message).toContain("too large");

    await running.close();
  });

  it("allows localhost hosts when MCP_HOST is wildcard and no explicit allowlist is set", async () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.MCP_HOST = "0.0.0.0";
    process.env.MCP_PORT = "0";
    delete process.env.MCP_ALLOWED_HOSTS;

    const running = await startMcpServer(fakeConfig);
    const base = `http://127.0.0.1:${running.http?.port}`;

    const healthRes = await fetch(`${base}/health`);
    expect(healthRes.status).toBe(200);

    await running.close();
  });

  it("allows configured runtime hosts when MCP_HOST is wildcard and no explicit allowlist is set", async () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.MCP_HOST = "0.0.0.0";
    process.env.MCP_PORT = "0";
    delete process.env.MCP_ALLOWED_HOSTS;

    const running = await startMcpServer(fakeConfig);
    const response = await sendRawHttpRequest({
      port: running.http?.port ?? 0,
      path: "/health",
      headers: {
        Host: fakeConfig.proxmoxHost
      }
    });

    expect(response.status).toBe(200);

    await running.close();
  });

  it("returns internal error payload when MCP transport handling throws", async () => {
    process.env.MCP_TRANSPORT = "http";
    process.env.MCP_HOST = "127.0.0.1";
    process.env.MCP_PORT = "0";

    const handleSpy = vi
      .spyOn(StreamableHTTPServerTransport.prototype, "handleRequest")
      .mockRejectedValueOnce(new Error("forced transport failure"));

    const running = await startMcpServer(fakeConfig);
    const base = `http://${running.http?.host}:${running.http?.port}`;

    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "ping",
        params: {}
      })
    });

    expect(handleSpy).toHaveBeenCalled();
    expect(res.status).toBe(500);

    const payload = (await res.json()) as { error: { code: number; message: string } };
    expect(payload.error.code).toBe(-32603);
    expect(payload.error.message).toContain("Internal server error");

    await running.close();
  });
});
