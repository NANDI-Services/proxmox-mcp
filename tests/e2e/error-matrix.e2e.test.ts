import { createServer } from "node:net";
import { afterEach, describe, expect, inject, it } from "vitest";
import { armFault, buildRuntimeConfig, resetEmulator, startHarness, type Harness } from "./mcpHarness.js";

/**
 * Acceptance matrix for error classification.
 *
 * Before the cause-chain fix every one of these collapsed into
 * UNHANDLED_ERROR ("fetch failed" / "Unexpected token '<'"), which made a down
 * VPN, a self-signed certificate and a bad token indistinguishable.
 */
/** Matches defaultRetryPolicy.maxAttempts for idempotent tools. */
const RETRY_ATTEMPTS = 3;

const findClosedPort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
};

describe("error classification matrix", () => {
  const emulator = inject("emulator");
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    await resetEmulator(emulator);
  });

  it("reports a refused connection distinctly", async () => {
    const closedPort = await findClosedPort();
    harness = await startHarness({ ...buildRuntimeConfig(emulator), proxmoxPort: closedPort });

    const result = await harness.callTool("pve_list_nodes");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("CONNECTION_REFUSED");
    expect(result.error?.message).not.toContain("fetch failed");
  });

  it("reports a DNS failure distinctly", async () => {
    harness = await startHarness({
      ...buildRuntimeConfig(emulator),
      proxmoxHost: "proxmox.invalid.nonexistent.test"
    });

    const result = await harness.callTool("pve_list_nodes");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DNS_RESOLUTION_FAILED");
  });

  it("reports a self-signed certificate as a TLS error", async () => {
    harness = await startHarness({ ...buildRuntimeConfig(emulator), allowInsecureTls: false });

    const result = await harness.callTool("pve_list_nodes");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TLS_ERROR");
    expect(result.error?.hint).toBeDefined();
  });

  it("reports a bad token as an authentication failure", async () => {
    harness = await startHarness({ ...buildRuntimeConfig(emulator), tokenSecret: "wrong-secret-value" });

    const result = await harness.callTool("pve_list_nodes");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PROXMOX_AUTH_FAILED");
    expect(result.error?.hint).toContain("token");
  });

  it("reports an ACL rejection", async () => {
    harness = await startHarness(buildRuntimeConfig(emulator));
    // pve_list_nodes is idempotent and therefore retried; the fault has to
    // cover every attempt or a later one succeeds and masks the failure.
    await armFault(emulator, "403", { count: RETRY_ATTEMPTS });

    const result = await harness.callTool("pve_list_nodes");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PROXMOX_ACL_FORBIDDEN");
  });

  it("reports a server error", async () => {
    harness = await startHarness(buildRuntimeConfig(emulator));
    await armFault(emulator, "500", { count: RETRY_ATTEMPTS });

    const result = await harness.callTool("pve_list_nodes");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PROXMOX_SERVER_ERROR");
  });

  it("reports an HTML proxy page as a server error, not a JSON parse failure", async () => {
    harness = await startHarness(buildRuntimeConfig(emulator));
    await armFault(emulator, "html-proxy", { count: RETRY_ATTEMPTS });

    const result = await harness.callTool("pve_list_nodes");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PROXMOX_SERVER_ERROR");
    expect(result.error?.message).not.toContain("Unexpected token");
  });

  it("reports a non-JSON 200 body as an invalid response", async () => {
    harness = await startHarness(buildRuntimeConfig(emulator));
    await armFault(emulator, "bad-json", { count: RETRY_ATTEMPTS });

    const result = await harness.callTool("pve_list_nodes");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("PROXMOX_INVALID_RESPONSE");
    expect(result.error?.hint).toContain("proxy");
  });

  it("does not retry a non-idempotent create when the server errors", async () => {
    harness = await startHarness(buildRuntimeConfig(emulator));
    // Arm three faults: a retrying tool would consume all of them.
    await armFault(emulator, "500", { count: 3 });

    const result = await harness.callTool("pve_lxc_create", {
      node: "pve01",
      vmid: 777,
      ostemplate: "local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst",
      memory: 512
    });
    expect(result.ok).toBe(false);
    expect(result.meta.retries).toBe(0);

    // Two faults must remain armed, proving only one attempt was made.
    const health = await fetch(`http://127.0.0.1:${emulator.ctrlPort}/_control/health`);
    const body = (await health.json()) as { fault: { remaining: number } };
    expect(body.fault.remaining).toBe(2);
  });
});
