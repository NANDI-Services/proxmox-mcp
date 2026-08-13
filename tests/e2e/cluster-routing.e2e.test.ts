import { afterEach, describe, expect, inject, it } from "vitest";
import { buildRuntimeConfig, resetEmulator, startHarness, type Harness } from "./mcpHarness.js";

/**
 * `pct` is node-local, so reaching a container on a node other than the entry
 * host requires resolving its owner first. The emulator models the three cases
 * an operator actually hits:
 *
 *   CT 201 on pve01 -- the entry node, no routing needed
 *   CT 202 on pve02 -- reachable only from inside the cluster network (hop)
 *   CT 203 on pve03 -- not reachable by any route (must fail clearly)
 */
describe("cluster node routing", () => {
  const emulator = inject("emulator");
  let harness: Harness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
    await resetEmulator(emulator);
  });

  it("detects a cluster and its members", async () => {
    harness = await startHarness(buildRuntimeConfig(emulator));

    const result = await harness.callTool("pve_get_cluster_status");
    expect(result.ok).toBe(true);

    const entries = result.data as Array<{ type: string; name: string; quorate?: number }>;
    const cluster = entries.find((entry) => entry.type === "cluster");
    const nodes = entries.filter((entry) => entry.type === "node");

    expect(cluster?.name).toBe("emu-cluster");
    expect(cluster?.quorate).toBe(1);
    expect(nodes.map((node) => node.name).sort()).toEqual(["pve01", "pve02", "pve03"]);
  });

  it("sees guests on every node through the cluster-wide API", async () => {
    harness = await startHarness(buildRuntimeConfig(emulator));

    const result = await harness.callTool("pve_list_cluster_resources", { type: "vm" });
    expect(result.ok).toBe(true);

    const resources = result.data as Array<{ vmid: number; node: string }>;
    const byVmid = new Map(resources.map((entry) => [entry.vmid, entry.node]));

    expect(byVmid.get(201)).toBe("pve01");
    expect(byVmid.get(202)).toBe("pve02");
    expect(byVmid.get(203)).toBe("pve03");
  });

  it("executes directly on the entry node without routing", async () => {
    harness = await startHarness(buildRuntimeConfig(emulator));

    const result = await harness.callTool("pve_exec_in_container", {
      ctid: 201,
      command: "echo on-entry-node",
      confirm: true
    });

    expect(result.ok).toBe(true);
    const data = result.data as { stdout: string; node: string; route: string };
    expect(data.stdout).toContain("on-entry-node");
    expect(data.node).toBe("pve01");
    expect(data.route).toBe("direct");
  });

  // The heart of the fix: before node resolution this returned
  // "Configuration file 'nodes/pve01/lxc/202.conf' does not exist".
  it("reaches a container on another node by hopping through the entry node", async () => {
    harness = await startHarness(buildRuntimeConfig(emulator));

    const result = await harness.callTool("pve_exec_in_container", {
      ctid: 202,
      command: "echo on-second-node",
      confirm: true
    });

    expect(result.ok).toBe(true);
    const data = result.data as { stdout: string; node: string; route: string };
    expect(data.stdout).toContain("on-second-node");
    expect(data.node).toBe("pve02");
    expect(data.route).toBe("hop");
  });

  it("uses a direct connection when the node has an explicit address", async () => {
    harness = await startHarness({
      ...buildRuntimeConfig(emulator),
      sshNodes: {
        pve02: { host: "127.0.0.1", port: emulator.ssh2Port }
      }
    });

    const result = await harness.callTool("pve_exec_in_container", {
      ctid: 202,
      command: "echo direct-to-second-node",
      confirm: true
    });

    expect(result.ok).toBe(true);
    const data = result.data as { stdout: string; node: string; route: string };
    expect(data.stdout).toContain("direct-to-second-node");
    expect(data.node).toBe("pve02");
    expect(data.route).toBe("direct");
  });

  it("runs an allow-listed diagnostic on a remote node", async () => {
    harness = await startHarness(buildRuntimeConfig(emulator));

    const result = await harness.callTool("pve_run_remote_diagnostic", { ctid: 202, command: "uname -a" });

    expect(result.ok).toBe(true);
    expect((result.data as { node: string }).node).toBe("pve02");
  });

  it("fails clearly when no route to the owning node exists", async () => {
    harness = await startHarness(buildRuntimeConfig(emulator));

    const result = await harness.callTool("pve_exec_in_container", {
      ctid: 203,
      command: "echo unreachable",
      confirm: true
    });

    expect(result.ok).toBe(false);
    // Must name the node, so the operator knows which one to look at.
    expect(`${result.error?.message}`).toContain("pve03");
  });

  it("reports an unknown guest distinctly", async () => {
    harness = await startHarness(buildRuntimeConfig(emulator));

    const result = await harness.callTool("pve_exec_in_container", {
      ctid: 4242,
      command: "echo nope",
      confirm: true
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("GUEST_NOT_FOUND");
  });

  it("reports SSH being disabled instead of failing obscurely", async () => {
    harness = await startHarness({ ...buildRuntimeConfig(emulator), sshStrategy: "disabled" });

    const result = await harness.callTool("pve_exec_in_container", {
      ctid: 201,
      command: "echo nope",
      confirm: true
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("SSH_DISABLED");
    expect(result.error?.hint).toContain("sshStrategy");
  });
});
