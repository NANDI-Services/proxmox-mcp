import { describe, expect, it } from "vitest";
import { dockerLogsInContainer } from "../../src/tools/operations.js";
import type { NodeRouter } from "../../src/ssh/nodeRouter.js";

/**
 * Any access to this router is a test failure: the container-name check must
 * reject before the tool reaches for the network at all.
 */
const routerThatMustNotBeUsed = new Proxy({} as NodeRouter, {
  get(_target, property) {
    throw new Error(
      `Validation should have rejected the input before touching the router (accessed: ${String(property)})`
    );
  }
});

describe("operations hardening", () => {
  it("rejects unsafe docker container names before remote execution", async () => {
    const result = await dockerLogsInContainer(routerThatMustNotBeUsed, 101, "api; rm -rf /", 100);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_CONTAINER_NAME");
  });

  it("rejects a name with a shell metacharacter", async () => {
    const result = await dockerLogsInContainer(routerThatMustNotBeUsed, 101, "api$(whoami)", 100);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_CONTAINER_NAME");
  });

  it("rejects a name that starts with a dash", async () => {
    const result = await dockerLogsInContainer(routerThatMustNotBeUsed, 101, "-oProxyCommand=x", 100);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_CONTAINER_NAME");
  });
});
