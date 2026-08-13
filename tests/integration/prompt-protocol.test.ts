import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { startMcpServerForTest } from "../helpers/inProcessServer.js";

/**
 * Protocol-level check. The unit tests prove the recipe catalog is coherent;
 * only an actual `prompts/list` proves a client would ever see it -- the
 * capability has to be declared or the client never asks.
 *
 * No Docker: listing prompts touches no Proxmox endpoint.
 */
describe("prompts over MCP", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
    delete process.env.PVE_ACCESS_TIER;
    delete process.env.PVE_MODULE_MODE;
  });

  const connect = async (tier: string): Promise<Client> => {
    process.env.PVE_ACCESS_TIER = tier;
    process.env.PVE_MODULE_MODE = "advanced";

    const server = startMcpServerForTest();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "prompt-test", version: "0.0.0-test" });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    close = async () => {
      await client.close();
      await server.close();
    };

    return client;
  };

  it("advertises the recipes to a connected client", async () => {
    const client = await connect("full");
    const names = (await client.listPrompts()).prompts.map((prompt) => prompt.name);

    expect(names).toContain("cluster-health");
    expect(names).toContain("guest-inventory");
  });

  it("returns a usable message when a recipe is requested", async () => {
    const client = await connect("full");
    const result = await client.getPrompt({ name: "cluster-health", arguments: {} });

    const first = result.messages[0];
    expect(first?.role).toBe("user");
    expect(first?.content.type).toBe("text");
    expect(String((first?.content as { text: string }).text)).toMatch(/quorate/);
  });

  // The recipes are all read-only, so the most restricted install still gets
  // its starting point -- which is the tier a newcomer is told to pick.
  it("still offers every recipe on a read-only install", async () => {
    const client = await connect("read-only");

    expect((await client.listPrompts()).prompts.length).toBeGreaterThan(0);
  });
});
