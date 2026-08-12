import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildRuntimeConfig, resetEmulator, startHarness, waitForTask, type Harness } from "./mcpHarness.js";

/**
 * Walks a realistic Proxmox operator workflow through the MCP server:
 * discover -> create -> start -> exec over SSH -> snapshot -> delete.
 *
 * Every step goes through the real ProxmoxClient and, for the exec step, a real
 * ssh binary against a real sshd. Ordered on purpose: each step depends on the
 * previous one.
 */
describe("proxmox workflow", () => {
  const emulator = inject("emulator");
  let harness: Harness;
  const node = "pve01";
  let createdVmid: number;

  beforeAll(async () => {
    await resetEmulator(emulator);
    harness = await startHarness(buildRuntimeConfig(emulator));
  });

  afterAll(async () => {
    await harness?.close();
  });

  it("registers the full tool surface", async () => {
    const names = await harness.listToolNames();
    expect(names).toContain("pve_list_nodes");
    expect(names).toContain("pve_lxc_create");
    // Advanced module + full tier must be active for the SSH exec tool.
    expect(names).toContain("pve_exec_in_container");
  });

  it("lists cluster nodes", async () => {
    const result = await harness.callTool("pve_list_nodes");
    expect(result.ok).toBe(true);

    const nodes = result.data as Array<{ node: string; status: string }>;
    expect(nodes.map((entry) => entry.node)).toContain("pve01");
  });

  it("allocates the next free vmid", async () => {
    const result = await harness.callTool("pve_get_next_vmid");
    expect(result.ok).toBe(true);
    createdVmid = Number(result.data);
    expect(createdVmid).toBeGreaterThan(0);
  });

  it("creates an LXC container and the task completes", async () => {
    const created = await harness.callTool("pve_lxc_create", {
      node,
      vmid: createdVmid,
      // Required by the tool shape: Proxmox cannot create a CT without a template.
      ostemplate: "local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst",
      hostname: "ct-workflow",
      memory: 512,
      cores: 1
    });

    expect(created.ok).toBe(true);
    const upid = created.data as string;
    expect(upid).toMatch(/^UPID:/);

    const task = await waitForTask(harness, node, upid);
    expect(task.exitstatus).toBe("OK");
  });

  it("shows the new container in the listing", async () => {
    const result = await harness.callTool("pve_list_lxc_containers", { node });
    expect(result.ok).toBe(true);

    const containers = result.data as Array<{ vmid: number }>;
    expect(containers.map((entry) => entry.vmid)).toContain(createdVmid);
  });

  it("starts the container", async () => {
    const started = await harness.callTool("pve_start_lxc_container", { node, vmid: createdVmid });
    expect(started.ok).toBe(true);

    const status = await harness.callTool("pve_get_lxc_status", { node, vmid: createdVmid });
    expect(status.ok).toBe(true);
    expect((status.data as { status: string }).status).toBe("running");
  });

  it("runs an allow-listed diagnostic over SSH", async () => {
    const result = await harness.callTool("pve_run_remote_diagnostic", {
      ctid: createdVmid,
      command: "uname -a"
    });

    expect(result.ok).toBe(true);
    expect((result.data as { stdout: string }).stdout).toContain("Linux");
  });

  it("rejects a diagnostic that is not allow-listed", async () => {
    const result = await harness.callTool("pve_run_remote_diagnostic", {
      ctid: createdVmid,
      command: "rm -rf /"
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DIAGNOSTIC_COMMAND_NOT_ALLOWED");
  });

  it("requires confirmation before arbitrary exec", async () => {
    const result = await harness.callTool("pve_exec_in_container", {
      ctid: createdVmid,
      command: "echo hello-from-ct"
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("CONFIRMATION_REQUIRED");
  });

  it("executes an arbitrary command once confirmed", async () => {
    const result = await harness.callTool("pve_exec_in_container", {
      ctid: createdVmid,
      command: "echo hello-from-ct",
      confirm: true
    });

    expect(result.ok).toBe(true);
    expect((result.data as { stdout: string }).stdout).toContain("hello-from-ct");
  });

  it("preserves quoting through pct exec", async () => {
    const result = await harness.callTool("pve_exec_in_container", {
      ctid: createdVmid,
      command: "echo \"it's quoted\"",
      confirm: true
    });

    expect(result.ok).toBe(true);
    expect((result.data as { stdout: string }).stdout).toContain("it's quoted");
  });

  it("fails exec against a container that does not exist", async () => {
    const result = await harness.callTool("pve_exec_in_container", {
      ctid: 999_99,
      command: "uname -a",
      confirm: true
    });

    expect(result.ok).toBe(false);
  });

  it("creates a snapshot", async () => {
    const result = await harness.callTool("pve_lxc_create_snapshot", {
      node,
      vmid: createdVmid,
      snapname: "pre-change"
    });

    expect(result.ok).toBe(true);
    await waitForTask(harness, node, result.data as string);
  });

  it("stops and deletes the container", async () => {
    const stopped = await harness.callTool("pve_stop_lxc_container", { node, vmid: createdVmid, confirm: true });
    expect(stopped.ok).toBe(true);

    const deleted = await harness.callTool("pve_lxc_delete", { node, vmid: createdVmid, confirm: true });
    expect(deleted.ok).toBe(true);
    await waitForTask(harness, node, deleted.data as string);

    const status = await harness.callTool("pve_get_lxc_status", { node, vmid: createdVmid });
    expect(status.ok).toBe(false);
    expect(status.error?.code).toBe("PROXMOX_NOT_FOUND");
  });

  it("runs the QEMU lifecycle", async () => {
    const vmid = Number((await harness.callTool("pve_get_next_vmid")).data);

    const created = await harness.callTool("pve_qemu_create", { node, vmid, name: "vm-workflow", memory: 1024, cores: 1 });
    expect(created.ok).toBe(true);
    await waitForTask(harness, node, created.data as string);

    const started = await harness.callTool("pve_start_qemu_vm", { node, vmid });
    expect(started.ok).toBe(true);

    const snapshot = await harness.callTool("pve_qemu_create_snapshot", { node, vmid, snapname: "base" });
    expect(snapshot.ok).toBe(true);

    const deleted = await harness.callTool("pve_qemu_delete", { node, vmid, confirm: true });
    expect(deleted.ok).toBe(true);
  });
});
