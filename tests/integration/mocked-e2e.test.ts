import { describe, expect, it } from "vitest";
import { listContainers, listNodes, listVMs } from "../../src/tools/inventory.js";
import { getNodeStatus } from "../../src/tools/status.js";

const fakeClient = {
  listNodes: async () => [{ node: "pve01", status: "online" }],
  listVms: async () => [{ vmid: 101, name: "vm1", node: "pve01", status: "running" }],
  listContainers: async () => [{ vmid: 201, name: "ct1", node: "pve01", status: "running" }],
  getNodeStatus: async () => ({ cpu: 0.3, mem: 0.4 })
};

describe("mocked e2e", () => {
  it("lists nodes, VMs and CTs", async () => {
    const nodes = await listNodes(fakeClient as never);
    const vms = await listVMs(fakeClient as never);
    const cts = await listContainers(fakeClient as never);

    expect(nodes.ok).toBe(true);
    expect(vms.ok).toBe(true);
    expect(cts.ok).toBe(true);
  });

  it("gets node status", async () => {
    const status = await getNodeStatus(fakeClient as never, "pve01");
    expect(status.ok).toBe(true);
  });
});
