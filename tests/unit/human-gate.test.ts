import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startMcpServerForTest, unreachableConfig } from "../helpers/inProcessServer.js";
import { toolCatalog } from "../../src/tools/catalog.js";

/**
 * The guard that puts a person in front of a delete.
 *
 * These assertions are made against the `tools/list` response rather than
 * against the descriptor, because the annotation only does anything if it
 * survives the trip onto the wire. Reading the catalog would pass just as
 * happily with a registry that never emitted the key.
 */

const GATE_KEY = "anthropic/requiresUserInteraction";

type ListedTool = { name: string; _meta?: Record<string, unknown> };

let client: Client;
let listed: Map<string, ListedTool>;

beforeEach(async () => {
  // Everything on, so every tool in the catalog registers. Under the defaults
  // the SSH-backed and advanced-module tools never appear, and an assertion
  // that skips the tools it cannot find passes without checking anything --
  // which is how `pve_exec_in_container`, one of the most dangerous tools here,
  // went unverified the first time this was written.
  //
  // `loadPolicySettings()` reads the environment at registration time, so these
  // have to be set before the server is built, not after.
  process.env.PVE_ACCESS_TIER = "full";
  process.env.PVE_MODULE_MODE = "advanced";

  const server = startMcpServerForTest({ ...unreachableConfig(), sshStrategy: "auto" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  client = new Client({ name: "human-gate-test", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const response = (await client.listTools()) as { tools: ListedTool[] };
  listed = new Map(response.tools.map((tool) => [tool.name, tool]));
});

afterEach(async () => {
  await client.close();
  delete process.env.PVE_ACCESS_TIER;
  delete process.env.PVE_MODULE_MODE;
});

const isGated = (name: string): boolean => listed.get(name)?._meta?.[GATE_KEY] === true;

describe("human approval gate", () => {
  // Guards every `listed.has(...)` filter below: if a tool silently stopped
  // registering, those filters would skip it and report success.
  it("registers every tool in the catalog, so nothing is checked vacuously", () => {
    const absent = toolCatalog
      .flatMap((tool) => [tool.name, ...(tool.aliases ?? [])])
      .filter((name) => !listed.has(name));

    expect(absent).toEqual([]);
  });

  it("marks every confirm-required tool", () => {
    const missing = toolCatalog
      .filter((tool) => tool.confirmRequired)
      .map((tool) => tool.name)
      .filter((name) => listed.has(name) && !isGated(name));

    expect(missing).toEqual([]);
  });

  /**
   * The alias is a second tool name carrying the same power. Registration
   * builds its `_meta` separately, so this is the one way the two halves can
   * drift: `pve_stop_qemu_vm` asking for approval while `stopVM` runs straight
   * through would be worse than no gate at all, because the gate would look
   * present.
   */
  it("marks the aliases of confirm-required tools too", () => {
    const aliases = toolCatalog
      .filter((tool) => tool.confirmRequired)
      .flatMap((tool) => tool.aliases ?? []);

    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases.filter((alias) => listed.has(alias) && !isGated(alias))).toEqual([]);
  });

  it("leaves everything else unmarked", () => {
    const overreach = toolCatalog
      .filter((tool) => !tool.confirmRequired)
      .flatMap((tool) => [tool.name, ...(tool.aliases ?? [])])
      .filter((name) => listed.has(name) && isGated(name));

    expect(overreach).toEqual([]);
  });

  // Starting a guest changes state without destroying anything. Prompting for
  // it is friction that buys nothing, and a guard people resent is a guard
  // people route around.
  it("does not gate starting or resuming a guest", () => {
    for (const name of ["pve_start_qemu_vm", "pve_resume_qemu_vm", "pve_start_lxc_container", "startVM"]) {
      expect(isGated(name)).toBe(false);
    }
  });

  it("gates the operations that destroy or reach inside a guest", () => {
    for (const name of ["pve_qemu_delete", "pve_lxc_delete", "pve_exec_in_container", "stopVM"]) {
      expect(isGated(name)).toBe(true);
    }
  });

  // The value has to be the JSON boolean; anything else is ignored by the
  // client, which would leave the tool silently ungated.
  it("emits the literal boolean true", () => {
    expect(listed.get("pve_qemu_delete")?._meta?.[GATE_KEY]).toBe(true);
  });
});
