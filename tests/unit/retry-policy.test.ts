import { describe, expect, it } from "vitest";
import { toolCatalog } from "../../src/tools/catalog.js";
import type { ToolExecutionContext } from "../../src/server/toolMetadata.js";

const findTool = (name: string) => {
  const tool = toolCatalog.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Test fixture missing tool: ${name}`);
  }
  return tool;
};

/**
 * Counts how many times the client is asked to perform the request, which is
 * what the retry policy actually controls.
 */
const countingContext = (): { ctx: ToolExecutionContext; attempts: () => number } => {
  let attempts = 0;
  const ctx = {
    client: {
      requestEndpoint: async (): Promise<never> => {
        attempts += 1;
        throw new Error("simulated proxmox failure");
      }
    },
    ssh: {},
    transport: "stdio"
  } as unknown as ToolExecutionContext;

  return { ctx, attempts: () => attempts };
};

describe("retry policy", () => {
  it("retries an idempotent read tool", async () => {
    const { ctx, attempts } = countingContext();
    const result = await findTool("pve_list_nodes").execute({}, ctx);

    expect(result.ok).toBe(false);
    expect(attempts()).toBe(3);
  });

  it("does not retry a non-idempotent create", async () => {
    const { ctx, attempts } = countingContext();
    const result = await findTool("pve_lxc_create").execute({ node: "pve01", vmid: 201, confirm: true }, ctx);

    expect(result.ok).toBe(false);
    expect(attempts()).toBe(1);
  });

  it("does not retry a VM clone", async () => {
    const { ctx, attempts } = countingContext();
    const result = await findTool("pve_qemu_clone").execute(
      { node: "pve01", vmid: 101, newid: 102, confirm: true },
      ctx
    );

    expect(result.ok).toBe(false);
    expect(attempts()).toBe(1);
  });

  it("does not retry a backup run", async () => {
    const { ctx, attempts } = countingContext();
    const result = await findTool("pve_run_backup").execute({ node: "pve01", vmid: 101, confirm: true }, ctx);

    expect(result.ok).toBe(false);
    expect(attempts()).toBe(1);
  });

  it("reports the retry count it actually used", async () => {
    const { ctx } = countingContext();
    const result = await findTool("pve_list_nodes").execute({}, ctx);

    expect(result.meta.retries).toBe(2);
  });

  // Structural invariant. A destructive tool marked idempotent keeps automatic
  // retries, so the combination is only valid for endpoints that are genuinely
  // safe to repeat -- PUTs that set fixed config values. Anything new landing
  // in this set is a deliberate decision, not an accident.
  it("allows destructive+idempotent only for the known config PUTs", () => {
    const destructiveIdempotent = toolCatalog
      .filter((tool) => tool.destructive && tool.idempotent)
      .map((tool) => tool.name)
      .sort();

    expect(destructiveIdempotent).toEqual(["pve_lxc_update_config", "pve_qemu_update_config"]);
  });

  // The create/clone/delete family is the duplicate-resource hazard; none of
  // them may ever be retried.
  it("marks every create, clone, delete and snapshot tool as non-idempotent", () => {
    const offenders = toolCatalog
      .filter((tool) => /_(create|clone|delete|migrate|restore|rollback)(_|$)/.test(tool.name))
      .filter((tool) => tool.idempotent)
      .map((tool) => tool.name);

    expect(offenders).toEqual([]);
  });
});
