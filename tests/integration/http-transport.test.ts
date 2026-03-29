import { afterEach, describe, expect, it } from "vitest";
import { startMcpServer } from "../../src/server/mcpServer.js";
import type { RuntimeConfig } from "../../src/config/validate.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
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
});
